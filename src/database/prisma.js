'use strict';
const { PrismaClient } = require('@prisma/client');

/**
 * Garante parâmetros adequados para bancos serverless (ex.: Neon PostgreSQL com PgBouncer),
 * evitando falha prematura no cold-start (connect_timeout padrão do Prisma é apenas 5s).
 * @param {string|undefined} rawUrl
 * @returns {string|undefined}
 */
function normalizarDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '30');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '30');
    }
    if (url.hostname.includes('-pooler.') && !url.searchParams.has('pgbouncer')) {
      url.searchParams.set('pgbouncer', 'true');
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const CODIGOS_TRANSITORIOS_BANCO = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

function ehFalhaTransitoriaDeConexao(err) {
  if (!err) return false;
  if (err.name === 'PrismaClientInitializationError') return true;
  if (err.code && CODIGOS_TRANSITORIOS_BANCO.has(err.code)) return true;
  const msg = String(err.message || '');
  return /Can't reach database server|Server has closed the connection|Timed out fetching a new connection|Connection reset|ECONNRESET|ETIMEDOUT/i.test(msg);
}

const urlNormalizada = normalizarDatabaseUrl(process.env.DATABASE_URL);

// Instância centralizada do Prisma para evitar conexões excessivas no Neon
const prisma = new PrismaClient(
  urlNormalizada
    ? { datasources: { db: { url: urlNormalizada } } }
    : undefined
);

// Middleware de retry automático para absorver cold-start e reconexão de pool do Neon
if (typeof prisma.$use === 'function') {
  const MAX_TENTATIVAS = 3;
  const BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 50 : 1200;

  prisma.$use(async (params, next) => {
    let ultimaFalha;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        return await next(params);
      } catch (err) {
        ultimaFalha = err;
        if (!ehFalhaTransitoriaDeConexao(err) || tentativa === MAX_TENTATIVAS) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, BASE_DELAY_MS * tentativa));
      }
    }
    throw ultimaFalha;
  });
}

// --- Keep-alive (ping periódico) para evitar auto-suspend do Neon e queda de conexões ociosas ---
const INTERVALO_PADRAO_PING_MS = 3 * 60 * 1000; // 3 minutos (Neon suspende após 5 min de inatividade)
let keepAliveTimer = null;

async function executarPingBanco() {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
  } catch (err) {
    console.warn(
      '[DB KeepAlive] Falha no ping do banco, reiniciando pool de conexoes:',
      err && err.message ? String(err.message).split('\n').pop() : err
    );
    await prisma.$disconnect().catch(() => {});
  }
}

function iniciarKeepAlive(intervaloMs = Number(process.env.DB_PING_INTERVAL_MS) || INTERVALO_PADRAO_PING_MS) {
  if (process.env.NODE_ENV === 'test' || keepAliveTimer) return;

  // Aquecimento imediato ao subir o servidor
  executarPingBanco();

  keepAliveTimer = setInterval(executarPingBanco, intervaloMs);
  if (typeof keepAliveTimer.unref === 'function') {
    keepAliveTimer.unref();
  }
}

function pararKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

prisma.iniciarKeepAlive = iniciarKeepAlive;
prisma.pararKeepAlive = pararKeepAlive;

module.exports = prisma;
