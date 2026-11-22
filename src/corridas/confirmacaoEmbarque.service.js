'use strict';

const corridasRepository = require('./corridas.repository');
const Corrida = require('./Corrida');
const notificacoesService = require('../notificacoes/notificacoes.service');
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const AppError = require('../utils/AppError');
const { readCache } = require('../utils/readCache');
const {
  EXTENSAO_A_CAMINHO_MIN,
  ORIGEM_CANCELAMENTO,
  SITUACAO_MOTORISTA,
} = require('../utils/constants');
const { validarMotivoCancelamento } = require('./corridas.validador');

const LOG_ORIGEM = 'ConfirmacaoEmbarqueService';
const erroConflito = () =>
  new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);

/**
 * ConfirmacaoEmbarqueService — Decisões de embarque do motorista e do passageiro,
 * validação de janela horária e extensão de prazo para motorista "a caminho".
 */
class ConfirmacaoEmbarqueService {
  /** Garante que a corrida está aceita/ativa e que o horário agendado já chegou. */
  _validarJanelaDeEmbarque(corrida, agora) {
    if (corrida.estaCancelada()) {
      throw new AppError('Esta corrida foi cancelada e não pode mais ser confirmada.', 409);
    }
    if (corrida.estaFinalizada()) {
      throw new AppError('Esta corrida já foi concluída.', 409);
    }
    if (corrida.estaSolicitada()) {
      throw new AppError('Esta corrida ainda não foi aceita por um motorista.', 409);
    }
    if (!corrida.horarioAgendadoJaChegou(agora)) {
      throw new AppError('A confirmação de embarque só é possível a partir do horário agendado.', 400);
    }
  }

  /**
   * Decisões do motorista vinculado: CONFIRMAR_EMBARQUE | ESTOU_A_CAMINHO | NAO_VOU_EMBARCAR (+ motivo).
   * Idempotente: repetir a mesma decisão devolve o estado atual sem duplicar notificações.
   */
  async registrarEmbarqueMotorista(corridaId, usuarioLogado, { acao, motivo } = {}) {
    const registro = await corridasRepository.findById(corridaId);
    if (!registro) throw new AppError('Corrida nao encontrada.', 404);

    const corrida = Corrida.garantirInstancia(registro);
    if (!usuarioLogado || !corrida.pertenceAoMotorista(usuarioLogado.id)) {
      throw new AppError('Apenas o motorista vinculado a esta corrida pode registrar esta decisão.', 403);
    }

    const agora = new Date();
    const trajeto = corrida.trajetoDescricao();
    const notificarPassageiro = (titulo, mensagem, ctx) =>
      despacharNotificacaoSemFalhar(LOG_ORIGEM, `embarque ${corridaId}: ${ctx}`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.usuarioId, { corridaId, titulo, mensagem }));

