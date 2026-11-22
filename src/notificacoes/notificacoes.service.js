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
const { readCache } = require('../utils/readCache');

const CACHE_TTL_LISTA_MS = 15000;
const CACHE_TTL_RESUMO_MS = 20000;

class NotificacoesService {
  _invalidarCacheDestinatario(destinatarioId) {
    if (destinatarioId) {
      readCache.invalidar(`notificacoes:lista:${destinatarioId}`);
      readCache.invalidar(`notificacoes:resumo:${destinatarioId}`);
    } else {
      readCache.invalidarPrefixo('notificacoes:');
    }
  }

  async listar(destinatarioId) {
    return readCache.obterOuCarregar(
      `notificacoes:lista:${destinatarioId}`,
      CACHE_TTL_LISTA_MS,
      () => notificacoesRepository.findByDestinatario(destinatarioId)
    );
  }

  async obterResumo(destinatarioId) {
    return readCache.obterOuCarregar(
      `notificacoes:resumo:${destinatarioId}`,
      CACHE_TTL_RESUMO_MS,
      async () => {
        if (typeof notificacoesRepository.obterResumoNaoLidas === 'function') {
          const resumo = await notificacoesRepository.obterResumoNaoLidas(destinatarioId);
          if (resumo) return resumo;
        }
        const lista = (await notificacoesRepository.findByDestinatario(destinatarioId)) || [];
        const porTipo = {};
        let naoLidas = 0;
        for (const n of lista) {
          if (!n.lida) {
            naoLidas++;
            porTipo[n.tipo] = (porTipo[n.tipo] || 0) + 1;
          }
        }
        return { naoLidas, porTipo };
      }
    );
  }

  async contarNaoLidas(destinatarioId) {
    if (typeof notificacoesRepository.contarNaoLidas === 'function') {
      const total = await notificacoesRepository.contarNaoLidas(destinatarioId);
      if (typeof total === 'number') return total;
    }
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
    const criada = await notificacoesRepository.create(payload);
    readCache.invalidarPrefixo('notificacoes:');
    return criada;
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
    const res = await notificacoesRepository.atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao);
    this._invalidarCacheDestinatario(motoristaUsuarioId);
    return res;
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
    this._invalidarCacheDestinatario(atualizada.destinatarioId || usuarioLogado?.id);
    return atualizada;
  }

  async marcarTodasLidas(destinatarioId) {
    const res = await notificacoesRepository.marcarTodasLidas(destinatarioId);
    this._invalidarCacheDestinatario(destinatarioId);
    return res;
  }

  async marcarSolicitacaoMotoristaLida(referenciaIds) {
    if (typeof notificacoesRepository.marcarLidaPorReferencia === 'function') {
      await notificacoesRepository.marcarLidaPorReferencia('SOLICITACAO_MOTORISTA', referenciaIds);
      readCache.invalidarPrefixo('notificacoes:');
    }
  }

  async marcarSolicitacaoVeiculoLida(referenciaIds) {
    if (typeof notificacoesRepository.marcarLidaPorReferencia === 'function') {
      await notificacoesRepository.marcarLidaPorReferencia('SOLICITACAO_VEICULO', referenciaIds);
      readCache.invalidarPrefixo('notificacoes:');
    }
  }
}

module.exports = new NotificacoesService();
