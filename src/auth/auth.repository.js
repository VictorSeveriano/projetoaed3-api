'use strict';
/**
 * auth.repository.js — Repositório de usuários com Prisma ORM.
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../database/prisma');
const {
  ehUuid,
  enderecoParaPrisma,
  formatarEndereco,
  formatarEnderecoSql,
} = require('../utils/prismaMappers');

function formatarUsuario(usuarioPrisma) {
  if (!usuarioPrisma) return null;
  const { endereco, ...resto } = usuarioPrisma;
  resto.endereco = formatarEndereco(endereco);
  return resto;
}

function formatarUsuarioSql(row, incluirSenha = false) {
  if (!row) return null;
  const base = {
    id:           row.id,
    nome:         row.nome,
    cpf:          row.cpf,
    celular:      row.celular,
    email:        row.email,
    usuario:      row.usuario,
    perfil:       row.perfil,
    enderecoId:   row.endereco_id,
    criadoEm:     row.criado_em,
    atualizadoEm: row.atualizado_em,
    endereco:     formatarEnderecoSql(row),
  };
  if (incluirSenha) {
    base.senha = row.senha;
  }
  return base;
}

const SELECT_USUARIO_COM_ENDERECO = Prisma.sql`
  SELECT
    u."id", u."nome", u."cpf", u."celular", u."email", u."usuario",
    u."senha", u."perfil", u."endereco_id", u."criado_em", u."atualizado_em",
    e."id" AS "e_id", e."logradouro" AS "e_logradouro", e."numero" AS "e_numero",
    e."complemento" AS "e_complemento", e."bairro" AS "e_bairro", e."cidade" AS "e_cidade",
    e."estado" AS "e_estado", e."uf" AS "e_uf", e."cep" AS "e_cep", e."pais" AS "e_pais",
    e."latitude" AS "e_latitude", e."longitude" AS "e_longitude",
    e."criado_em" AS "e_criado_em", e."atualizado_em" AS "e_atualizado_em"
  FROM "usuarios" u
  LEFT JOIN "enderecos" e ON e."id" = u."endereco_id"
`;

class AuthRepository {
  async findAll(filtros = {}) {
    const condicoes = [Prisma.sql`u."perfil" <> 'INATIVO'`];

    if (filtros.perfil) {
      condicoes.push(Prisma.sql`u."perfil" = ${String(filtros.perfil).toUpperCase()}`);
    }

    if (filtros.search) {
      const termo = String(filtros.search).trim();
      if (termo) {
        const padrao = `%${termo}%`;
        condicoes.push(Prisma.sql`(u."nome" ILIKE ${padrao} OR u."usuario" ILIKE ${padrao})`);
      }
    }

    const whereSql = Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}`;
    const rows = await prisma.$queryRaw`
      ${SELECT_USUARIO_COM_ENDERECO}
      ${whereSql}
      ORDER BY u."criado_em" ASC
    `;
    return rows.map((r) => formatarUsuarioSql(r, false));
  }

  /** Consulta leve usada pelo authMiddleware (sem JOIN de endereço). */
  async encontrarResumoAuthPorId(id) {
    if (!ehUuid(id)) return null;
    return prisma.usuario.findUnique({
      where: { id },
      select: { id: true, usuario: true, nome: true, perfil: true },
    });
  }

  async encontrarPorUsuario(usuario) {
    if (!usuario) return null;
    const rows = await prisma.$queryRaw`
      ${SELECT_USUARIO_COM_ENDERECO}
      WHERE u."usuario" = ${String(usuario)}
      LIMIT 1
    `;
    return formatarUsuarioSql(rows[0], true);
  }

  async encontrarPorId(id) {
    if (!ehUuid(id)) return null;
    const rows = await prisma.$queryRaw`
      ${SELECT_USUARIO_COM_ENDERECO}
      WHERE u."id" = ${id}::uuid
      LIMIT 1
    `;
    return formatarUsuarioSql(rows[0], true);
  }

  async atualizarSenha(id, senha) {
    return prisma.usuario.update({
      where: { id },
      data: { senha, atualizadoEm: new Date() },
      select: { id: true },
    });
  }

  async existsByCpf(cpf) {
    const count = await prisma.usuario.count({
      where: { cpf },
    });
    return count > 0;
  }

  async existsByEmail(email) {
    const count = await prisma.usuario.count({
      where: { email },
    });
    return count > 0;
  }

  async create(dados) {
    const novoUsuario = await prisma.usuario.create({
      data: {
        nome: dados.nome,
        cpf: dados.cpf,
        celular: dados.celular,
        email: dados.email,
        usuario: dados.usuario,
        senha: dados.senha,
        perfil: dados.perfil,
        endereco: dados.endereco ? {
          create: enderecoParaPrisma(dados.endereco),
        } : undefined,
      },
      include: { endereco: true, motorista: true },
    });
    return formatarUsuario(novoUsuario);
  }

  async update(id, dados) {
    const dataUpdate = {};

    if (dados.nome !== undefined) dataUpdate.nome = dados.nome;
    if (dados.usuario !== undefined) dataUpdate.usuario = dados.usuario;
    if (dados.cpf !== undefined) dataUpdate.cpf = dados.cpf;
    if (dados.celular !== undefined) dataUpdate.celular = dados.celular;
    if (dados.email !== undefined) dataUpdate.email = dados.email;
    dataUpdate.atualizadoEm = new Date();

    if (dados.endereco) {
      const u = await prisma.usuario.findUnique({ where: { id }, select: { enderecoId: true } });
      if (u && u.enderecoId) {
        dataUpdate.endereco = {
          update: enderecoParaPrisma(dados.endereco),
        };
      } else {
        dataUpdate.endereco = {
          create: enderecoParaPrisma(dados.endereco),
        };
      }
    }

    try {
      const atualizado = await prisma.usuario.update({
        where: { id },
        data: dataUpdate,
        include: { endereco: true },
      });
      return formatarUsuario(atualizado);
    } catch (error) {
      if (error.code === 'P2025') return null; // Record to update not found
      throw error;
    }
  }
}

module.exports = new AuthRepository();
