'use strict';
/**
 * dashboard.service.js — Métricas e indicadores do sistema de corridas,
 * com suporte a recortes opcionais (período, status e classe) compartilhados
 * entre a tela de Dashboard e a exportação de relatórios.
 */

const prisma = require('../database/prisma');
const corridasRepository = require('../corridas/corridas.repository');
const veiculosRepository = require('../veiculos/veiculos.repository');
const AppError = require('../utils/AppError');
const { paraNumeroOuNull } = require('../utils/prismaMappers');
const { readCache } = require('../utils/readCache');
const { STATUS_CORRIDA, CLASSES_VALIDAS } = require('../utils/constants');

const CACHE_TTL_MS = 30000;
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const STATUS_VALIDOS = Object.freeze(Object.values(STATUS_CORRIDA));

function lerDataFiltroDashboard(valor, nomeCampo, fimDoDia = false) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const texto = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const sufixo = fimDoDia ? 'T23:59:59.999-03:00' : 'T00:00:00.000-03:00';
    const d = new Date(`${texto}${sufixo}`);
    if (Number.isNaN(d.getTime())) throw new AppError(`Data inválida em '${nomeCampo}'.`, 400);
    return d;
  }
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) throw new AppError(`Data inválida em '${nomeCampo}'.`, 400);
  return d;
}

class DashboardService {
  invalidarCache() {
    readCache.invalidarPrefixo('dashboard:');
  }

  validarFiltros(query = {}) {
    const dataInicio = lerDataFiltroDashboard(query.dataInicio, 'dataInicio', false);
    const dataFim = lerDataFiltroDashboard(query.dataFim, 'dataFim', true);
    if (dataInicio && dataFim && dataInicio.getTime() > dataFim.getTime()) {
      throw new AppError('O período inicial (dataInicio) não pode ser posterior ao período final (dataFim).', 400);
    }

    let status = null;
    if (query.status !== undefined && query.status !== null && String(query.status).trim() !== '') {
      status = String(query.status).trim().toUpperCase();
      if (!STATUS_VALIDOS.includes(status)) {
        throw new AppError(`Status inválido para filtro do dashboard: '${query.status}'.`, 400);
      }
    }

    let classe = null;
    if (query.classe !== undefined && query.classe !== null && String(query.classe).trim() !== '') {
      classe = String(query.classe).trim().toUpperCase();
      if (!CLASSES_VALIDAS.includes(classe)) {
        throw new AppError(`Classe inválida para filtro do dashboard: '${query.classe}'.`, 400);
      }
    }

    return {
      dataInicio,
      dataFim,
      status,
      classe,
      possuiFiltro: Boolean(dataInicio || dataFim || status || classe),
    };
  }

  _aplicarFiltrosEmMemoria(corridas, carros, filtrosNorm) {
    if (!filtrosNorm || !filtrosNorm.possuiFiltro) {
      return { corridas, carros };
    }

    const corridasFiltradas = corridas.filter((c) => {
      if (filtrosNorm.status && c.status !== filtrosNorm.status) return false;
      if (filtrosNorm.classe && (c.classe || 'NORMAL') !== filtrosNorm.classe) return false;
      if (filtrosNorm.dataInicio || filtrosNorm.dataFim) {
        const t = new Date(c.dataHorario).getTime();
        if (Number.isNaN(t)) return false;
        if (filtrosNorm.dataInicio && t < filtrosNorm.dataInicio.getTime()) return false;
        if (filtrosNorm.dataFim && t > filtrosNorm.dataFim.getTime()) return false;
      }
      return true;
    });

    const carrosFiltrados = filtrosNorm.classe
      ? carros.filter((v) => !v.classe || v.classe === filtrosNorm.classe)
      : carros;

    return { corridas: corridasFiltradas, carros: carrosFiltrados };
  }

  _buscarCorridasFonte() {
    return typeof corridasRepository.findAllParaDashboard === 'function'
      ? corridasRepository.findAllParaDashboard()
      : corridasRepository.findAll();
  }

  _buscarVeiculosFonte() {
    return typeof veiculosRepository.findAllParaDashboard === 'function'
      ? veiculosRepository.findAllParaDashboard()
      : veiculosRepository.findAll();
  }

  /**
   * Busca corridas e veículos resumidos em uma ÚNICA consulta SQL.
   */
  async _obterFontesUnificadas() {
    if (process.env.NODE_ENV === 'test' || typeof prisma.$queryRaw !== 'function') {
      const [corridas, carros] = await Promise.all([
        this._buscarCorridasFonte(),
        this._buscarVeiculosFonte(),
      ]);
      return { corridas, carros };
    }

    return readCache.obterOuCarregar('dashboard:fontes', CACHE_TTL_MS, async () => {
      const rows = await prisma.$queryRaw`
        SELECT
          COALESCE((
            SELECT json_agg(json_build_object(
              'status', c."status",
              'classe', c."classe",
              'valor', c."valor",
              'dataHorario', c."data_horario",
              'origemNome', c."origem_nome",
              'destinoNome', c."destino_nome",
              'veiculoId', c."veiculo_id"
            ))
            FROM "corridas" c
          ), '[]'::json) AS "corridas",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', v."id",
              'status', v."status",
              'classe', v."classe",
              'marca', v."marca",
              'modelo', v."modelo"
            ))
            FROM "veiculos" v
            WHERE v."status_aprovacao" <> 'EXCLUIDO'
          ), '[]'::json) AS "veiculos"
      `;

      const registro = rows[0] || {};
      const corridasRaw = Array.isArray(registro.corridas) ? registro.corridas : [];
      const carros = Array.isArray(registro.veiculos) ? registro.veiculos : [];
      const corridas = corridasRaw.map((c) => ({
        ...c,
        valor: c.valor != null ? paraNumeroOuNull(c.valor) : 0,
      }));
      return { corridas, carros };
    });
  }

