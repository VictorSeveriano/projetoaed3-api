'use strict';
/**
 * motoristas.repository.js — Repositório de motoristas com Prisma ORM.
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../database/prisma');
const {
  ehUuid,
  paraNumeroOuNull,
  formatarEndereco,
  formatarEnderecoSql,
} = require('../utils/prismaMappers');

const INCLUDE_USUARIO_E_VEICULO = {
  usuario: {
    include: {
      endereco: true,
      veiculos: {
        where: { statusAprovacao: { not: 'EXCLUIDO' } },
        orderBy: { criadoEm: 'desc' },
        take: 1,
      },
    },
  },
};

/**
 * Consulta única com LEFT JOIN LATERAL para carregar motorista, usuário, endereço
 * e veículo mais recente em 1 único round-trip ao PostgreSQL.
 */
const SELECT_MOTORISTA_COMPLETO_SQL = Prisma.sql`
  SELECT
    m."id", m."usuario_id", m."cnh", m."status_cadastro", m."status_presenca",
    m."criado_em", m."atualizado_em",
    u."id" AS "u_id", u."nome" AS "u_nome", u."cpf" AS "u_cpf",
    u."celular" AS "u_celular", u."email" AS "u_email", u."usuario" AS "u_usuario",
    u."perfil" AS "u_perfil", u."endereco_id" AS "u_endereco_id",
    u."criado_em" AS "u_criado_em", u."atualizado_em" AS "u_atualizado_em",
    e."id" AS "e_id", e."logradouro" AS "e_logradouro", e."numero" AS "e_numero",
    e."complemento" AS "e_complemento", e."bairro" AS "e_bairro", e."cidade" AS "e_cidade",
    e."estado" AS "e_estado", e."uf" AS "e_uf", e."cep" AS "e_cep", e."pais" AS "e_pais",
    e."latitude" AS "e_latitude", e."longitude" AS "e_longitude",
    e."criado_em" AS "e_criado_em", e."atualizado_em" AS "e_atualizado_em",
    v."id" AS "v_id", v."marca" AS "v_marca", v."modelo" AS "v_modelo", v."ano" AS "v_ano",
    v."placa" AS "v_placa", v."cor" AS "v_cor", v."porte" AS "v_porte", v."classe" AS "v_classe",
    v."quilometragem" AS "v_quilometragem", v."quantidade_passageiros" AS "v_quantidade_passageiros",
    v."possui_ar_condicionado" AS "v_possui_ar_condicionado", v."possui_extintor" AS "v_possui_extintor",
    v."possui_cinto_seguranca" AS "v_possui_cinto_seguranca",
    v."documentacao_regularizada" AS "v_documentacao_regularizada",
    v."status_aprovacao" AS "v_status_aprovacao", v."status" AS "v_status",
    v."tarifa_base" AS "v_tarifa_base", v."motorista_id" AS "v_motorista_id",
    v."criado_em" AS "v_criado_em", v."atualizado_em" AS "v_atualizado_em"
  FROM "motoristas" m
  INNER JOIN "usuarios" u ON u."id" = m."usuario_id"
  LEFT JOIN "enderecos" e ON e."id" = u."endereco_id"
  LEFT JOIN LATERAL (
    SELECT *
    FROM "veiculos" v0
    WHERE v0."motorista_id" = m."usuario_id"
      AND v0."status_aprovacao" <> 'EXCLUIDO'
    ORDER BY v0."criado_em" DESC
    LIMIT 1
  ) v ON true
`;

function formatarMotorista(m) {
  if (!m) return null;
  const { usuario, ...resto } = m;
  if (usuario !== undefined) {
    let usuarioLimpo = null;
    let veiculoLimpo = null;
    if (usuario) {
      const { senha, endereco, veiculos, ...dadosUsuario } = usuario;
      usuarioLimpo = {
        ...dadosUsuario,
        endereco: formatarEndereco(endereco),
      };
      if (Array.isArray(veiculos) && veiculos[0]) {
        veiculoLimpo = {
          ...veiculos[0],
          quilometragem: paraNumeroOuNull(veiculos[0].quilometragem) ?? 0,
        };
      }
    }
    Object.defineProperty(resto, '_enriquecidoPreCarregado', {
      value: { usuario: usuarioLimpo, veiculo: veiculoLimpo },
      enumerable: false,
      configurable: true,
    });
  }
  return resto;
}

