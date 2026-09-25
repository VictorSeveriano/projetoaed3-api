'use strict';
/**
 * connection.js — Pool de conexão PostgreSQL (Neon).
 *
 * Utiliza o driver `pg` com Pool para reutilização de conexões.
 * A connection string é lida exclusivamente de DATABASE_URL.
 *
 * Configurações específicas para Neon:
 *   - ssl: { rejectUnauthorized: true } em produção
 *   - ssl: false em desenvolvimento local (NODE_ENV=development sem SSL)
 *
 * USO:
 *   const { query } = require('./connection');
 *   const result = await query('SELECT $1::text AS msg', ['hello']);
 *
 * SEGURANÇA:
 *   - Nunca expor process.env.DATABASE_URL nos logs ou respostas HTTP.
 *   - A connection string contém credenciais — manter no .env (gitignored).
 */

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[database/connection] DATABASE_URL não está definida. ' +
    'Adicione-a ao arquivo .env antes de iniciar o servidor.'
  );
}

// SSL: Neon requer SSL. Em dev local pode-se usar { rejectUnauthorized: false }
// se houver proxy/VPN corporativo. Em produção sempre true.
const sslConfig =
  process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false };

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: sslConfig,
  // Tamanho do pool adequado para a camada gratuita do Neon
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Loga erros ociosos do pool (sem expor a connection string)
pool.on('error', (err) => {
  console.error('[database/connection] Erro inesperado no pool PostgreSQL:', err.message);
});

/**
 * Executa uma query no pool.
 * @param {string} text   - SQL com placeholders $1, $2...
 * @param {Array}  [params] - Valores para os placeholders
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  return pool.query(text, params);
}

/**
 * Obtém um cliente dedicado do pool (necessário para transações).
 * ATENÇÃO: sempre chame client.release() no bloco finally.
 * @returns {Promise<import('pg').PoolClient>}
 *
 * Exemplo de uso:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