    switch (acao) {
      case 'CONFIRMAR_EMBARQUE': {
        if (corrida.embarqueMotoristaFoiConfirmado()) return registro;
        this._validarJanelaDeEmbarque(corrida, agora);
        const atualizada = await corridasRepository.confirmarEmbarqueMotorista(corridaId, usuarioLogado.id, agora);
        if (!atualizada) throw erroConflito();
        await notificarPassageiro('Embarque confirmado',
          `O motorista confirmou o seu embarque na corrida de ${trajeto}. Boa viagem!`, 'confirmacao');
        readCache.invalidarPrefixo('corridas:');
        readCache.invalidarPrefixo('dashboard:');
        return atualizada;
      }

      case 'ESTOU_A_CAMINHO': {
        if (corrida.motoristaEstaACaminho()) return registro;
        this._validarJanelaDeEmbarque(corrida, agora);
        if (!corrida.estaConfirmada()) {
          throw new AppError('Esta corrida não está aguardando confirmação de embarque.', 409);
        }
        const base = Math.max(corrida.prazoConfirmacaoVigente().getTime(), agora.getTime());
        const novoPrazo = new Date(base + EXTENSAO_A_CAMINHO_MIN * 60 * 1000);
        const atualizada = await corridasRepository.registrarMotoristaACaminho(corridaId, usuarioLogado.id, novoPrazo, agora);
        if (!atualizada) {
          const atual = Corrida.garantirInstancia(await corridasRepository.findById(corridaId));
          if (atual && atual.motoristaEstaACaminho()) return atual;
          throw erroConflito();
        }
        await notificarPassageiro('Motorista a caminho',
          `O motorista informou que está a caminho para realizar sua corrida (${trajeto}). Acompanhe as atualizações na área Minhas corridas.`, 'a caminho');
        readCache.invalidarPrefixo('corridas:');
        return atualizada;
      }

      case 'NAO_VOU_EMBARCAR': {
        const motivoLimpo = validarMotivoCancelamento(motivo);
        if (corrida.estaCancelada() && corrida.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA) {
          return registro;
        }
        this._validarJanelaDeEmbarque(corrida, agora);
        if (!corrida.estaAguardandoConfirmacaoEmbarque()) {
          throw new AppError('Não é possível cancelar uma corrida cujo embarque já foi confirmado.', 409);
        }
        const cancelada = await corridasRepository.cancelarConfirmadaComMotivo(corridaId, {
          canceladoPor: ORIGEM_CANCELAMENTO.MOTORISTA,
          motivo: motivoLimpo,
          motoristaUsuarioId: usuarioLogado.id,
          situacaoMotorista: SITUACAO_MOTORISTA.NAO_EMBARCAR,
        }, agora);
        if (!cancelada) {
          const atual = Corrida.garantirInstancia(await corridasRepository.findById(corridaId));
          if (atual && atual.estaCancelada() && atual.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA) {
            return atual;
          }
          throw erroConflito();
        }
        await notificarPassageiro('Corrida cancelada pelo motorista',
          `O motorista cancelou a corrida de ${trajeto}. Motivo: ${motivoLimpo}`, 'cancelamento');
        readCache.invalidarPrefixo('corridas:');
        readCache.invalidarPrefixo('dashboard:');
        readCache.invalidarPrefixo('veiculos:');
        readCache.invalidarPrefixo('motoristas:');
        return cancelada;
      }

      default:
        throw new AppError('Ação inválida. Use CONFIRMAR_EMBARQUE, ESTOU_A_CAMINHO ou NAO_VOU_EMBARCAR.', 400);
    }
  }

  /**
   * Resposta do passageiro vinculado: CONFIRMAR_EMBARQUE | NAO_EMBARQUEI.
   * Registra apenas a coluna do passageiro (nunca altera a do motorista).
   */
  async registrarEmbarquePassageiro(corridaId, usuarioLogado, { acao, cancelarViagem = false, motivo } = {}) {
    const registro = await corridasRepository.findById(corridaId);
    if (!registro) throw new AppError('Corrida nao encontrada.', 404);

    const corrida = Corrida.garantirInstancia(registro);
    if (!usuarioLogado || !corrida.pertenceAoPassageiro(usuarioLogado.id)) {
      throw new AppError('Apenas o passageiro desta corrida pode registrar esta confirmação.', 403);
    }

    const agora = new Date();
    const trajeto = corrida.trajetoDescricao();
    const notificarMotorista = (titulo, mensagem, ctx) => {
      if (!corrida.motoristaId) return Promise.resolve();
      return despacharNotificacaoSemFalhar(LOG_ORIGEM, `embarque ${corridaId}: ${ctx}`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.motoristaId, { corridaId, titulo, mensagem }));
    };

    if (acao === 'CONFIRMAR_EMBARQUE') {
      if (corrida.embarquePassageiroFoiConfirmado()) return registro;
      this._validarJanelaDeEmbarque(corrida, agora);
      const atualizada = await corridasRepository.registrarEmbarquePassageiro(corridaId, usuarioLogado.id, true, agora);
      if (!atualizada) throw erroConflito();
      await notificarMotorista('Embarque confirmado pelo passageiro',
        `O passageiro confirmou que embarcou na corrida de ${trajeto}.`, 'confirmacao passageiro');
      readCache.invalidarPrefixo('corridas:');
      return atualizada;
    }

    if (acao === 'NAO_EMBARQUEI') {
      if (cancelarViagem === true) {
        const motivoLimpo = validarMotivoCancelamento(motivo);
        if (corrida.estaCancelada() && corrida.canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO) {
          return registro;
        }
        this._validarJanelaDeEmbarque(corrida, agora);
        if (!corrida.estaAguardandoConfirmacaoEmbarque()) {
          throw new AppError('Não é possível cancelar por este fluxo: o embarque já foi confirmado.', 409);
        }
        const cancelada = await corridasRepository.cancelarConfirmadaComMotivo(corridaId, {
          canceladoPor: ORIGEM_CANCELAMENTO.PASSAGEIRO,
          motivo: motivoLimpo,
          passageiroId: usuarioLogado.id,
        }, agora);
        if (!cancelada) {
          const atual = Corrida.garantirInstancia(await corridasRepository.findById(corridaId));
          if (atual && atual.estaCancelada() && atual.canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO) {
            return atual;
          }
          throw erroConflito();
        }
        await notificarMotorista('Corrida cancelada pelo passageiro',
          `O passageiro cancelou a corrida de ${trajeto}. Motivo: ${motivoLimpo}`, 'cancelamento passageiro');
        readCache.invalidarPrefixo('corridas:');
        readCache.invalidarPrefixo('dashboard:');
        readCache.invalidarPrefixo('veiculos:');
        readCache.invalidarPrefixo('motoristas:');
        return cancelada;
      }

      if (corrida.embarquePassageiroConfirmado === false) return registro;
      this._validarJanelaDeEmbarque(corrida, agora);
      const atualizada = await corridasRepository.registrarEmbarquePassageiro(corridaId, usuarioLogado.id, false, agora);
      if (!atualizada) throw erroConflito();
      await notificarMotorista('Passageiro ainda não embarcou',
        `O passageiro informou que ainda não embarcou na corrida de ${trajeto}.`, 'nao embarcou passageiro');
      readCache.invalidarPrefixo('corridas:');
      return atualizada;
    }

    throw new AppError('Ação inválida. Use CONFIRMAR_EMBARQUE ou NAO_EMBARQUEI.', 400);
  }
}

module.exports = new ConfirmacaoEmbarqueService();
