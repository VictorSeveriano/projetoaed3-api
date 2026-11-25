'use strict';
/**
 * veiculos.repository.js — Repositório de veículos com Prisma ORM.
 */

const { Prisma } = require('@prisma/client');
const prisma = require('../database/prisma');
const {
  ehUuid,
  paraNumeroOuNull,
  formatarEndereco,
  formatarEnderecoSql,
} = require('../utils/prismaMappers');

const INCLUDE_MOTORISTA_COMPLETO = {
  motorista: {
    include: { endereco: true, motorista: true },
  },
};

const SELECT_VEICULO_COM_MOTORISTA_SQL = Prisma.sql`
  SELECT
    v."id", v."marca", v."modelo", v."ano", v."placa", v."cor",
    v."porte", v."classe", v."quilometragem", v."quantidade_passageiros",
    v."possui_ar_condicionado", v."possui_extintor", v."possui_cinto_seguranca",
    v."documentacao_regularizada", v."status_aprovacao", v."status",
    v."tarifa_base", v."motorista_id", v."criado_em", v."atualizado_em",
    u."id" AS "u_id", u."nome" AS "u_nome", u."cpf" AS "u_cpf",
    u."celular" AS "u_celular", u."email" AS "u_email", u."usuario" AS "u_usuario",
    u."perfil" AS "u_perfil", u."endereco_id" AS "u_endereco_id",
    u."criado_em" AS "u_criado_em", u."atualizado_em" AS "u_atualizado_em",
    m."cnh" AS "m_cnh",
    e."id" AS "e_id", e."logradouro" AS "e_logradouro", e."numero" AS "e_numero",
    e."complemento" AS "e_complemento", e."bairro" AS "e_bairro", e."cidade" AS "e_cidade",
    e."estado" AS "e_estado", e."uf" AS "e_uf", e."cep" AS "e_cep", e."pais" AS "e_pais",
    e."latitude" AS "e_latitude", e."longitude" AS "e_longitude",
    e."criado_em" AS "e_criado_em", e."atualizado_em" AS "e_atualizado_em"
  FROM "veiculos" v
  LEFT JOIN "usuarios" u ON u."id" = v."motorista_id"
  LEFT JOIN "enderecos" e ON e."id" = u."endereco_id"
  LEFT JOIN "motoristas" m ON m."usuario_id" = u."id"
`;

function formatarVeiculo(v) {
  if (!v) return null;
  const { motorista, ...resto } = v;
  const formatado = {
    ...resto,
    quilometragem: paraNumeroOuNull(v.quilometragem) ?? 0,
  };

  if (motorista !== undefined) {
    let motoristaEnriquecido = null;
    if (motorista) {
      const { senha, endereco, motorista: motRecord, ...dadosUsuario } = motorista;
      motoristaEnriquecido = {
        ...dadosUsuario,
        endereco: formatarEndereco(endereco),
        cnh: motRecord?.cnh,
      };
    }
    Object.defineProperty(formatado, '_motoristaPreCarregado', {
      value: motoristaEnriquecido,
      enumerable: false,
      configurable: true,
    });
  }

  return formatado;
}

function formatarVeiculoSql(row) {
  if (!row) return null;
  const formatado = {
    id: row.id,
    marca: row.marca,
    modelo: row.modelo,
    ano: row.ano,
    placa: row.placa,
    cor: row.cor,
    porte: row.porte,
    classe: row.classe,
    quilometragem: paraNumeroOuNull(row.quilometragem) ?? 0,
    quantidadePassageiros: row.quantidade_passageiros,
    possuiArCondicionado: row.possui_ar_condicionado,
    possuiExtintor: row.possui_extintor,
    possuiCintoSeguranca: row.possui_cinto_seguranca,
    documentacaoRegularizada: row.documentacao_regularizada,
    statusAprovacao: row.status_aprovacao,
    status: row.status,
    tarifaBase: row.tarifa_base,
    motoristaId: row.motorista_id,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em,
  };

  const motoristaEnriquecido = row.u_id ? {
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
    cnh: row.m_cnh ?? undefined,
  } : null;

  Object.defineProperty(formatado, '_motoristaPreCarregado', {
    value: motoristaEnriquecido,
    enumerable: false,
    configurable: true,
  });

  return formatado;
}

