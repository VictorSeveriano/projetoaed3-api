'use strict';
/**
 * corridaEventos.repository.js — Persistência atômica e idempotente dos eventos
 * cronológicos da linha do tempo das corridas (`corrida_eventos`).
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../database/prisma');
const { ehUuid } = require('../utils/prismaMappers');

function mapearEventoRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    corridaId: row.corridaId ?? row.corrida_id,
    tipo: row.tipo,
    titulo: row.titulo,
    descricao: row.descricao,
    autorId: row.autorId ?? row.autor_id ?? null,
    autorPerfil: row.autorPerfil ?? row.autor_perfil ?? null,
    autorNome: row.autorNome ?? row.autor_nome ?? null,
    metadados: row.metadados ?? null,
    chaveIdempotencia: row.chaveIdempotencia ?? row.chave_idempotencia ?? null,
    criadoEm: row.criadoEm ?? row.criado_em,
  };
}

class CorridaEventosRepository {
  /**
   * Registra um evento na linha do tempo de forma idempotente (`ON CONFLICT DO NOTHING`),
   * podendo participar da mesma transação interativa (`tx`) da transição de estado
   * sem jamais abortar a transação PostgreSQL em caso de repetição/concorrência.
   *
   * Quando `db` é um mock parcial de teste unitário sem `corridaEvento`, retorna `null`
   * de forma segura para preservar compatibilidade com suítes mockadas existentes.
   */
  async registrarEvento(dados, db = prisma) {
    if (!dados || !ehUuid(dados.corridaId)) return null;
    if (!db || !db.corridaEvento || typeof db.$queryRaw !== 'function') {
      return null;
    }

    const criadoEm = dados.criadoEm instanceof Date ? dados.criadoEm : new Date(dados.criadoEm || Date.now());
    const autorId = dados.autorId && ehUuid(dados.autorId) ? dados.autorId : null;
    const autorPerfil = dados.autorPerfil ? String(dados.autorPerfil).slice(0, 20) : null;
    const autorNome = dados.autorNome ? String(dados.autorNome).slice(0, 150) : null;
    const titulo = String(dados.titulo || '').slice(0, 160);
    const descricao = String(dados.descricao || '');
    const tipo = String(dados.tipo || '').slice(0, 50);
    const chaveIdempotencia = dados.chaveIdempotencia
      ? String(dados.chaveIdempotencia).slice(0, 140)
      : null;
    const metadadosJson = dados.metadados != null ? JSON.stringify(dados.metadados) : null;

    const autorIdSql = autorId ? Prisma.sql`${autorId}::uuid` : Prisma.sql`NULL`;
    const metadadosSql = metadadosJson != null ? Prisma.sql`${metadadosJson}::jsonb` : Prisma.sql`NULL`;

    const rows = await db.$queryRaw`
      INSERT INTO "corrida_eventos" (
        "corrida_id",
        "tipo",
        "titulo",
        "descricao",
        "autor_id",
        "autor_perfil",
        "autor_nome",
        "metadados",
        "chave_idempotencia",
        "criado_em"
      )
      VALUES (
        ${dados.corridaId}::uuid,
        ${tipo},
        ${titulo},
        ${descricao},
        ${autorIdSql},
        ${autorPerfil},
        ${autorNome},
        ${metadadosSql},
        ${chaveIdempotencia},
        ${criadoEm}
      )
      ON CONFLICT ("chave_idempotencia") DO NOTHING
      RETURNING
        "id",
        "corrida_id" AS "corridaId",
        "tipo",
        "titulo",
        "descricao",
        "autor_id" AS "autorId",
        "autor_perfil" AS "autorPerfil",
        "autor_nome" AS "autorNome",
        "metadados",
        "chave_idempotencia" AS "chaveIdempotencia",
        "criado_em" AS "criadoEm"
    `;

    return rows && rows[0] ? mapearEventoRow(rows[0]) : null;
  }

  /**
   * Registra em lote eventos de expiração para múltiplas corridas dentro da mesma transação.
   */
  async registrarEventosEmLote(listaEventos, db = prisma) {
    if (!Array.isArray(listaEventos) || listaEventos.length === 0) return [];
    if (!db || !db.corridaEvento || typeof db.$queryRaw !== 'function') {
      return [];
    }
    const resultados = [];
    for (const ev of listaEventos) {
      const criado = await this.registrarEvento(ev, db);
      if (criado) resultados.push(criado);
    }
    return resultados;
  }

  /**
   * Carrega todos os eventos persistidos de uma corrida em ordem cronológica estrita,
   * enriquecendo o nome do autor a partir de `usuarios` quando disponível.
   */
  async listarPorCorridaId(corridaId) {
    if (!ehUuid(corridaId)) return [];
    const rows = await prisma.$queryRaw`
      SELECT
        ce."id",
        ce."corrida_id" AS "corridaId",
        ce."tipo",
        ce."titulo",
        ce."descricao",
        ce."autor_id" AS "autorId",
        ce."autor_perfil" AS "autorPerfil",
        COALESCE(ce."autor_nome", u."nome") AS "autorNome",
        ce."metadados",
        ce."chave_idempotencia" AS "chaveIdempotencia",
        ce."criado_em" AS "criadoEm"
      FROM "corrida_eventos" ce
      LEFT JOIN "usuarios" u ON u."id" = ce."autor_id"
      WHERE ce."corrida_id" = ${corridaId}::uuid
      ORDER BY ce."criado_em" ASC, ce."id" ASC
    `;
    return rows.map(mapearEventoRow);
  }
}

module.exports = new CorridaEventosRepository();
