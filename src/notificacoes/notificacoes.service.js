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
const AppError = require('../utils/AppError');

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

  /**
   * Notifica o passageiro que sua corrida foi cancelada automaticamente por atingir
   * a data/horário agendado sem aceite de motorista.
   */
  async notificarPassageiroExpiracao(passageiroId, dados) {
    const { corridaId, origemNome, destinoNome } = dados;
    return notificacoesRepository.create({
      destinatarioId: passageiroId,
      tipo:           'ATUALIZACAO_CORRIDA',
      titulo:         'Corrida cancelada automaticamente',
      mensagem:       `Sua corrida de ${origemNome} para ${destinoNome} foi cancelada automaticamente pois nenhum motorista a aceitou até o horário agendado.`,
      referenciaId:   corridaId,
    });
  }

  /**
   * Notificação genérica de atualização de corrida (embarque, a caminho, cancelamentos).
   * Reutiliza o mesmo tipo/infra de ATUALIZACAO_CORRIDA.
   */
  async notificarAtualizacaoCorrida(destinatarioId, { corridaId, titulo, mensagem }) {
    return notificacoesRepository.create({
      destinatarioId,
      tipo:         'ATUALIZACAO_CORRIDA',
      titulo,
      mensagem,
      referenciaId: corridaId,
    });
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
