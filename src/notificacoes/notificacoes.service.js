'use strict';
/**
 * notificacoes.service.js — Regras de negócio de notificações.
 *
 * Delega a construção de eventos/conteúdo às estratégias polimórficas em
 * `estrategiasNotificacao.js` e a persistência ao `notificacoesRepository`.
 */

const notificacoesRepository = require('./notificacoes.repository');
const AppError = require('../utils/AppError');
const { ESTRATEGIAS_NOTIFICACAO } = require('./estrategiasNotificacao');

class NotificacoesService {
  async listar(destinatarioId) {
    return notificacoesRepository.findByDestinatario(destinatarioId);
  }

  async contarNaoLidas(destinatarioId) {
    const lista = await notificacoesRepository.findNaoLidas(destinatarioId);
    return lista.length;
  }

  /** Emite uma notificação construída pela estratégia do evento informado. */
  async emitirEvento(evento, destinatarioId, dados) {
    const estrategia = ESTRATEGIAS_NOTIFICACAO[evento];
    if (!estrategia) {
      throw new AppError(`Tipo de evento de notificação desconhecido: ${evento}.`, 500);
    }
    const payload = estrategia.construir(destinatarioId, dados);
    return notificacoesRepository.create(payload);
  }

  async notificarSolicitacaoMotorista(adminId, dados) {
    return this.emitirEvento('SOLICITACAO_MOTORISTA', adminId, dados);
  }

  async notificarSolicitacaoVeiculo(adminId, dados) {
    return this.emitirEvento('SOLICITACAO_VEICULO', adminId, dados);
  }

  /**
   * Notifica um motorista sobre uma nova corrida disponível.
   * A notificação fica com acaoMotorista='PENDENTE' até o motorista aceitar/recusar.
   */
  async notificarNovaCorrida(motoristaUsuarioId, dados) {
    return this.emitirEvento('NOVA_CORRIDA', motoristaUsuarioId, dados);
  }

  /**
   * Atualiza acaoMotorista na notificação NOVA_CORRIDA do motorista.
   * Usado quando o motorista aceita (ACEITA) ou recusa (RECUSADA).
   */
  async atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao) {
    return notificacoesRepository.atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao);
  }

  /** Notifica o passageiro que sua corrida foi aceita pelo motorista. */
  async notificarPassageiroAceite(passageiroId, dados) {
    return this.emitirEvento('CORRIDA_ACEITA', passageiroId, dados);
  }

  /** Notifica o passageiro que sua corrida foi finalizada e o pagamento confirmado. */
  async notificarPassageiroFinalizacao(passageiroId, dados) {
    return this.emitirEvento('CORRIDA_FINALIZADA', passageiroId, dados);
  }

  /**
   * Notifica o passageiro que sua corrida foi cancelada automaticamente por atingir
   * a data/horário agendado sem aceite de motorista.
   */
  async notificarPassageiroExpiracao(passageiroId, dados) {
    return this.emitirEvento('CORRIDA_EXPIRADA', passageiroId, dados);
  }

  /**
   * Notificação genérica de atualização de corrida (embarque, a caminho, cancelamentos).
   */
  async notificarAtualizacaoCorrida(destinatarioId, dados) {
    return this.emitirEvento('ATUALIZACAO_CORRIDA', destinatarioId, dados);
  }

  async marcarLida(id, usuarioLogado = null) {
    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      const n = await notificacoesRepository.findById(id);
      if (!n) throw new AppError('Notificacao nao encontrada.', 404);
      if (n.destinatarioId !== usuarioLogado.id) {
        throw new AppError('Voce nao tem permissao para acessar esta notificacao.', 403);
      }
    }
    const atualizada = await notificacoesRepository.marcarLida(id);
    // Repositorio retorna null quando o registro nao existe: nao reportar sucesso falso (ex.: perfil ADMIN)
    if (!atualizada) throw new AppError('Notificacao nao encontrada.', 404);
    return atualizada;
  }

  async marcarTodasLidas(destinatarioId) {
    return notificacoesRepository.marcarTodasLidas(destinatarioId);
  }

  async marcarSolicitacaoMotoristaLida(referenciaIds) {
    if (typeof notificacoesRepository.marcarLidaPorReferencia === 'function') {
      await notificacoesRepository.marcarLidaPorReferencia('SOLICITACAO_MOTORISTA', referenciaIds);
    }
  }

  async marcarSolicitacaoVeiculoLida(referenciaIds) {
    if (typeof notificacoesRepository.marcarLidaPorReferencia === 'function') {
      await notificacoesRepository.marcarLidaPorReferencia('SOLICITACAO_VEICULO', referenciaIds);
    }
  }
}

module.exports = new NotificacoesService();
