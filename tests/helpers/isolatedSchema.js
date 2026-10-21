'use strict';
/**
 * tests/helpers/isolatedSchema.js — Utilitário compartilhado de schemas PostgreSQL isolados
 * para testes de migrações SQL e de saneamento de corridas ativas.
 *
 * Garante que nenhum teste de saneamento ou migração remova índices ou constraints do schema public.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const MIGRATIONS_DIR = path.join(__dirname, '../../prisma/migrations');

const MIGRACOES_BASE = [
  '20240101000000_init',
  '20240101000001_remove_schema_migrations',
  '20261001000000_add_auditoria',
  '20261001133500_padronizar_porte',
];

const MIGRACAO_INDICES_CONSTRAINTS = '20261020130000_add_indexes_and_constraints';
const MIGRACAO_CORRETIVA = '20261020190000_corrigir_seguranca_e_auditoria_restricoes';

const INDICES_ESPERADOS = [
  'idx_veiculos_aprovacao_status_classe',
  'idx_corridas_motorista_status',
  'idx_corridas_motorista_data_horario',
  'idx_corridas_usuario_status',
  'uq_corridas_veiculo_ativo',
];

const CONSTRAINTS_ESPERADAS = [
  'ck_veiculos_porte',
  'ck_veiculos_classe',
  'ck_veiculos_porte_classe',
  'ck_veiculos_status',
  'ck_veiculos_status_aprovacao',
  'ck_corridas_status',
  'ck_corridas_classe',
  'ck_corridas_forma_pagamento',
];

function lerMigracao(nome) {
  const filePath = path.join(MIGRATIONS_DIR, nome, 'migration.sql');
  const sql = fs.readFileSync(filePath, 'utf8');
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  return { nome, sql, checksum };
}

async function criarAmbienteIsolado(tag) {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não definida: os testes de schema isolado exigem um PostgreSQL acessível.');
  }
  // Identificador PostgreSQL: apenas [a-z0-9_] e no máximo 63 caracteres.
  const tagSegura = String(tag).replace(/[^a-z0-9_]/gi, '_');
  const sufixo = `${tagSegura}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const schemaName = `test_mig_${sufixo}`.toLowerCase().slice(0, 63);
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('schema', schemaName);
  url.searchParams.set('connection_limit', '1');

  const client = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });

  try {
    await client.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "${schemaName}"."_prisma_migrations" (
        "id" VARCHAR(36) PRIMARY KEY,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(250) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `);
  } catch (erro) {
    // Falha parcial na preparação: não deixa schema órfão nem conexão aberta.
    await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`).catch(() => {});
    await client.$disconnect();
    throw erro;
  }

  async function aplicarMigracaoNoSchema(nomeMigracao) {
    const { sql, checksum } = lerMigracao(nomeMigracao);
    const sqlUnico = /^\s*(--[^\n]*\n|\s)*DO\s+\$\$/i.test(sql)
      ? sql
      : `DO $mig$\nBEGIN\n${sql}\nEND $mig$;`;
    const idReg = crypto.randomUUID();
    await client.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schemaName}"`);
        await tx.$executeRawUnsafe(sqlUnico);
        await tx.$executeRawUnsafe(
          `INSERT INTO "${schemaName}"."_prisma_migrations" ("id", "checksum", "finished_at", "migration_name", "applied_steps_count") VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 1)`,
          idReg,
          checksum,
          nomeMigracao
        );
      },
      { maxWait: 15000, timeout: 60000 }
    );
  }

  async function aplicarMigracoesBase() {
    for (const nome of MIGRACOES_BASE) {
      await aplicarMigracaoNoSchema(nome);
    }
  }

  async function aplicarMigracoesPendentes() {
    const todas = [...MIGRACOES_BASE, MIGRACAO_INDICES_CONSTRAINTS, MIGRACAO_CORRETIVA];
    const aplicadas = await client.$queryRawUnsafe(
      `SELECT "migration_name", "checksum" FROM "${schemaName}"."_prisma_migrations" WHERE "rolled_back_at" IS NULL AND "finished_at" IS NOT NULL`
    );
    const mapaAplicadas = new Map(aplicadas.map((m) => [m.migration_name, m.checksum]));

    for (const [nome, checksumBanco] of mapaAplicadas.entries()) {
      const { checksum: checksumArquivo } = lerMigracao(nome);
      if (checksumBanco !== checksumArquivo) {
        throw new Error(
          `Divergência de checksum na migração já aplicada ${nome}: banco=${checksumBanco}, arquivo=${checksumArquivo}`
        );
      }
    }

    const recemAplicadas = [];
    for (const nome of todas) {
      if (!mapaAplicadas.has(nome)) {
        await aplicarMigracaoNoSchema(nome);
        recemAplicadas.push(nome);
      }
    }
    return recemAplicadas;
  }

  async function listarIndicesCriados() {
    const rows = await client.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND indexname = ANY($2::text[]) ORDER BY indexname`,
      schemaName,
      INDICES_ESPERADOS
    );
    return rows.map((r) => r.indexname);
  }

  async function listarConstraintsCriadas() {
    const rows = await client.$queryRawUnsafe(
      `
      SELECT c.conname
      FROM pg_constraint c
      INNER JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = $1
        AND c.contype = 'c'
        AND c.conname = ANY($2::text[])
      ORDER BY c.conname
      `,
      schemaName,
      CONSTRAINTS_ESPERADAS
    );
    return rows.map((r) => r.conname);
  }

  async function destruir() {
    try {
      await client.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await client.$executeRawUnsafe(`SET search_path TO "public"`);
    } finally {
      await client.$disconnect();
    }
  }

  return {
    schemaName,
    client,
    aplicarMigracaoNoSchema,
    aplicarMigracoesBase,
    aplicarMigracoesPendentes,
    listarIndicesCriados,
    listarConstraintsCriadas,
    destruir,
  };
}

async function semearBaseDadosValidos(client) {
  const endOrigem = await client.endereco.create({
    data: {
      logradouro: 'Av. Fernando Ferrari',
      numero: '514',
      bairro: 'Goiabeiras',
      cidade: 'Vitória',
      estado: 'Espírito Santo',
      uf: 'ES',
      cep: '29075910',
      latitude: -20.2769,
      longitude: -40.3061,
    },
  });
  const endDestino = await client.endereco.create({
    data: {
      logradouro: 'Praça Costa Pereira',
      numero: '10',
      bairro: 'Centro',
      cidade: 'Vitória',
      estado: 'Espírito Santo',
      uf: 'ES',
      cep: '29010080',
      latitude: -20.3194,
      longitude: -40.3378,
    },
  });

  const passageiro = await client.usuario.create({
    data: {
      nome: 'Passageiro Migração',
      cpf: '10020030040',
      celular: '27999990001',
      email: 'pass.mig@teste.com',
      usuario: 'pass_mig',
      senha: 'hash_password',
      perfil: 'USUARIO',
      enderecoId: endOrigem.id,
    },
  });

  const mot1User = await client.usuario.create({
    data: {
      nome: 'Motorista Migração 1',
      cpf: '10020030041',
      celular: '27999990002',
      email: 'mot1.mig@teste.com',
      usuario: 'mot1_mig',
      senha: 'hash_password',
      perfil: 'MOTORISTA',
      enderecoId: endOrigem.id,
    },
  });
  const mot1Record = await client.motorista.create({
    data: {
      usuarioId: mot1User.id,
      cnh: '90010020001',
      statusCadastro: 'APROVADO',
      statusPresenca: 'ONLINE',
    },
  });

  const mot2User = await client.usuario.create({
    data: {
      nome: 'Motorista Migração 2',
      cpf: '10020030042',
      celular: '27999990003',
      email: 'mot2.mig@teste.com',
      usuario: 'mot2_mig',
      senha: 'hash_password',
      perfil: 'MOTORISTA',
      enderecoId: endOrigem.id,
    },
  });
  const mot2Record = await client.motorista.create({
    data: {
      usuarioId: mot2User.id,
      cnh: '90010020002',
      statusCadastro: 'APROVADO',
      statusPresenca: 'ONLINE',
    },
  });

  const v1 = await client.veiculo.create({
    data: {
      marca: 'Toyota',
      modelo: 'Corolla',
      ano: 2024,
      placa: 'MIG1A01',
      porte: 'Medio',
      classe: 'NORMAL',
      statusAprovacao: 'APROVADO',
      status: 'DISPONIVEL',
      motoristaId: mot1User.id,
    },
  });

  const v2 = await client.veiculo.create({
    data: {
      marca: 'Fiat',
      modelo: 'Mobi',
      ano: 2023,
      placa: 'MIG2B02',
      porte: 'Pequeno',
      classe: 'BASICO',
      statusAprovacao: 'APROVADO',
      status: 'DISPONIVEL',
      motoristaId: mot2User.id,
    },
  });

  return { endOrigem, endDestino, passageiro, mot1User, mot1Record, mot2User, mot2Record, v1, v2 };
}

module.exports = {
  MIGRATIONS_DIR,
  MIGRACOES_BASE,
  MIGRACAO_INDICES_CONSTRAINTS,
  MIGRACAO_CORRETIVA,
  INDICES_ESPERADOS,
  CONSTRAINTS_ESPERADAS,
  lerMigracao,
  criarAmbienteIsolado,
  semearBaseDadosValidos,
};

