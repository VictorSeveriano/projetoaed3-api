'use strict';
/**
 * dashboard.service.js — Métricas e indicadores do sistema de corridas.
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 */

const corridasRepository = require('../corridas/corridas.repository');
const veiculosRepository = require('../veiculos/veiculos.repository');

class DashboardService {
  async getResumo() {
    const corridas = await corridasRepository.findAll();
    const carros   = await veiculosRepository.findAll();

    let corridasAtivas   = 0;
    let faturamentoTotal = 0;

    corridas.forEach((c) => {
      if (c.status === 'CONFIRMADA' || c.status === 'EM_ANDAMENTO') corridasAtivas++;
      if (c.status !== 'CANCELADA') faturamentoTotal += c.valor || 0;
    });

    const veiculosDisponiveis = carros.filter((c) => c.status === 'DISPONIVEL').length;

    return {
      totalCorridas:    corridas.length,
      corridasAtivas,
      faturamentoTotal: parseFloat(faturamentoTotal.toFixed(2)),
      veiculosDisponiveis,
      totalVeiculos:    carros.length,
    };
  }

  async getCorridasPorMes() {
    const corridas = await corridasRepository.findAll();
    const meses    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const contagem = Array(12).fill(0);

    corridas.forEach((c) => {
      if (c.status !== 'CANCELADA') {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) contagem[mesIndex]++;
      }
    });

    return meses.map((mes, index) => ({ mes, quantidade: contagem[index] }));
  }

  async getOrigensMaisSolicitadas() {
    const corridas = await corridasRepository.findAll();
    const contagem = {};
    corridas.forEach((c) => {
      if (c.origemNome) contagem[c.origemNome] = (contagem[c.origemNome] || 0) + 1;
    });
    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  async getDestinosMaisSolicitados() {
    const corridas = await corridasRepository.findAll();
    const contagem = {};
    corridas.forEach((c) => {
      if (c.destinoNome) contagem[c.destinoNome] = (contagem[c.destinoNome] || 0) + 1;
    });
    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  async getRotasMaisUtilizadas() {
    const corridas = await corridasRepository.findAll();
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

  async getVeiculosMaisUtilizados() {
    const corridas = await corridasRepository.findAll();
    const carros   = await veiculosRepository.findAll();
    const contagem = {};

    corridas.forEach((c) => {
      if (c.veiculoId) contagem[c.veiculoId] = (contagem[c.veiculoId] || 0) + 1;
    });

    return Object.entries(contagem)
      .map(([veiculoId, quantidade]) => {
        const carro = carros.find((c) => c.id === veiculoId);
        const nome  = carro ? (carro.marca + ' ' + carro.modelo) : 'Veículo Desconhecido';
        return { nome, quantidade };
      })
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5);
  }

  async getFaturamentoMensal() {
    const corridas = await corridasRepository.findAll();
    const meses    = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    const receitas = Array(12).fill(0);

    corridas.forEach((c) => {
      if (c.status !== 'CANCELADA' && c.valor) {
        const mesIndex = new Date(c.dataHorario).getMonth();
        if (!isNaN(mesIndex)) receitas[mesIndex] += c.valor;
      }
    });

    return meses.map((mes, index) => ({ mes, valor: parseFloat(receitas[index].toFixed(2)) }));
  }
}

module.exports = new DashboardService();
