'use strict';
/**
 * notificacoes.service.js — Regras de negócio de notificações.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 */

const notificacoesRepository = require('./notificacoes.repository');

class NotificacoesService {
  async listar(destinatarioId) {
    return notificacoesRepository.findByDestinatario(destinatarioId);
  }

  async contarNaoLidas(destinatarioId) {
    const lista = await notificacoesRepository.findNaoLidas(destinatarioId);
    return lista.length;
  }

  async notificarSolicitacaoMotorista(adminId, dados) {
    return notificacoesRepository.create({
      destinatarioId: adminId,
      tipo:           'SOLICITACAO_MOTORISTA',
      titulo:         'Nova solicitação de motorista',
      mensagem:       `${dados.nomeMotorista} solicitou cadastro como motorista.`,
      referenciaId:   dados.motoristaId,
    });
  }

  async notificarSolicitacaoVeiculo(adminId, dados) {
    return notificacoesRepository.create({
      destinatarioId: adminId,
      tipo:           'SOLICITACAO_VEICULO',
      titulo:         'Veículo pendente de aprovação',
      mensagem:       `${dados.nomeMotorista} cadastrou ${dados.modeloVeiculo} — aguarda aprovação.`,
      referenciaId:   dados.veiculoId,
    });
  }

  async marcarLida(id) {
    return notificacoesRepository.marcarLida(id);
  }

  async marcarTodasLidas(destinatarioId) {
    return notificacoesRepository.marcarTodasLidas(destinatarioId);
  }
}

module.exports = new NotificacoesService();
