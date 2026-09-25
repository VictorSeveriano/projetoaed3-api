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
        tipo: dados.tipo,
        titulo: dados.titulo,
        mensagem: dados.mensagem,
        referenciaId: dados.referenciaId || null
      }
    });
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