  async _obterCorridas() {
    if (process.env.NODE_ENV === 'test') {
      return this._buscarCorridasFonte();
    }
    const { corridas } = await this._obterFontesUnificadas();
    return corridas;
  }

  async _obterVeiculos() {
    if (process.env.NODE_ENV === 'test') {
      return this._buscarVeiculosFonte();
    }
    const { carros } = await this._obterFontesUnificadas();
    return carros;
  }

  _calcularResumo(corridas, carros) {
    let corridasAtivas   = 0;
    let faturamentoTotal = 0;

    for (const c of corridas) {
      if (c.status === 'CONFIRMADA' || c.status === 'EM_ANDAMENTO') corridasAtivas++;
      if (c.status !== 'CANCELADA') faturamentoTotal += c.valor || 0;
    }

    let veiculosDisponiveis = 0;
    for (const v of carros) {
      if (v.status === 'DISPONIVEL') veiculosDisponiveis++;
    }

    return {
      totalCorridas:    corridas.length,
      corridasAtivas,
      faturamentoTotal: parseFloat(faturamentoTotal.toFixed(2)),
      veiculosDisponiveis,
      totalVeiculos:    carros.length,
    };
  }

  _calcularCorridasPorMes(corridas) {
    const contagem = Array(12).fill(0);
    for (const c of corridas) {
      if (c.status !== 'CANCELADA') {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) contagem[mesIndex]++;
      }
    }
    return MESES.map((mes, index) => ({ mes, quantidade: contagem[index] }));
  }

  _calcularOrigens(corridas) {
    const contagem = {};
    for (const c of corridas) {
      if (c.origemNome) contagem[c.origemNome] = (contagem[c.origemNome] || 0) + 1;
    }
    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  _calcularDestinos(corridas) {
    const contagem = {};
    for (const c of corridas) {
      if (c.destinoNome) contagem[c.destinoNome] = (contagem[c.destinoNome] || 0) + 1;
    }
    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  _calcularRotas(corridas) {
    const contagem = {};
    for (const c of corridas) {
      if (c.origemNome && c.destinoNome && c.status !== 'CANCELADA') {
        const chave = c.origemNome + ' -> ' + c.destinoNome;
        contagem[chave] = (contagem[chave] || 0) + 1;
      }
    }
    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  _calcularVeiculos(corridas, carros) {
    const contagem = {};
    for (const c of corridas) {
      if (c.veiculoId) contagem[c.veiculoId] = (contagem[c.veiculoId] || 0) + 1;
    }
    const carrosPorId = new Map(carros.map((c) => [c.id, c]));
    return Object.entries(contagem)
      .map(([veiculoId, quantidade]) => {
        const carro = carrosPorId.get(veiculoId);
        const nome  = carro ? (carro.marca + ' ' + carro.modelo) : 'Veículo Desconhecido';
        return { nome, quantidade };
      })
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  _calcularFaturamento(corridas) {
    const receitas = Array(12).fill(0);
    for (const c of corridas) {
      if (c.status !== 'CANCELADA' && c.valor) {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) receitas[mesIndex] += c.valor;
      }
    }
    return MESES.map((mes, index) => ({ mes, valor: parseFloat(receitas[index].toFixed(2)) }));
  }

  /**
   * Retorna todas as métricas e séries do Dashboard em uma única chamada consolidada,
   * aplicando filtros opcionais (`dataInicio`, `dataFim`, `status`, `classe`).
   */
  async getCompleto(queryFiltros = {}) {
    const filtrosNorm = this.validarFiltros(queryFiltros);
    const fontesBase = await this._obterFontesUnificadas();
    const { corridas, carros } = this._aplicarFiltrosEmMemoria(
      fontesBase.corridas,
      fontesBase.carros,
      filtrosNorm
    );

    const resultado = {
      resumo:      this._calcularResumo(corridas, carros),
      faturamento: this._calcularFaturamento(corridas),
      corridas:    this._calcularCorridasPorMes(corridas),
      rotas:       this._calcularRotas(corridas),
      origens:     this._calcularOrigens(corridas),
      veiculos:    this._calcularVeiculos(corridas, carros),
    };

    if (filtrosNorm.possuiFiltro) {
      resultado.destinos = this._calcularDestinos(corridas);
    }
    return resultado;
  }

  async getResumo() {
    const { corridas, carros } = await this._obterFontesUnificadas();
    return this._calcularResumo(corridas, carros);
  }

  async getCorridasPorMes() {
    const corridas = await this._obterCorridas();
    return this._calcularCorridasPorMes(corridas);
  }

  async getOrigensMaisSolicitadas() {
    const corridas = await this._obterCorridas();
    return this._calcularOrigens(corridas);
  }

  async getDestinosMaisSolicitados() {
    const corridas = await this._obterCorridas();
    return this._calcularDestinos(corridas);
  }

  async getRotasMaisUtilizadas() {
    const corridas = await this._obterCorridas();
    return this._calcularRotas(corridas);
  }

  async getVeiculosMaisUtilizados() {
    const { corridas, carros } = await this._obterFontesUnificadas();
    return this._calcularVeiculos(corridas, carros);
  }

  async getFaturamentoMensal() {
    const corridas = await this._obterCorridas();
    return this._calcularFaturamento(corridas);
  }
}

module.exports = new DashboardService();
