'use strict';
/**
 * historicoCorridas.service.js — Consulta avançada, filtrada, ordenada e paginada
 * de corridas e histórico, respeitando rigorosamente permissões por perfil.
 */

const corridasRepository = require('./corridas.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const expiracaoCorridaService = require('./expiracaoCorrida.service');
const AppError = require('../utils/AppError');
const { readCache } = require('../utils/readCache');
const { STATUS_CORRIDA, ORIGEM_CANCELAMENTO } = require('../utils/constants');
const { classificarPontualidadeCorrida } = require('./indicadorAtraso');

const CACHE_TTL_HISTORICO_MS = 10000;

const ESCOPOS_VALIDOS = Object.freeze(['TODAS', 'ATIVAS', 'HISTORICO']);
const STATUS_VALIDOS = Object.freeze(Object.values(STATUS_CORRIDA));
const CANCELADO_POR_VALIDOS = Object.freeze(Object.values(ORIGEM_CANCELAMENTO));
const ORDENACOES_VALIDAS = Object.freeze(['dataHorario', 'criadaEm', 'valor']);
const DIRECOES_VALIDAS = Object.freeze(['asc', 'desc']);

function lerBooleanoFiltro(valor, nomeCampo) {
  if (valor === undefined || valor === null || valor === '') return false;
  if (typeof valor === 'boolean') return valor;
  const s = String(valor).trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  throw new AppError(`Parâmetro booleano inválido para '${nomeCampo}'. Use true ou false.`, 400);
}

function lerDataFiltro(valor, nomeCampo, fimDoDia = false) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return null;
  const texto = String(valor).trim();

  // Formato apenas data YYYY-MM-DD interpretado no fuso de negócio (America/Sao_Paulo, UTC-3)
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    const sufixo = fimDoDia ? 'T23:59:59.999-03:00' : 'T00:00:00.000-03:00';
    const d = new Date(`${texto}${sufixo}`);
    if (Number.isNaN(d.getTime())) {
      throw new AppError(`Data inválida em '${nomeCampo}'.`, 400);
    }
    return d;
  }

  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(`Data/horário inválido em '${nomeCampo}'.`, 400);
  }
  return d;
}

function limparTextoOpcional(valor, nomeCampo, max = 150) {
  if (valor === undefined || valor === null) return null;
  const limpo = String(valor).trim();
  if (!limpo) return null;
  if (limpo.length > max) {
    throw new AppError(`O filtro '${nomeCampo}' excede o limite de ${max} caracteres.`, 400);
  }
  return limpo;
}

class HistoricoCorridasService {
  /**
   * Valida e normaliza todos os filtros de consulta/exportação, incorporando a
   * identidade e o perfil do usuário autenticado para isolamento no banco.
   */
  validarENormalizarFiltros(query = {}, usuarioLogado = null, { maxLimit = 100, defaultLimit = 15 } = {}) {
    if (!usuarioLogado || !usuarioLogado.id) {
      throw new AppError('Autenticação obrigatória para consultar corridas.', 401);
    }

    const escopoBruto = query.escopo ? String(query.escopo).trim().toUpperCase() : 'TODAS';
    if (!ESCOPOS_VALIDOS.includes(escopoBruto)) {
      throw new AppError(`Escopo inválido: '${query.escopo}'. Use TODAS, ATIVAS ou HISTORICO.`, 400);
    }

    let status = null;
    if (query.status !== undefined && query.status !== null && String(query.status).trim() !== '') {
      status = String(query.status).trim().toUpperCase();
      if (!STATUS_VALIDOS.includes(status)) {
        throw new AppError(`Status inválido: '${query.status}'.`, 400);
      }
    }

    let canceladoPor = null;
    if (query.canceladoPor !== undefined && query.canceladoPor !== null && String(query.canceladoPor).trim() !== '') {
      const bruto = String(query.canceladoPor).trim().toUpperCase();
      canceladoPor = bruto === 'USUARIO' ? ORIGEM_CANCELAMENTO.PASSAGEIRO : bruto;
      if (!CANCELADO_POR_VALIDOS.includes(canceladoPor)) {
        throw new AppError(`Filtro canceladoPor inválido: '${query.canceladoPor}'. Use MOTORISTA, PASSAGEIRO ou SISTEMA.`, 400);
      }
    }

    const dataInicio = lerDataFiltro(query.dataInicio, 'dataInicio', false);
    const dataFim = lerDataFiltro(query.dataFim, 'dataFim', true);
    if (dataInicio && dataFim && dataInicio.getTime() > dataFim.getTime()) {
      throw new AppError('O período inicial (dataInicio) não pode ser posterior ao período final (dataFim).', 400);
    }

    const ordenarPor = query.ordenarPor ? String(query.ordenarPor).trim() : 'dataHorario';
    if (!ORDENACOES_VALIDAS.includes(ordenarPor)) {
      throw new AppError(`Campo de ordenação inválido: '${query.ordenarPor}'. Use dataHorario, criadaEm ou valor.`, 400);
    }

    const direcao = query.direcao ? String(query.direcao).trim().toLowerCase() : 'desc';
    if (!DIRECOES_VALIDAS.includes(direcao)) {
      throw new AppError(`Direção de ordenação inválida: '${query.direcao}'. Use asc ou desc.`, 400);
    }

    const pageBruto = query.page !== undefined && query.page !== '' ? Number(query.page) : 1;
    if (!Number.isInteger(pageBruto) || pageBruto < 1) {
      throw new AppError('O parâmetro page deve ser um número inteiro maior ou igual a 1.', 400);
    }

    const limitBruto = query.limit !== undefined && query.limit !== '' ? Number(query.limit) : defaultLimit;
    if (!Number.isInteger(limitBruto) || limitBruto < 1 || limitBruto > maxLimit) {
      throw new AppError(`O parâmetro limit deve ser um número inteiro entre 1 e ${maxLimit}.`, 400);
    }

    // Passageiro nunca pode filtrar corridas de terceiros; filtro `passageiro` é ignorado para USUARIO
    const perfil = usuarioLogado.perfil;
    const passageiroFiltro = perfil === 'USUARIO'
      ? null
      : limparTextoOpcional(query.passageiro, 'passageiro', 150);

    // Motorista consulta apenas corridas vinculadas a ele; filtro `motorista` externo é ignorado para MOTORISTA
    const motoristaFiltro = perfil === 'MOTORISTA'
      ? null
      : limparTextoOpcional(query.motorista, 'motorista', 150);

    return {
      usuarioLogadoId: usuarioLogado.id,
      perfil,
      escopo: escopoBruto,
      id: limparTextoOpcional(query.id, 'id', 64),
      status,
      dataInicio,
      dataFim,
      origem: limparTextoOpcional(query.origem, 'origem', 150),
      destino: limparTextoOpcional(query.destino, 'destino', 150),
      motorista: motoristaFiltro,
      passageiro: passageiroFiltro,
      veiculo: limparTextoOpcional(query.veiculo, 'veiculo', 150),
      canceladoPor,
      atrasadas: lerBooleanoFiltro(query.atrasadas, 'atrasadas'),
      finalizadas: lerBooleanoFiltro(query.finalizadas, 'finalizadas'),
      canceladas: lerBooleanoFiltro(query.canceladas, 'canceladas'),
      expiradas: lerBooleanoFiltro(query.expiradas, 'expiradas'),
      ordenarPor,
      direcao,
      page: pageBruto,
      limit: limitBruto,
    };
  }

