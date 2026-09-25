'use strict';
/**
 * relatorio.motorista.service.js — Agregação de métricas mensais do motorista.
 * Async para suportar o repositório PostgreSQL.
 */

const corridasRepository = require('../corridas/corridas.repository');

class RelatorioMotoristaService {
  async gerarRelatorioMensal(motoristaId, mes, ano) {
    const corridas = await corridasRepository.findByMotoristaIdAndPeriodo(motoristaId, mes, ano);

    const finalizadas = corridas.filter((c) => c.status === 'FINALIZADA');
    const canceladas  = corridas.filter((c) => c.status === 'CANCELADA');

    const totalCorridas      = corridas.length;
    const corridasConcluidas = finalizadas.length;
    const corridasCanceladas = canceladas.length;

    // Km e valor: somente corridas FINALIZADAS
    const kmRodados       = parseFloat(finalizadas.reduce((acc, c) => acc + (c.distanciaKm || 0), 0).toFixed(2));
    const valorTotal      = parseFloat(finalizadas.reduce((acc, c) => acc + (c.valor || 0), 0).toFixed(2));
    const duracaoTotalMin = finalizadas.reduce((acc, c) => acc + (c.duracaoMin || 0), 0);

    const valorMedioPorCorrida = corridasConcluidas > 0
      ? parseFloat((valorTotal / corridasConcluidas).toFixed(2))
      : 0;

    const distanciaMedia = corridasConcluidas > 0
      ? parseFloat((kmRodados / corridasConcluidas).toFixed(2))
      : 0;

    const duracaoMedia = corridasConcluidas > 0
      ? Math.round(duracaoTotalMin / corridasConcluidas)
      : 0;

    const corridasPorDia = this._agruparPorDia(corridas);

    return {
      mes,
      ano,
      totalCorridas,
      corridasConcluidas,
      corridasCanceladas,
      kmRodados,
      valorTotal,
      valorMedioPorCorrida,
      distanciaMedia,
      duracaoTotalMin,
      duracaoMedia,
      corridasPorDia,
      corridas: corridas.map((c) => ({
        id:          c.id,
        origemNome:  c.origemNome,
        destinoNome: c.destinoNome,
        distanciaKm: c.distanciaKm,
        duracaoMin:  c.duracaoMin,
        valor:       c.valor,
        status:      c.status,
        dataHorario: c.dataHorario,
      })),
    };
  }

  _agruparPorDia(corridas) {
    const mapa = {};
    corridas.forEach((c) => {
      const dia = new Date(c.dataHorario).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      mapa[dia] = (mapa[dia] || 0) + 1;
    });
    return Object.entries(mapa)
      .map(([dia, quantidade]) => ({ dia, quantidade }))
      .sort((a, b) => a.dia.localeCompare(b.dia));
  }
}

module.exports = new RelatorioMotoristaService();
