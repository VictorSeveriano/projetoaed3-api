'use strict';
/**
 * notificacoes.repository.js — Repositório de notificações com Prisma ORM.
 */

const prisma = require('../database/prisma');
const { ADMIN_ID } = require('../utils/constants');

class NotificacoesRepository {
  /**
   * Resolve o ID real do destinatário quando a notificação é endereçada ao ADMIN_ID simbólico.
   * No PostgreSQL, o administrador possui UUID gerado pelo banco (perfil = 'ADMINISTRADOR').
   */
  async _resolverDestinatarioId(destinatarioId) {
    if (!destinatarioId || destinatarioId === ADMIN_ID) {
      if (destinatarioId) {
        const existeFixo = await prisma.usuario.findUnique({
          where: { id: destinatarioId },
          select: { id: true },
        });
        if (existeFixo) return existeFixo.id;
      }

      const admin = await prisma.usuario.findFirst({
        where: { perfil: 'ADMINISTRADOR' },
        orderBy: { criadoEm: 'asc' },
        select: { id: true },
      });
      return admin ? admin.id : null;
    }
    return destinatarioId;
  }

  async findByDestinatario(destinatarioId) {
    return prisma.notificacao.findMany({
      where: { destinatarioId },
      orderBy: { criadaEm: 'desc' }
    });
  }

  async findById(id) {
    return prisma.notificacao.findUnique({
      where: { id }
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
    const destinatarioId = await this._resolverDestinatarioId(dados.destinatarioId);
    if (!destinatarioId) {
      return null;
    }

    return prisma.notificacao.create({
      data: {
        destinatarioId,
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
