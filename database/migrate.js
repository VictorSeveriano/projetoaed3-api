'use strict';
/**
 * migrate.js — Runner de migrations SQL.
 *
 * Executa os arquivos .sql da pasta database/migrations em ordem crescente.
 * Mantém controle de versão na tabela schema_migrations para evitar
 * re-execução de migrations já aplicadas.
 *
 * USO:
 *   node database/migrate.js
 *
 * SEGURANÇA:
 *   - Não expõe DATABASE_URL nos logs.
 *   - Transação por migration: se uma SQL falhar, reverte somente ela.
 */

require('dotenv').config();

const fs   = require('fs');
const path = require('path');
const { getClient } = require('../src/database/connection');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function run() {
  const client = await getClient();
  try {
    // Tabela de controle de migrations (criada na primeira execução)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version     VARCHAR(255) PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Lê e ordena os arquivos .sql
    const arquivos = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const arquivo of arquivos) {
      const versao = arquivo;

      // Verifica se já foi aplicada
      const { rows } = await client.query(
        'SELECT version FROM schema_migrations WHERE version = $1',
        [versao]
      );
      if (rows.length > 0) {
        console.log(`[migrate] ✓ já aplicada: ${versao}`);
        continue;
      }

      const sqlPath = path.join(MIGRATIONS_DIR, arquivo);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`[migrate] → aplicando: ${versao}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1)',
          [versao]
        );
        await client.query('COMMIT');
        console.log(`[migrate] ✓ concluída: ${versao}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] ✗ falha em ${versao}:`, err.message);
        throw err;
      }
    }

    console.log('[migrate] Todas as migrations foram verificadas.');
  } finally {
    client.release();
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('[migrate] Erro fatal:', err.message);
  process.exit(1);
});
