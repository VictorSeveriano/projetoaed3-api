'use strict';
/**
 * notificacoes.repository.js — Repositório de notificações com Prisma ORM.
 */

const prisma = require('../database/prisma');

class NotificacoesRepository {
  async findByDestinatario(destinatarioId) {
    return prisma.notificacao.findMany({
      where: { destinatarioId },
      orderBy: { criadaEm: 'desc' }
    });
  }

  async findNaoLidas(destinatarioId) {
    return prisma.notificacao.findMany({
      where: {
        destinatarioId,
        lida: false
      },
      orderBy: { criadaEm: 'desc' }
    });
  }

  async create(dados) {
    return prisma.notificacao.create({
      data: {
        destinatarioId: dados.destinatarioId,
        tipo:           dados.tipo,
        titulo:         dados.titulo,
        mensagem:       dados.mensagem,
        referenciaId:   dados.referenciaId   || null,
        acaoMotorista:  dados.acaoMotorista  || null,
      }
    });
  }

  /**
   * Atualiza o campo acaoMotorista na notificação NOVA_CORRIDA
   * de um motorista específico para uma corrida específica.
   * Usado quando o motorista aceita (ACEITA) ou recusa (RECUSADA).
   */
  async atualizarAcaoMotorista(corridaId, motoristaUsuarioId, acao) {
    try {
      await prisma.notificacao.updateMany({
        where: {
          destinatarioId: motoristaUsuarioId,
          tipo:           'NOVA_CORRIDA',
          referenciaId:   corridaId,
        },
        data: {
          acaoMotorista: acao,
          lida:          true,
        }
      });
    } catch (error) {
      // Não falhar o fluxo principal se a notificação não for encontrada
      console.error('[NotificacoesRepository] atualizarAcaoMotorista:', error.message);
    }
  }

  async marcarLida(id) {
    try {
      return await prisma.notificacao.update({
        where: { id },
        data: { lida: true }
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async marcarTodasLidas(destinatarioId) {
    await prisma.notificacao.updateMany({
      where: { destinatarioId },
      data: { lida: true }
    });
  }
}

module.exports = new NotificacoesRepository();
