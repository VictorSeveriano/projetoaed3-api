'use strict';

const { Prisma } = require('@prisma/client');
const prisma = require('../database/prisma');
const { ehUuid } = require('../utils/prismaMappers');

function mapearRegistroAuditoriaSql(row) {
  return {
    id: row.id,
    usuarioId: row.usuario_id,
    perfil: row.perfil,
    acao: row.acao,
    modulo: row.modulo,
    entidade: row.entidade,
    entidadeId: row.entidade_id,
    descricao: row.descricao,
    dadosAnteriores: row.dados_anteriores,
    dadosNovos: row.dados_novos,
    resultado: row.resultado,
    statusHttp: row.status_http,
    rota: row.rota,
    metodoHttp: row.metodo_http,
    ip: row.ip,
    userAgent: row.user_agent,
    criadoEm: row.criado_em,
    usuario: row.u_nome !== null || row.u_usuario !== null || row.u_email !== null
      ? { nome: row.u_nome, usuario: row.u_usuario, email: row.u_email }
      : null,
  };
}

class AuditoriaRepository {
  async create(data) {
    return prisma.auditoria.create({
      data,
    });
  }

  /**
   * Busca paginada com LEFT JOIN + COUNT(*) OVER() em 1 único round-trip ao PostgreSQL
   * (elimina transação interativa e segunda consulta separada de usuário).
   */
  async findAll({ skip = 0, take = 20, where = {} }) {
    const condicoes = [];

    if (where.usuarioId) {
      if (!ehUuid(where.usuarioId)) return { total: 0, registros: [] };
      condicoes.push(Prisma.sql`a."usuario_id" = ${where.usuarioId}::uuid`);
    }
    if (where.perfil) {
      condicoes.push(Prisma.sql`a."perfil" = ${where.perfil}`);
    }
    if (where.resultado) {
      condicoes.push(Prisma.sql`a."resultado" = ${where.resultado}`);
    }
    if (where.usuario?.nome?.contains) {
      const padrao = `%${where.usuario.nome.contains}%`;
      condicoes.push(Prisma.sql`u."nome" ILIKE ${padrao}`);
    }
    if (where.criadoEm?.gte) {
      condicoes.push(Prisma.sql`a."criado_em" >= ${where.criadoEm.gte}`);
    }
    if (where.criadoEm?.lte) {
      condicoes.push(Prisma.sql`a."criado_em" <= ${where.criadoEm.lte}`);
    }

    const whereSql = condicoes.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}`
      : Prisma.empty;

    const rows = await prisma.$queryRaw`
      SELECT
        a."id", a."usuario_id", a."perfil", a."acao", a."modulo",
        a."entidade", a."entidade_id", a."descricao",
        a."dados_anteriores", a."dados_novos", a."resultado",
        a."status_http", a."rota", a."metodo_http", a."ip",
        a."user_agent", a."criado_em",
        u."nome" AS "u_nome", u."usuario" AS "u_usuario", u."email" AS "u_email",
        COUNT(*) OVER()::int AS "_total"
      FROM "auditoria" a
      LEFT JOIN "usuarios" u ON u."id" = a."usuario_id"
      ${whereSql}
      ORDER BY a."criado_em" DESC
      LIMIT ${Number(take)} OFFSET ${Number(skip)}
    `;

    let total = rows.length > 0 ? Number(rows[0]._total) : 0;
    if (rows.length === 0 && Number(skip) > 0) {
      total = await prisma.auditoria.count({ where });
    }

    return {
      total,
      registros: rows.map(mapearRegistroAuditoriaSql),
    };
  }

  async findById(id) {
    if (!ehUuid(id)) return null;
    const rows = await prisma.$queryRaw`
      SELECT
        a."id", a."usuario_id", a."perfil", a."acao", a."modulo",
        a."entidade", a."entidade_id", a."descricao",
        a."dados_anteriores", a."dados_novos", a."resultado",
        a."status_http", a."rota", a."metodo_http", a."ip",
        a."user_agent", a."criado_em",
        u."nome" AS "u_nome", u."usuario" AS "u_usuario", u."email" AS "u_email"
      FROM "auditoria" a
      LEFT JOIN "usuarios" u ON u."id" = a."usuario_id"
      WHERE a."id" = ${id}::uuid
      LIMIT 1
    `;
    return rows[0] ? mapearRegistroAuditoriaSql(rows[0]) : null;
  }
}

module.exports = new AuditoriaRepository();
