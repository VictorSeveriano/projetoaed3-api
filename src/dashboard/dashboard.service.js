const corridasRepository = require('../corridas/corridas.repository');
const veiculosRepository = require('../veiculos/veiculos.repository');

/**
 * DashboardService — Metricas e indicadores do sistema de corridas.
 *
 * Refatorado para refletir o novo conceito: corridas, nao aluguel por periodo.
 *
 * Metricas disponibilizadas:
 * - Resumo geral (totais)
 * - Corridas por mes
 * - Origens mais solicitadas
 * - Destinos mais solicitados
 * - Rotas mais utilizadas (pares origem -> destino)
 * - Veiculos mais utilizados
 * - Faturamento mensal
 */
class DashboardService {
  /**
   * Retorna o resumo geral do sistema.
   * @returns {{ totalCorridas, corridasAtivas, faturamentoTotal, veiculosDisponiveis }}
   */
  getResumo() {
    const corridas = corridasRepository.findAll();
    const carros = veiculosRepository.findAll();

    let corridasAtivas = 0;
    let faturamentoTotal = 0;

    corridas.forEach((c) => {
      if (c.status === 'CONFIRMADA' || c.status === 'EM_ANDAMENTO') corridasAtivas++;
      if (c.status !== 'CANCELADA') faturamentoTotal += c.valor || 0;
    });

    const veiculosDisponiveis = carros.filter((c) => c.status === 'DISPONIVEL').length;

    return {
      totalCorridas: corridas.length,
      corridasAtivas,
      faturamentoTotal: parseFloat(faturamentoTotal.toFixed(2)),
      veiculosDisponiveis,
      totalVeiculos: carros.length,
    };
  }

  /**
   * Retorna a contagem de corridas por mes.
   * @returns {{ mes, quantidade }[]}
   */
  getCorridasPorMes() {
    const corridas = corridasRepository.findAll();
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const contagem = Array(12).fill(0);

    corridas.forEach((c) => {
      if (c.status !== 'CANCELADA') {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) contagem[mesIndex]++;
      }
    });

    return meses.map((mes, index) => ({ mes, quantidade: contagem[index] }));
  }

  /**
   * Retorna as origens mais solicitadas (top 5).
   * @returns {{ nome, quantidade }[]}
   */
  getOrigensMaisSolicitadas() {
    const corridas = corridasRepository.findAll();
    const contagem = {};

    corridas.forEach((c) => {
      if (c.origemNome) {
        contagem[c.origemNome] = (contagem[c.origemNome] || 0) + 1;
      }
    });

    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  /**
   * Retorna os destinos mais solicitados (top 5).
   * @returns {{ nome, quantidade }[]}
   */
  getDestinosMaisSolicitados() {
    const corridas = corridasRepository.findAll();
    const contagem = {};

    corridas.forEach((c) => {
      if (c.destinoNome) {
        contagem[c.destinoNome] = (contagem[c.destinoNome] || 0) + 1;
      }
    });

    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  /**
   * Retorna os pares de rota mais utilizados (top 5).
   * @returns {{ nome, quantidade }[]}
   */
  getRotasMaisUtilizadas() {
    const corridas = corridasRepository.findAll();
    const contagem = {};

    corridas.forEach((c) => {
      if (c.origemNome && c.destinoNome && c.status !== 'CANCELADA') {
        const chave = c.origemNome + ' -> ' + c.destinoNome;

        contagem[chave] = (contagem[chave] || 0) + 1;
      }
    });

    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  /**
   * Retorna os veiculos mais utilizados (top 5).
   * @returns {{ nome, quantidade }[]}
   */
  getVeiculosMaisUtilizados() {
    const corridas = corridasRepository.findAll();
    const carros = carrosRepository.findAll();
    const contagem = {};

    corridas.forEach((c) => {
      if (c.veiculoId) {
        contagem[c.veiculoId] = (contagem[c.veiculoId] || 0) + 1;
      }
    });

    return Object.entries(contagem)
      .map(([veiculoId, quantidade]) => {
        const carro = carros.find((c) => c.id === veiculoId);
        const nome = carro ? (carro.marca + ' ' + carro.modelo) : 'Veiculo Desconhecido';

        return { nome, quantidade };
      })
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  /**
   * Retorna o faturamento mensal.
   * @returns {{ mes, valor }[]}
   */
  getFaturamentoMensal() {
    const corridas = corridasRepository.findAll();
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const receitas = Array(12).fill(0);

    corridas.forEach((c) => {
      if (c.status !== 'CANCELADA' && c.valor) {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) receitas[mesIndex] += c.valor;
      }
    });

    return meses.map((mes, index) => ({
      mes,
      valor: parseFloat(receitas[index].toFixed(2)),
    }));
  }
}

module.exports = new DashboardService();
