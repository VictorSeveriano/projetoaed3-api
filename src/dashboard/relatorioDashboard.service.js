'use strict';
/**
 * relatorioDashboard.service.js — Exportação analítica do Dashboard em CSV e PDF,
 * respeitando integralmente os filtros ativos (`dataInicio`, `dataFim`, `status`, `classe`).
 */

const dashboardService = require('./dashboard.service');
const { gerarPdfRelatorio } = require('../utils/pdfBuilder');
const {
  validarFormatoExportacao,
  formatarDataHoraBr,
  formatarDataCurtaBr,
  formatarMoedaBr,
  montarCsvComBom,
  gerarCarimboArquivo,
} = require('../utils/exportacaoHelper');

const STATUS_LABELS = Object.freeze({
  SOLICITADA: 'Solicitada',
  CONFIRMADA: 'Confirmada',
  EM_ANDAMENTO: 'Em andamento',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
});

const CLASSE_LABELS = Object.freeze({
  BASICO: 'Básico',
  NORMAL: 'Normal',
  PREMIUM: 'Premium',
});

function descreverFiltrosDashboard(filtrosNorm, queryOriginal = {}) {
  const partes = [];
  if (queryOriginal.dataInicio || queryOriginal.dataFim) {
    const ini = filtrosNorm.dataInicio ? formatarDataCurtaBr(filtrosNorm.dataInicio) : 'Início';
    const fim = filtrosNorm.dataFim ? formatarDataCurtaBr(filtrosNorm.dataFim) : 'Atual';
    partes.push(`Período: ${ini} até ${fim}`);
  }
  if (filtrosNorm.status) {
    partes.push(`Status: ${STATUS_LABELS[filtrosNorm.status] || filtrosNorm.status}`);
  }
  if (filtrosNorm.classe) {
    partes.push(`Classe: ${CLASSE_LABELS[filtrosNorm.classe] || filtrosNorm.classe}`);
  }
  return partes.length > 0 ? partes.join(' | ') : 'Visão global (sem filtros aplicados)';
}

class RelatorioDashboardService {
  async exportar(query = {}, usuarioLogado = null) {
    const formato = validarFormatoExportacao(query.formato);
    const filtrosNorm = dashboardService.validarFiltros(query);
    const dados = await dashboardService.getCompleto(query);

    // Calcula também destinos caso não tenha vindo no payload padrão sem filtro
    let destinos = dados.destinos;
    if (!destinos) {
      destinos = await dashboardService.getDestinosMaisSolicitados();
    }

    const agora = new Date();
    const carimbo = gerarCarimboArquivo(agora);
    const textoFiltros = descreverFiltrosDashboard(filtrosNorm, query);

    if (formato === 'csv') {
      const csv = this._gerarCsv(dados, destinos || [], textoFiltros, usuarioLogado, agora);
      return {
        buffer: Buffer.from(csv, 'utf8'),
        contentType: 'text/csv; charset=utf-8',
        filename: `relatorio-dashboard-corridas-ucl-${carimbo}.csv`,
      };
    }

    const pdf = this._gerarPdf(dados, destinos || [], textoFiltros, usuarioLogado, agora);
    return {
      buffer: pdf,
      contentType: 'application/pdf',
      filename: `relatorio-dashboard-corridas-ucl-${carimbo}.pdf`,
    };
  }

  _gerarCsv(dados, destinos, textoFiltros, usuarioLogado, agora) {
    const { resumo, faturamento, corridas, rotas, origens, veiculos } = dados;
    const linhas = [
      ['RELATÓRIO ANALÍTICO DO DASHBOARD — CORRIDAS UCL'],
      ['Emitido em', formatarDataHoraBr(agora)],
      ['Emitido por', usuarioLogado?.nome || 'Administrador'],
      ['Filtros aplicados', textoFiltros],
      [],
      ['INDICADOR GERAL (KPI)', 'VALOR'],
      ['Faturamento Total', formatarMoedaBr(resumo.faturamentoTotal)],
      ['Total de Corridas', String(resumo.totalCorridas)],
      ['Corridas Ativas', String(resumo.corridasAtivas)],
      ['Veículos Disponíveis', String(resumo.veiculosDisponiveis)],
      ['Total de Veículos Considerados', String(resumo.totalVeiculos)],
      [],
      ['DESEMPENHO MENSAL', 'CORRIDAS', 'FATURAMENTO (R$)'],
    ];

    for (let i = 0; i < corridas.length; i++) {
      const itemMes = corridas[i];
      const itemFat = faturamento[i] || { valor: 0 };
      linhas.push([
        itemMes.mes,
        String(itemMes.quantidade || 0),
        Number(itemFat.valor || 0).toFixed(2).replace('.', ','),
      ]);
    }

    linhas.push([]);
    linhas.push(['ROTAS MAIS UTILIZADAS', 'CORRIDAS']);
    if (rotas.length === 0) {
      linhas.push(['Nenhuma rota registrada no filtro', '0']);
    } else {
      for (const r of rotas) linhas.push([r.nome, String(r.quantidade)]);
    }

    linhas.push([]);
    linhas.push(['ORIGENS MAIS SOLICITADAS', 'SOLICITAÇÕES']);
    if (origens.length === 0) {
      linhas.push(['Nenhuma origem registrada no filtro', '0']);
    } else {
      for (const o of origens) linhas.push([o.nome, String(o.quantidade)]);
    }

    linhas.push([]);
    linhas.push(['DESTINOS MAIS SOLICITADOS', 'SOLICITAÇÕES']);
    if (destinos.length === 0) {
      linhas.push(['Nenhum destino registrado no filtro', '0']);
    } else {
      for (const d of destinos) linhas.push([d.nome, String(d.quantidade)]);
    }

    linhas.push([]);
    linhas.push(['VEÍCULOS MAIS ALOCADOS', 'CORRIDAS']);
    if (veiculos.length === 0) {
      linhas.push(['Nenhum veículo alocado no filtro', '0']);
    } else {
      for (const v of veiculos) linhas.push([v.nome, String(v.quantidade)]);
    }

    return montarCsvComBom(linhas);
  }

