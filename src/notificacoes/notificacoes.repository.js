'use strict';
/**
 * notificacoes.repository.js — Repositório de notificações com Prisma ORM.
 */

const prisma = require('../database/prisma');
const { ADMIN_ID } = require('../utils/constants');

class NotificacoesRepository {
  constructor() {
    this._adminIdResolvido = null;
  }

  /**
   * Resolve o ID real do destinatário quando a notificação é endereçada ao ADMIN_ID simbólico.
   * No PostgreSQL, o administrador possui UUID gerado pelo banco (perfil = 'ADMINISTRADOR').
   */
  async _resolverDestinatarioId(destinatarioId) {
    if (!destinatarioId || destinatarioId === ADMIN_ID) {
      if (process.env.NODE_ENV !== 'test' && this._adminIdResolvido) {
        return this._adminIdResolvido;
      }

      if (destinatarioId) {
        const existeFixo = await prisma.usuario.findUnique({
          where: { id: destinatarioId },
          select: { id: true },
        });
        if (existeFixo) {
          this._adminIdResolvido = existeFixo.id;
          return existeFixo.id;
        }
      }

      const admin = await prisma.usuario.findFirst({
        where: { perfil: 'ADMINISTRADOR' },
        orderBy: { criadoEm: 'asc' },
        select: { id: true },
      });
      if (admin) {
        this._adminIdResolvido = admin.id;
        return admin.id;
      }
      return null;
    }
    return destinatarioId;
  }

  async findByDestinatario(destinatarioId) {
    return prisma.notificacao.findMany({
      where: { destinatarioId },
      orderBy: { criadaEm: 'desc' },
    });
  }

  async findById(id) {
    return prisma.notificacao.findUnique({
      where: { id },
    });
  }

  async findNaoLidas(destinatarioId) {
    return prisma.notificacao.findMany({
      where: {
        destinatarioId,
        lida: false,
      },
      orderBy: { criadaEm: 'desc' },
    });
  }

  async contarNaoLidas(destinatarioId) {
    return prisma.notificacao.count({
      where: {
        destinatarioId,
        lida: false,
      },
    });
  }

  /**
   * Agregação leve de notificações não lidas agrupadas por tipo para badges da Sidebar.
   * Evita carregar corpo/mensagem e histórico de notificações já lidas.
   */
  async obterResumoNaoLidas(destinatarioId) {
    const grupos = await prisma.notificacao.groupBy({
      by: ['tipo'],
      where: {
        destinatarioId,
        lida: false,
      },
      _count: { _all: true },
    });

    const porTipo = {};
    let naoLidas = 0;
    for (const g of grupos) {
      const qtd = Number(g._count?._all || 0);
      porTipo[g.tipo] = qtd;
      naoLidas += qtd;
    }
    return { naoLidas, porTipo };
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
      },
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
        },
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
        data: { lida: true },
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async marcarTodasLidas(destinatarioId) {
    await prisma.notificacao.updateMany({
      where: { destinatarioId, lida: false },
      data: { lida: true },
    });
  }

  async marcarLidaPorReferencia(tipo, referenciaIds) {
    const ids = (Array.isArray(referenciaIds) ? referenciaIds : [referenciaIds]).filter(Boolean);
    if (ids.length === 0) return;
    try {
      await prisma.notificacao.updateMany({
        where: {
          tipo,
          referenciaId: { in: ids },
          lida: false,
        },
        data: { lida: true },
      });
    } catch (error) {
      console.error('[NotificacoesRepository] marcarLidaPorReferencia:', error.message);
    }
  }
}

module.exports = new NotificacoesRepository();
