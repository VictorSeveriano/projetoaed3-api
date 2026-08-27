const reservasRepository = require('../reservas/reservas.repository');
const carrosService = require('../carros/carros.service');

class DashboardService {
  getResumo() {
    const reservas = reservasRepository.findAll();
    const carros = carrosService.listarTodos();
    
    let receitaTotal = 0;
    let reservasAtivas = 0;

    reservas.forEach((r) => {
      if (r.status === 'ATIVA') reservasAtivas++;
      // Apenas computa receita de FINALIZADA ou ATIVA (ignora CANCELADA, ou se preferir, inclui ativa)
      if (r.status !== 'CANCELADA') {
        const carro = carros.find(c => c.id === r.carroId);
        if (carro) {
          const dias = (new Date(r.dataFim) - new Date(r.dataInicio)) / (1000 * 60 * 60 * 24);
          if (dias > 0) receitaTotal += dias * carro.precoDiaria;
        }
      }
    });

    return {
      totalCarros: carros.length,
      totalReservas: reservas.length,
      reservasAtivas,
      receitaTotal
    };
  }

  getReservasPorMes() {
    const reservas = reservasRepository.findAll();
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const contagem = Array(12).fill(0);

    reservas.forEach(r => {
      if (r.status !== 'CANCELADA') {
        const mesIndex = new Date(r.dataInicio).getMonth(); // 0 a 11
        if (!isNaN(mesIndex)) {
          contagem[mesIndex]++;
        }
      }
    });

    return meses.map((mes, index) => ({
      mes,
      quantidade: contagem[index]
    }));
  }

  getLocaisMaisSolicitados() {
    const reservas = reservasRepository.findAll();
    const contagem = {};

    reservas.forEach(r => {
      if (r.localRetirada) contagem[r.localRetirada] = (contagem[r.localRetirada] || 0) + 1;
      if (r.localDevolucao) contagem[r.localDevolucao] = (contagem[r.localDevolucao] || 0) + 1;
    });

    return Object.entries(contagem)
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5); // Top 5
  }

  getCarrosMaisReservados() {
    const reservas = reservasRepository.findAll();
    const carros = carrosService.listarTodos();
    const contagem = {};

    reservas.forEach(r => {
      contagem[r.carroId] = (contagem[r.carroId] || 0) + 1;
    });

    return Object.entries(contagem)
      .map(([carroId, quantidade]) => {
        const carro = carros.find(c => c.id === carroId);
        const nome = carro ? `${carro.marca} ${carro.modelo}` : 'Carro Desconhecido';
        return { nome, quantidade };
      })
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 5); // Top 5
  }

  getReceitasPorMes() {
    const reservas = reservasRepository.findAll();
    const carros = carrosService.listarTodos();
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const receitas = Array(12).fill(0);

    reservas.forEach(r => {
      if (r.status !== 'CANCELADA') {
        const carro = carros.find(c => c.id === r.carroId);
        const mesIndex = new Date(r.dataInicio).getMonth();
        if (carro && !isNaN(mesIndex)) {
          const dias = (new Date(r.dataFim) - new Date(r.dataInicio)) / (1000 * 60 * 60 * 24);
          if (dias > 0) receitas[mesIndex] += dias * carro.precoDiaria;
        }
      }
    });

    return meses.map((mes, index) => ({
      mes,
      valor: receitas[index]
    }));
  }
}

module.exports = new DashboardService();
