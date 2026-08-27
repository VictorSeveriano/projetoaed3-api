const reservasRepository = require('./reservas.repository');
const carrosService = require('../carros/carros.service');
const localizacoesRepository = require('../localizacoes/localizacoes.repository');
const grafoService = require('../grafo/grafo.service');
const AppError = require('../utils/AppError');
const { isValidDate, isEndAfterStart, datesOverlap } = require('../utils/dateUtils');

/**
 * ReservasService — Regras de negocio de reservas.
 *
 * Integra com o GrafoService para calcular a rota entre
 * o local de retirada e o local de devolucao usando Dijkstra.
 */
class ReservasService {
  listarTodas() {
    return reservasRepository.findAll();
  }

  buscarPorId(id) {
    const reserva = reservasRepository.findById(id);
    if (!reserva) {
      throw new AppError(`Reserva com id '${id}' nao encontrada.`, 404);
    }
    return reserva;
  }

  /**
   * Cria uma nova reserva.
   * Validacoes:
   * 1. Carro existe e esta DISPONIVEL
   * 2. Datas validas e fim > inicio
   * 3. Localizacoes existem no grafo
   * 4. Sem conflito de datas com reservas existentes
   * 5. Calcula rota via Dijkstra
   */
  criar(dados) {
    const { usuarioId, carroId, dataInicio, dataFim, localRetirada, localDevolucao } = dados;

    // Valida carro
    const carro = carrosService.buscarPorId(carroId);
    if (carro.status !== 'DISPONIVEL') {
      throw new AppError('O carro nao esta disponivel para reserva.', 409);
    }

    // Valida datas
    if (!isValidDate(dataInicio) || !isValidDate(dataFim)) {
      throw new AppError('Datas invalidas. Use o formato YYYY-MM-DD.', 400);
    }
    if (!isEndAfterStart(dataInicio, dataFim)) {
      throw new AppError('A data de fim deve ser posterior a data de inicio.', 400);
    }

    // Valida localizacoes
    if (!grafoService.localizacaoExiste(localRetirada)) {
      throw new AppError(`Localizacao de retirada '${localRetirada}' nao existe.`, 404);
    }
    if (!grafoService.localizacaoExiste(localDevolucao)) {
      throw new AppError(`Localizacao de devolucao '${localDevolucao}' nao existe.`, 404);
    }

    // Verifica conflito de datas com reservas ativas do mesmo carro
    const reservasAtivas = reservasRepository.findByCarro(carroId);
    const temConflito = reservasAtivas.some((r) =>
      datesOverlap(dataInicio, dataFim, r.dataInicio, r.dataFim)
    );
    if (temConflito) {
      throw new AppError('O carro ja possui uma reserva ativa nesse periodo.', 409);
    }

    // Calcula rota usando Dijkstra
    const rota = grafoService.calcularRota(localRetirada, localDevolucao);

    // Cria a reserva
    const novaReserva = reservasRepository.create({
      usuarioId,
      carroId,
      dataInicio,
      dataFim,
      localRetirada,
      localDevolucao,
      rota: rota || null,
    });

    // Atualiza status do carro para RESERVADO
    carrosService.atualizarStatus(carroId, 'RESERVADO');

    return novaReserva;
  }

  /**
   * Cancela uma reserva existente.
   */
  cancelar(id) {
    const reserva = this.buscarPorId(id);

    if (reserva.status === 'CANCELADA') {
      throw new AppError('Esta reserva ja esta cancelada.', 409);
    }
    if (reserva.status === 'FINALIZADA') {
      throw new AppError('Nao e possivel cancelar uma reserva finalizada.', 409);
    }

    const reservaAtualizada = reservasRepository.updateStatus(id, 'CANCELADA');

    // Devolve o carro para DISPONIVEL
    carrosService.atualizarStatus(reserva.carroId, 'DISPONIVEL');

    return reservaAtualizada;
  }

  atualizar(id, dados) {
    const reserva = this.buscarPorId(id);
    const reservaAtualizada = reservasRepository.updateStatus(id, dados.status || reserva.status);
    return reservaAtualizada;
  }

  deletar(id) {
    this.buscarPorId(id);
    return reservasRepository.delete(id);
  }
}

module.exports = new ReservasService();
