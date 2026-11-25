'use strict';
/**
 * notificacoes.repository.js — Repositório de notificações com Prisma ORM,
 * validação de destinatário elegível, proteção contra concorrência e deduplicação.
 */

const prisma = require('../database/prisma');
const { ADMIN_ID } = require('../utils/constants');
const { ehUuid } = require('../utils/prismaMappers');

const PERFIS_ATIVOS_NOTIFICAVEIS = new Set(['ADMINISTRADOR', 'MOTORISTA', 'USUARIO']);

/** Janela temporal para evitar duplicação de notificações idênticas não lidas em retries/concorrência. */
const JANELA_DEDUPLICACAO_MS = 5 * 60 * 1000;

class NotificacoesRepository {
  constructor() {
    this._adminIdResolvido = null;
    /** Coalescência em memória para chamadas simultâneas idênticas no mesmo processo. */
    this._criacoesEmAndamento = new Map();
  }

  /**
   * Resolve o ID real do destinatário e valida se a conta existe e possui perfil ativo
   * compatível com o tipo de notificação emitida.
   */
  async _resolverEValidarDestinatario(destinatarioId, tipoNotificacao) {
    if (!destinatarioId || destinatarioId === ADMIN_ID) {
      if (process.env.NODE_ENV !== 'test' && this._adminIdResolvido) {
        return this._adminIdResolvido;
      }

      if (destinatarioId && ehUuid(destinatarioId)) {
        const existeFixo = await prisma.usuario.findUnique({
          where: { id: destinatarioId },
          select: { id: true, perfil: true },
        });
        if (existeFixo && PERFIS_ATIVOS_NOTIFICAVEIS.has(existeFixo.perfil)) {
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

    if (!ehUuid(destinatarioId)) {
      console.warn(`[NotificacoesRepository] Destinatário inválido ignorado para tipo=${tipoNotificacao}.`);
      return null;
    }

    const destinatario = await prisma.usuario.findUnique({
      where: { id: destinatarioId },
      select: { id: true, perfil: true },
    });

    if (!destinatario || !PERFIS_ATIVOS_NOTIFICAVEIS.has(destinatario.perfil)) {
      console.warn(
        `[NotificacoesRepository] Notificação bloqueada: destinatário inexistente ou inativo (${destinatarioId}, tipo=${tipoNotificacao}).`
      );
      return null;
    }

    // Validação de permissão por perfil: ofertas NOVA_CORRIDA só podem ser destinadas a MOTORISTA
    if (tipoNotificacao === 'NOVA_CORRIDA' && destinatario.perfil !== 'MOTORISTA') {
      console.warn(
        `[NotificacoesRepository] Permissão negada: NOVA_CORRIDA não pode ser enviada ao perfil ${destinatario.perfil}.`
      );
      return null;
    }

    // Solicitações administrativas só podem ser destinadas a ADMINISTRADOR
    if (
      (tipoNotificacao === 'SOLICITACAO_MOTORISTA' || tipoNotificacao === 'SOLICITACAO_VEICULO') &&
      destinatario.perfil !== 'ADMINISTRADOR'
    ) {
      console.warn(
        `[NotificacoesRepository] Permissão negada: ${tipoNotificacao} restrita a ADMINISTRADOR.`
      );
      return null;
    }

    return destinatario.id;
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

  /**
   * Cria uma notificação validando destinatário elegível e prevenindo duplicações
   * sob concorrência ou reexecução de tentativas transitórias.
   */
  async create(dados) {
    const destinatarioId = await this._resolverEValidarDestinatario(dados.destinatarioId, dados.tipo);
    if (!destinatarioId) {
      return null;
    }

    const referenciaId = dados.referenciaId && ehUuid(dados.referenciaId) ? dados.referenciaId : null;
    const chaveCoalescencia = [
      destinatarioId,
      dados.tipo || '',
      referenciaId || 'sem-ref',
      dados.titulo || '',
      dados.mensagem || '',
    ].join('::');

    if (this._criacoesEmAndamento.has(chaveCoalescencia)) {
      return this._criacoesEmAndamento.get(chaveCoalescencia);
    }

    const promessaCriacao = (async () => {
      // Deduplicação em banco para eventos referenciados (evita notificações duplicadas em retries/concorrência)
      if (referenciaId) {
        const criterioExistente =
          dados.tipo === 'NOVA_CORRIDA'
            ? {
                destinatarioId,
                tipo: 'NOVA_CORRIDA',
                referenciaId,
              }
            : {
                destinatarioId,
                tipo: dados.tipo,
                referenciaId,
                titulo: dados.titulo,
                mensagem: dados.mensagem,
                lida: false,
                criadaEm: { gte: new Date(Date.now() - JANELA_DEDUPLICACAO_MS) },
              };

        const jaExistente = await prisma.notificacao.findFirst({
          where: criterioExistente,
          orderBy: { criadaEm: 'desc' },
        });
        if (jaExistente) {
          return jaExistente;
        }
      }

      return prisma.notificacao.create({
        data: {
          destinatarioId,
          tipo:          dados.tipo,
          titulo:        dados.titulo,
          mensagem:      dados.mensagem,
          referenciaId,
          acaoMotorista: dados.acaoMotorista || null,
        },
      });
    })();

    this._criacoesEmAndamento.set(chaveCoalescencia, promessaCriacao);
    try {
      return await promessaCriacao;
    } finally {
      if (this._criacoesEmAndamento.get(chaveCoalescencia) === promessaCriacao) {
        this._criacoesEmAndamento.delete(chaveCoalescencia);
      }
    }
  }

  /**
   * Atualiza o campo acaoMotorista na notificação NOVA_CORRIDA de um motorista específico.
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
