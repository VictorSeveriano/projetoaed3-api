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
const TRANSACTION_OPTIONS = {
  maxWait: 15000,
  timeout: 30000,
};

const prismaOptions = {
  transactionOptions: TRANSACTION_OPTIONS,
  ...(urlNormalizada ? { datasources: { db: { url: urlNormalizada } } } : {}),
};

const prisma = new PrismaClient(prismaOptions);

// Middleware de retry automático para absorver cold-start e reconexão de pool do Neon
// + monitoramento leve de consultas lentas (sem expor parâmetros/dados sensíveis).
if (typeof prisma.$use === 'function') {
  const MAX_TENTATIVAS = 3;
  const BASE_DELAY_MS = process.env.NODE_ENV === 'test' ? 50 : 400;
  const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS) || 1500;

  prisma.$use(async (params, next) => {
    const medirPerf = process.env.NODE_ENV !== 'test';
    const inicioNs = medirPerf ? process.hrtime.bigint() : null;
    let ultimaFalha;
    for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
      try {
        const resultado = await next(params);
        if (medirPerf && inicioNs !== null) {
          const duracaoMs = Number(process.hrtime.bigint() - inicioNs) / 1e6;
          if (process.env.LOG_PERF === 'true' || duracaoMs >= SLOW_QUERY_MS) {
            const alvo = params.model ? `${params.model}.${params.action}` : params.action;
            const nivel = duracaoMs >= SLOW_QUERY_MS ? 'warn' : 'log';
            console[nivel](`[DB Perf] ${alvo} (${duracaoMs.toFixed(1)}ms)`);
          }
        }
        return resultado;
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
  if (process.env.NODE_ENV === 'test' || keepAliveTimer) return Promise.resolve();

  // Aquecimento imediato ao subir o servidor
  const aquecimento = executarPingBanco();

  keepAliveTimer = setInterval(executarPingBanco, intervaloMs);
  if (typeof keepAliveTimer.unref === 'function') {
    keepAliveTimer.unref();
  }
  return aquecimento;
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
