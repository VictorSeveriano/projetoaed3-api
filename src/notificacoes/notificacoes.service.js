const notificacoesRepository = require('./notificacoes.repository');

/**
 * NotificacoesService — Regras de negócio de notificações.
 *
 * Sem WebSocket nesta etapa: o frontend consulta por polling.
 * A arquitetura (Service + Repository) está preparada para WebSocket futuro:
 * basta injetar o socket no service e emitir ao criar.
 */
class NotificacoesService {
  /**
   * Lista notificações de um destinatário (mais recentes primeiro).
   * @param {string} destinatarioId
   * @returns {object[]}
   */
  listar(destinatarioId) {
    return notificacoesRepository.findByDestinatario(destinatarioId);
  }

  /**
   * Conta notificações não lidas — usado para badge na Sidebar.
   * @param {string} destinatarioId
   * @returns {number}
   */
  contarNaoLidas(destinatarioId) {
    return notificacoesRepository.findNaoLidas(destinatarioId).length;
  }

  /**
   * Cria notificação de nova solicitação de motorista.
   * Chamado pelo MotoristasService ao criar solicitação.
   * @param {string} adminId - destinatário (administrador)
   * @param {object} dados - { nomeMotorista, motorista_id }
   * @returns {object}
   */
  notificarSolicitacaoMotorista(adminId, dados) {
    return notificacoesRepository.create({
      destinatarioId: adminId,
      tipo: 'SOLICITACAO_MOTORISTA',
      titulo: 'Nova solicitação de motorista',
      mensagem: `${dados.nomeMotorista} solicitou cadastro como motorista.`,
      referenciaId: dados.motoristaId,
    });
  }

  /**
   * Cria notificação de novo veículo aguardando aprovação.
   * Chamado pelo VeiculosService ao cadastrar veículo.
   * @param {string} adminId
   * @param {object} dados - { nomeMotorista, veiculoId, modeloVeiculo }
   * @returns {object}
   */
  notificarSolicitacaoVeiculo(adminId, dados) {
    return notificacoesRepository.create({
      destinatarioId: adminId,
      tipo: 'SOLICITACAO_VEICULO',
      titulo: 'Veículo pendente de aprovação',
      mensagem: `${dados.nomeMotorista} cadastrou ${dados.modeloVeiculo} — aguarda aprovação.`,
      referenciaId: dados.veiculoId,
    });
  }

  /**
   * Marca notificação como lida.
   * @param {string} id
   * @returns {object|null}
   */
  marcarLida(id) {
    return notificacoesRepository.marcarLida(id);
  }

  /**
   * Marca todas as notificações do destinatário como lidas.
   * @param {string} destinatarioId
   */
  marcarTodasLidas(destinatarioId) {
    notificacoesRepository.marcarTodasLidas(destinatarioId);
  }
}

module.exports = new NotificacoesService();
