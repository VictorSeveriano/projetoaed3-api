const corridasRepository = require('../corridas/corridas.repository');

/**
 * RelatorioMotoristaService — Agregação de métricas mensais do motorista.
 *
 * Regras (seção 6 do documento de requisitos):
 * - Escopo: somente corridas do motoristaId informado.
 * - Filtro por mês/ano usa dataHorario (data da corrida), não criadaEm.
 * - kmRodados e valorTotal: somente corridas FINALIZADAS.
 * - corridasConcluidas: contagem de FINALIZADAS.
 * - corridasCanceladas: contagem de CANCELADAS.
 * - O campo "valor" é rotulado como "Valor das corridas" — nunca "lucro" ou "salário".
 *
 * Cálculo feito inteiramente aqui — nunca no componente React.
 */
class RelatorioMotoristaService {
  /**
   * Gera relatório mensal do motorista.
   * @param {string} motoristaId
   * @param {number} mes  - 1..12
   * @param {number} ano  - ex: 2026
   * @returns {object}
   */
  gerarRelatorioMensal(motoristaId, mes, ano) {
    const corridas = corridasRepository.findByMotoristaIdAndPeriodo(motoristaId, mes, ano);

    const finalizadas  = corridas.filter((c) => c.status === 'FINALIZADA');
    const canceladas   = corridas.filter((c) => c.status === 'CANCELADA');

    const totalCorridas        = corridas.length;
    const corridasConcluidas   = finalizadas.length;
    const corridasCanceladas   = canceladas.length;

    // Km e valor: somente corridas FINALIZADAS
    const kmRodados   = parseFloat(finalizadas.reduce((acc, c) => acc + (c.distanciaKm || 0), 0).toFixed(2));
    const valorTotal  = parseFloat(finalizadas.reduce((acc, c) => acc + (c.valor || 0), 0).toFixed(2));
    const duracaoTotalMin = finalizadas.reduce((acc, c) => acc + (c.duracaoMin || 0), 0);

    const valorMedioPorCorrida  = corridasConcluidas > 0
      ? parseFloat((valorTotal / corridasConcluidas).toFixed(2))
      : 0;

    const distanciaMedia = corridasConcluidas > 0
      ? parseFloat((kmRodados / corridasConcluidas).toFixed(2))
      : 0;

    const duracaoMedia = corridasConcluidas > 0
      ? Math.round(duracaoTotalMin / corridasConcluidas)
      : 0;

    // Série temporal: total de corridas (todos os status) por dia para gráfico
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
      // Lista resumida das corridas do período (sem dados sensíveis de outros usuários)
      corridas: corridas.map((c) => ({
        id: c.id,
        origemNome: c.origemNome,
        destinoNome: c.destinoNome,
        distanciaKm: c.distanciaKm,
        duracaoMin: c.duracaoMin,
        valor: c.valor,
        status: c.status,
        dataHorario: c.dataHorario,
      })),
    };
  }

  /**
   * Agrupa corridas por dia para exibição em gráfico.
   * @param {Corrida[]} corridas
   * @returns {Array<{dia: string, quantidade: number}>}
   */
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