function formatarMotoristaSql(row) {
  if (!row) return null;
  const resto = {
    id: row.id,
    usuarioId: row.usuario_id,
    cnh: row.cnh,
    statusCadastro: row.status_cadastro,
    statusPresenca: row.status_presenca,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };

  const usuarioLimpo = row.u_id ? {
    id: row.u_id,
    nome: row.u_nome,
    cpf: row.u_cpf,
    celular: row.u_celular,
    email: row.u_email,
    usuario: row.u_usuario,
    perfil: row.u_perfil,
    enderecoId: row.u_endereco_id,
    criadoEm: row.u_criado_em,
    atualizadoEm: row.u_atualizado_em,
    endereco: formatarEnderecoSql(row),
  } : null;

  const veiculoLimpo = row.v_id ? {
    id: row.v_id,
    marca: row.v_marca,
    modelo: row.v_modelo,
    ano: row.v_ano,
    placa: row.v_placa,
    cor: row.v_cor,
    porte: row.v_porte,
    classe: row.v_classe,
    quilometragem: paraNumeroOuNull(row.v_quilometragem) ?? 0,
    quantidadePassageiros: row.v_quantidade_passageiros,
    possuiArCondicionado: row.v_possui_ar_condicionado,
    possuiExtintor: row.v_possui_extintor,
    possuiCintoSeguranca: row.v_possui_cinto_seguranca,
    documentacaoRegularizada: row.v_documentacao_regularizada,
    statusAprovacao: row.v_status_aprovacao,
    status: row.v_status,
    tarifaBase: row.v_tarifa_base,
    motoristaId: row.v_motorista_id,
    criadoEm: row.v_criado_em,
    atualizadoEm: row.v_atualizado_em,
  } : null;

  Object.defineProperty(resto, '_enriquecidoPreCarregado', {
    value: { usuario: usuarioLimpo, veiculo: veiculoLimpo },
    enumerable: false,
    configurable: true,
  });

  return resto;
}

class MotoristasRepository {
  async findAll() {
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      ORDER BY m."criado_em" ASC
    `;
    return rows.map(formatarMotoristaSql);
  }

  async findById(id) {
    if (!ehUuid(id)) return null;
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      WHERE m."id" = ${id}::uuid
      LIMIT 1
    `;
    return formatarMotoristaSql(rows[0]);
  }

  async findByUsuarioId(usuarioId) {
    if (!ehUuid(usuarioId)) return null;
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      WHERE m."usuario_id" = ${usuarioId}::uuid
      LIMIT 1
    `;
    return formatarMotoristaSql(rows[0]);
  }

  /** Busca motorista por id ou usuarioId em uma única consulta JOIN (elimina 2 round-trips sequenciais). */
  async findByIdOuUsuarioId(id) {
    if (!ehUuid(id)) return null;
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      WHERE m."id" = ${id}::uuid OR m."usuario_id" = ${id}::uuid
      LIMIT 1
    `;
    return formatarMotoristaSql(rows[0]);
  }

  /** Consulta mínima (sem joins) para validação de autorização e geração de relatórios. */
  async findResumoByIdOuUsuarioId(id) {
    if (!ehUuid(id)) return null;
    return prisma.motorista.findFirst({
      where: { OR: [{ id }, { usuarioId: id }] },
      select: {
        id: true,
        usuarioId: true,
        cnh: true,
        statusCadastro: true,
        statusPresenca: true,
      },
    });
  }

  async existsByCnh(cnh) {
    const motorista = await prisma.motorista.findUnique({
      where: { cnh },
      select: { id: true },
    });
    return !!motorista;
  }

  async findByStatusCadastro(statusCadastro) {
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      WHERE m."status_cadastro" = ${statusCadastro}
      ORDER BY m."criado_em" ASC
    `;
    return rows.map(formatarMotoristaSql);
  }

  async findByStatusPresenca(statusPresenca) {
    const rows = await prisma.$queryRaw`
      ${SELECT_MOTORISTA_COMPLETO_SQL}
      WHERE m."status_cadastro" = 'APROVADO' AND m."status_presenca" = ${statusPresenca}
      ORDER BY m."criado_em" ASC
    `;
    return rows.map(formatarMotoristaSql);
  }

  async create(dados) {
    return prisma.motorista.create({
      data: {
        usuarioId: dados.usuarioId,
        cnh: dados.cnh,
        statusCadastro: 'PENDENTE',
        statusPresenca: 'OFFLINE',
      },
    });
  }

  async updateStatusCadastro(id, statusCadastro) {
    try {
      const m = await prisma.motorista.update({
        where: { id },
        data: {
          statusCadastro,
          statusPresenca: statusCadastro === 'APROVADO' ? 'ONLINE' : 'OFFLINE',
          atualizadoEm: new Date(),
        },
        include: INCLUDE_USUARIO_E_VEICULO,
      });
      return formatarMotorista(m);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateStatusPresenca(id, statusPresenca) {
    try {
      return await prisma.motorista.update({
        where: { id },
        data: {
          statusPresenca,
          atualizadoEm: new Date(),
        },
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateCnh(id, cnh) {
    try {
      return await prisma.motorista.update({
        where: { id },
        data: {
          cnh,
          atualizadoEm: new Date(),
        },
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }
}

module.exports = new MotoristasRepository();