  _gerarPdf(dados, destinos, textoFiltros, usuarioLogado, agora) {
    const { resumo, faturamento, corridas, rotas, origens, veiculos } = dados;

    const cardsResumo = [
      { rotulo: 'Faturamento Total', valor: formatarMoedaBr(resumo.faturamentoTotal) },
      { rotulo: 'Total de Corridas', valor: String(resumo.totalCorridas) },
      { rotulo: 'Corridas Ativas', valor: String(resumo.corridasAtivas) },
      { rotulo: 'Veículos Disponíveis', valor: String(resumo.veiculosDisponiveis) },
      { rotulo: 'Frota Considerada', valor: String(resumo.totalVeiculos) },
    ];

    // Soma = 777.89 pt (A4 Paisagem útil)
    const colunas = [
      { chave: 'secao', titulo: 'Categoria / Série Analítica', largura: 165, maxLinhas: 2 },
      { chave: 'item', titulo: 'Referência (Mês / Rota / Local / Veículo)', largura: 350, maxLinhas: 2 },
      { chave: 'volume', titulo: 'Volume / Solicitações', largura: 130, maxLinhas: 1 },
      { chave: 'receita', titulo: 'Faturamento / Detalhe', largura: 132.89, maxLinhas: 1 },
    ];

    const linhasTabela = [];

    for (let i = 0; i < corridas.length; i++) {
      const m = corridas[i];
      const f = faturamento[i] || { valor: 0 };
      linhasTabela.push({
        secao: 'Desempenho Mensal',
        item: m.mes,
        volume: `${m.quantidade} corrida(s)`,
        receita: formatarMoedaBr(f.valor),
      });
    }

    for (let i = 0; i < rotas.length; i++) {
      linhasTabela.push({
        secao: `Top Rotas (#${i + 1})`,
        item: rotas[i].nome,
        volume: `${rotas[i].quantidade} corrida(s)`,
        receita: 'Trajeto frequente',
      });
    }

    for (let i = 0; i < origens.length; i++) {
      linhasTabela.push({
        secao: `Top Origens (#${i + 1})`,
        item: origens[i].nome,
        volume: `${origens[i].quantidade} solicitação(ões)`,
        receita: 'Origem frequente',
      });
    }

    for (let i = 0; i < destinos.length; i++) {
      linhasTabela.push({
        secao: `Top Destinos (#${i + 1})`,
        item: destinos[i].nome,
        volume: `${destinos[i].quantidade} solicitação(ões)`,
        receita: 'Destino frequente',
      });
    }

    for (let i = 0; i < veiculos.length; i++) {
      linhasTabela.push({
        secao: `Top Veículos (#${i + 1})`,
        item: veiculos[i].nome,
        volume: `${veiculos[i].quantidade} alocação(ões)`,
        receita: 'Frota ativa',
      });
    }

    return gerarPdfRelatorio({
      titulo: 'Corridas UCL — Relatório Analítico do Dashboard',
      subtitulo: `Emitido em ${formatarDataHoraBr(agora)} • Administrador${usuarioLogado?.nome ? ` (${usuarioLogado.nome})` : ''}`,
      linhasFiltro: [`Filtros aplicados: ${textoFiltros}`],
      cardsResumo,
      colunas,
      linhas: linhasTabela,
      rodapeNota: 'Indicadores consolidados conforme os filtros ativos no Dashboard.',
    });
  }
}

module.exports = new RelatorioDashboardService();
