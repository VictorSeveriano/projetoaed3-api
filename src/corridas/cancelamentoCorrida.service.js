'use strict';

const corridasRepository = require('./corridas.repository');
const { buscarCorridaAutorizada } = require('./corridas.acesso');
const { validarMotivoCancelamento } = require('./corridas.validador');
const notificacoesService = require('../notificacoes/notificacoes.service');
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const AppError = require('../utils/AppError');
const { readCache } = require('../utils/readCache');
const { ORIGEM_CANCELAMENTO, SITUACAO_MOTORISTA } = require('../utils/constants');

/**
 * CancelamentoCorridaService — Cancelamento manual de corridas por passageiro,
 * motorista ou administrador, com validação de motivo, liberação de veículo e notificação.
 */
class CancelamentoCorridaService {
  async cancelar(id, usuarioLogado = null, dados = {}) {
    const { corrida } = await buscarCorridaAutorizada(id, usuarioLogado);

    if (corrida.estaCancelada()) {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.estaFinalizada()) {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const perfil = usuarioLogado?.perfil;
    if (!corrida.podeSerCanceladaPor(perfil)) {
      throw new AppError('Nao e possivel cancelar uma corrida cujo embarque ja foi confirmado e esta em andamento.', 409);
    }

    let motivoLimpo = null;
    if (perfil === 'MOTORISTA') {
      motivoLimpo = validarMotivoCancelamento(dados?.motivo);
    } else if (dados && dados.motivo !== undefined && dados.motivo !== null && String(dados.motivo) !== '') {
      motivoLimpo = validarMotivoCancelamento(dados.motivo);
    }

    const canceladoPor = perfil === 'MOTORISTA'
      ? ORIGEM_CANCELAMENTO.MOTORISTA
      : perfil === 'USUARIO'
        ? ORIGEM_CANCELAMENTO.PASSAGEIRO
        : ORIGEM_CANCELAMENTO.SISTEMA;

    const agora = new Date();
    const metadados = {
      canceladoPor,
      canceladaEm: agora,
      ...(motivoLimpo ? { motivoCancelamento: motivoLimpo } : {}),
      ...(perfil === 'MOTORISTA'
        ? { situacaoMotorista: SITUACAO_MOTORISTA.NAO_EMBARCAR, embarqueMotoristaConfirmado: false, embarqueMotoristaEm: agora }
        : {}),
    };

    const corridaAtualizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(
      id,
      'cancelar',
      metadados,
      {
        autorId: usuarioLogado?.id || null,
        autorPerfil: perfil || 'SISTEMA',
        autorNome: usuarioLogado?.nome || null,
      }
    );
    if (!corridaAtualizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    await this._notificarParteOposta(id, corrida, canceladoPor, motivoLimpo);
    readCache.invalidarPrefixo('corridas:');
    readCache.invalidarPrefixo('dashboard:');
    readCache.invalidarPrefixo('veiculos:');
    readCache.invalidarPrefixo('motoristas:');
    readCache.invalidarPrefixo('notificacoes:');
    return corridaAtualizada;
  }

  /** @private */
  async _notificarParteOposta(corridaId, corrida, canceladoPor, motivoLimpo) {
    const trajeto = corrida.trajetoDescricao();

    if (canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA && corrida.usuarioId) {
      await despacharNotificacaoSemFalhar(
        'CancelamentoCorridaService',
        `cancelamento motorista ${corridaId}: notificar passageiro`,
        () =>
          notificacoesService.notificarAtualizacaoCorrida(corrida.usuarioId, {
            corridaId,
            titulo: 'Corrida cancelada pelo motorista',
            mensagem: `O motorista cancelou a corrida de ${trajeto}. Motivo: ${motivoLimpo}`,
          })
      );
    } else if (canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO && corrida.motoristaId) {
      await despacharNotificacaoSemFalhar(
        'CancelamentoCorridaService',
        `cancelamento passageiro ${corridaId}: notificar motorista`,
        () =>
          notificacoesService.notificarAtualizacaoCorrida(corrida.motoristaId, {
            corridaId,
            titulo: 'Corrida cancelada pelo passageiro',
            mensagem: `O passageiro cancelou a corrida de ${trajeto}.${motivoLimpo ? ` Motivo: ${motivoLimpo}.` : ''} Consulte os detalhes e a situação atual na área Minhas corridas.`,
          })
      );
    }
  }
}

module.exports = new CancelamentoCorridaService();
