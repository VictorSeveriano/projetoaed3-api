'use strict';
/**
 * notificacoes.service.js — Regras de negócio de notificações.
 *
 * Tipos suportados:
 *   SOLICITACAO_MOTORISTA — solicitação de cadastro de motorista (para admin)
 *   SOLICITACAO_VEICULO   — solicitação de aprovação de veículo (para admin)
 *   NOVA_CORRIDA          — nova corrida disponível (para motorista)
 *   ATUALIZACAO_CORRIDA   — atualização de corrida (para passageiro)
 *   SISTEMA               — avisos gerais
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

  /**
   * Notifica um motorista sobre uma nova corrida disponível.
   * A notificação fica com acaoMotorista='PENDENTE' até o motorista aceitar/recusar.
   */
  async notificarNovaCorrida(motoristaUsuarioId, dados) {
    const { corridaId, classe, origemNome, destinoNome, dataFormatada, distanciaKm } = dados;
    return notificacoesRepository.create({
      destinatarioId: motoristaUsuarioId,
      tipo:           'NOVA_CORRIDA',
      titulo:         'Nova corrida disponível',
      mensagem:       `Classe: ${classe}\nOrigem: ${origemNome}\nDestino: ${destinoNome}\nData/Hora: ${dataFormatada}\nDistância: ${distanciaKm} km`,
      referenciaId:   corridaId,
      acaoMotorista:  'PENDENTE',
    });
  }

  /**
   * Atualiza acaoMotorista na notificação NOVA_CORRIDA do motorista.
   * Usado quando o motorista aceita (ACEITA) ou recusa (RECUSADA).
   */
  async atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao) {
    return notificacoesRepository.atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao);
  }

  /**
   * Notifica o passageiro que sua corrida foi aceita pelo motorista.
   */
  async notificarPassageiroAceite(passageiroId, dados) {
    const { corridaId, origemNome, destinoNome } = dados;
    return notificacoesRepository.create({
      destinatarioId: passageiroId,
      tipo:           'ATUALIZACAO_CORRIDA',
      titulo:         'Sua corrida foi aceita!',
      mensagem:       `Um motorista aceitou sua corrida de ${origemNome} para ${destinoNome}. Aguarde o motorista chegar ao local de origem.`,
      referenciaId:   corridaId,
    });
  }

  /**
   * Notifica o passageiro que sua corrida foi finalizada e o pagamento confirmado.
   */
  async notificarPassageiroFinalizacao(passageiroId, dados) {
    const { corridaId, origemNome, destinoNome } = dados;
    return notificacoesRepository.create({
      destinatarioId: passageiroId,
      tipo:           'ATUALIZACAO_CORRIDA',
      titulo:         'Corrida finalizada',
      mensagem:       `Sua corrida de ${origemNome} para ${destinoNome} foi concluída e o pagamento confirmado.`,
      referenciaId:   corridaId,
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
