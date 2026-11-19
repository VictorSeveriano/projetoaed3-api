'use strict';

const corridasRepository = require('./corridas.repository');
const { buscarCorridaAutorizada } = require('./corridas.acesso');
const notificacoesService = require('../notificacoes/notificacoes.service');
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const AppError = require('../utils/AppError');

/**
 * FinalizacaoCorridaService — Confirmação de pagamento presencial e
 * finalização da corrida com liberação do veículo e notificação ao passageiro.
 */
class FinalizacaoCorridaService {
  /**
   * Motorista (ou Administrador) confirma pagamento e finaliza a corrida.
   */
  async confirmarPagamentoEFinalizar(id, usuarioLogado = null) {
    const { corrida } = await buscarCorridaAutorizada(id, usuarioLogado);

    if (corrida.estaFinalizada()) {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.estaCancelada()) {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }
    if (corrida.estaSolicitada() || !corrida.podeSerFinalizada()) {
      throw new AppError('A corrida ainda nao foi aceita por um motorista.', 409);
    }

    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.perfil !== 'MOTORISTA') {
        throw new AppError('Apenas motoristas ou administradores podem confirmar pagamento e finalizar.', 403);
      }
    }

    const corridaFinalizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(id, 'finalizar');
    if (!corridaFinalizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    if (corrida.usuarioId) {
      await despacharNotificacaoSemFalhar(
        'FinalizacaoCorridaService',
        `finalizacao ${id}: notificar passageiro`,
        () =>
          notificacoesService.notificarPassageiroFinalizacao(corrida.usuarioId, {
            corridaId:   id,
            origemNome:  corrida.origemNome,
            destinoNome: corrida.destinoNome,
          })
      );
    }

    return corridaFinalizada;
  }

  /**
   * @deprecated Use confirmarPagamentoEFinalizar para o fluxo correto.
   */
  async finalizar(id, usuarioLogado = null) {
    return this.confirmarPagamentoEFinalizar(id, usuarioLogado);
  }
}

module.exports = new FinalizacaoCorridaService();