class VeiculosRepository {
  async findAll(filtros = {}) {
    const condicoes = [Prisma.sql`v."status_aprovacao" <> 'EXCLUIDO'`];

    if (filtros.status) {
      const s = filtros.status.toUpperCase();
      condicoes.push(Prisma.sql`(v."status" = ${s} OR v."status_aprovacao" = ${s})`);
    }

    if (filtros.motoristaId) {
      if (!ehUuid(filtros.motoristaId)) return [];
      condicoes.push(Prisma.sql`v."motorista_id" = ${filtros.motoristaId}::uuid`);
    }

    if (filtros.porte) {
      const p = filtros.porte.toLowerCase();
      let porteNormalizado = filtros.porte;
      if (p === 'pequeno') porteNormalizado = 'Pequeno';
      else if (p === 'medio') porteNormalizado = 'Medio';
      else if (p === 'grande') porteNormalizado = 'Grande';
      condicoes.push(Prisma.sql`v."porte" = ${porteNormalizado}`);
    }

    if (filtros.classe) {
      condicoes.push(Prisma.sql`v."classe" = ${filtros.classe.toUpperCase()}`);
    }

    if (filtros.search) {
      const termo = filtros.search.trim();
      if (termo) {
        const padrao = `%${termo}%`;
        condicoes.push(
          Prisma.sql`(v."marca" ILIKE ${padrao} OR v."modelo" ILIKE ${padrao} OR v."placa" ILIKE ${padrao} OR u."nome" ILIKE ${padrao})`
        );
      }
    }

    const whereSql = Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}`;
    const rows = await prisma.$queryRaw`
      ${SELECT_VEICULO_COM_MOTORISTA_SQL}
      ${whereSql}
      ORDER BY v."criado_em" ASC
    `;
    return rows.map(formatarVeiculoSql);
  }

  /** Consulta leve apenas com os campos necessários para agregações do Dashboard (sem joins de motorista/endereço). */
  async findAllParaDashboard() {
    return prisma.veiculo.findMany({
      where: { statusAprovacao: { not: 'EXCLUIDO' } },
      select: {
        id: true,
        status: true,
        classe: true,
        marca: true,
        modelo: true,
      },
    });
  }

  async findById(id) {
    if (!ehUuid(id)) return null;
    const veiculo = await prisma.veiculo.findUnique({
      where: { id },
    });
    return formatarVeiculo(veiculo);
  }

  async findDisponiveis() {
    const veiculos = await prisma.veiculo.findMany({
      where: {
        statusAprovacao: 'APROVADO',
        status: 'DISPONIVEL',
      },
      orderBy: { criadoEm: 'asc' },
    });
    return veiculos.map(formatarVeiculo);
  }

  async findByMotoristaId(motoristaId) {
    if (!ehUuid(motoristaId)) return null;
    const veiculo = await prisma.veiculo.findFirst({
      where: { motoristaId, statusAprovacao: { not: 'EXCLUIDO' } },
      orderBy: { criadoEm: 'desc' },
    });
    return formatarVeiculo(veiculo);
  }

  async softDelete(id) {
    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: {
          statusAprovacao: 'EXCLUIDO',
          status: 'INDISPONIVEL',
          atualizadoEm: new Date(),
        },
        include: INCLUDE_MOTORISTA_COMPLETO,
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async findByStatusAprovacao(statusAprovacao) {
    const rows = await prisma.$queryRaw`
      ${SELECT_VEICULO_COM_MOTORISTA_SQL}
      WHERE v."status_aprovacao" = ${statusAprovacao}
      ORDER BY v."criado_em" ASC
    `;
    return rows.map(formatarVeiculoSql);
  }

  async updateStatusAprovacao(id, statusAprovacao, classe = null) {
    const dataUpdate = {
      statusAprovacao,
      atualizadoEm: new Date(),
    };

    if (statusAprovacao === 'APROVADO') {
      dataUpdate.status = 'DISPONIVEL';
    }
    if (classe) {
      dataUpdate.classe = classe;
    }

    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: dataUpdate,
        include: INCLUDE_MOTORISTA_COMPLETO,
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async create(dados) {
    const veiculo = await prisma.veiculo.create({
      data: {
        marca: dados.marca,
        modelo: dados.modelo,
        ano: dados.ano,
        placa: dados.placa,
        cor: dados.cor || null,
        porte: dados.porte,
        classe: dados.classe,
        quilometragem: dados.quilometragem || 0,
        quantidadePassageiros: dados.quantidadePassageiros || 4,
        possuiArCondicionado: dados.possuiArCondicionado || false,
        possuiExtintor: dados.possuiExtintor || false,
        possuiCintoSeguranca: dados.possuiCintoSeguranca || false,
        documentacaoRegularizada: dados.documentacaoRegularizada || false,
        statusAprovacao: 'PENDENTE',
        status: 'INDISPONIVEL',
        motoristaId: dados.motoristaId,
      },
    });
    return formatarVeiculo(veiculo);
  }

  async update(id, dados) {
    const dataUpdate = {};
    if (dados.marca !== undefined) dataUpdate.marca = dados.marca;
    if (dados.modelo !== undefined) dataUpdate.modelo = dados.modelo;
    if (dados.ano !== undefined) dataUpdate.ano = dados.ano;
    if (dados.placa !== undefined) dataUpdate.placa = dados.placa;
    if (dados.cor !== undefined) dataUpdate.cor = dados.cor;
    if (dados.porte !== undefined) dataUpdate.porte = dados.porte;
    if (dados.classe !== undefined) dataUpdate.classe = dados.classe;

    // allow other editable fields if needed
    if (dados.quilometragem !== undefined) dataUpdate.quilometragem = dados.quilometragem;
    if (dados.quantidadePassageiros !== undefined) dataUpdate.quantidadePassageiros = dados.quantidadePassageiros;
    if (dados.possuiArCondicionado !== undefined) dataUpdate.possuiArCondicionado = dados.possuiArCondicionado;
    if (dados.possuiExtintor !== undefined) dataUpdate.possuiExtintor = dados.possuiExtintor;
    if (dados.possuiCintoSeguranca !== undefined) dataUpdate.possuiCintoSeguranca = dados.possuiCintoSeguranca;
    if (dados.documentacaoRegularizada !== undefined) dataUpdate.documentacaoRegularizada = dados.documentacaoRegularizada;

    dataUpdate.atualizadoEm = new Date();

    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: dataUpdate,
        include: INCLUDE_MOTORISTA_COMPLETO,
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }
}

module.exports = new VeiculosRepository();