  enriquecerRegistroCorrida(corrida, agora = new Date()) {
    const pontualidade = classificarPontualidadeCorrida(corrida, agora);
    const json = typeof corrida.toResumo === 'function'
      ? {
          ...corrida.toResumo(),
          passageiro: corrida.passageiro || null,
          motorista: corrida.motorista || null,
        }
      : { ...corrida };

    return {
      ...json,
      pontualidade,
      duracaoEfetivaMin: pontualidade.duracaoEfetivaMin,
    };
  }

  /**
   * Consulta paginada de histórico/listagem avançada de corridas.
   */
  async consultar(query = {}, usuarioLogado = null) {
    const filtros = this.validarENormalizarFiltros(query, usuarioLogado);

    if (typeof expiracaoCorridaService.dispararVerificacaoEmBackground === 'function') {
      await expiracaoCorridaService.dispararVerificacaoEmBackground();
    }

    if (filtros.perfil === 'MOTORISTA') {
      const motorista = await motoristasRepository.findByUsuarioId(filtros.usuarioLogadoId);
      if (!motorista) {
        return {
          data: [],
          meta: {
            total: 0,
            page: filtros.page,
            limit: filtros.limit,
            totalPages: 1,
            escopo: filtros.escopo,
            ordenarPor: filtros.ordenarPor,
            direcao: filtros.direcao,
            resumo: {
              total: 0,
              ativas: 0,
              finalizadas: 0,
              canceladas: 0,
              expiradas: 0,
              atrasadas: 0,
              valorTotalRegistrado: 0,
              valorTotalFinalizado: 0,
              distanciaTotalKm: 0,
            },
          },
        };
      }
    }

    const chaveCache = `corridas:historico:${JSON.stringify({
      u: filtros.usuarioLogadoId,
      p: filtros.perfil,
      ...filtros,
      dataInicio: filtros.dataInicio ? filtros.dataInicio.toISOString() : null,
      dataFim: filtros.dataFim ? filtros.dataFim.toISOString() : null,
    })}`;

    return readCache.obterOuCarregar(chaveCache, CACHE_TTL_HISTORICO_MS, async () => {
      const agora = new Date();
      const { registros, resumo } = await corridasRepository.consultarComFiltros(filtros, agora);
      const data = registros.map((c) => this.enriquecerRegistroCorrida(c, agora));
      const totalPages = Math.max(1, Math.ceil(resumo.total / filtros.limit));

      return {
        data,
        meta: {
          total: resumo.total,
          page: filtros.page,
          limit: filtros.limit,
          totalPages,
          escopo: filtros.escopo,
          ordenarPor: filtros.ordenarPor,
          direcao: filtros.direcao,
          resumo,
        },
      };
    });
  }
}

module.exports = new HistoricoCorridasService();
