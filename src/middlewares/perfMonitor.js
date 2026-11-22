'use strict';

/**
 * perfMonitor — Middleware leve de observabilidade de tempo de resposta HTTP.
 *
 * - Registra apenas requisições lentas (>= SLOW_REQUEST_MS, padrão 1500ms) ou todas
 *   quando LOG_PERF=true, evitando poluição de log em produção e silenciando em testes.
 * - Adiciona cabeçalho Server-Timing (em ms) para diagnóstico no DevTools Network.
 * - Nunca registra tokens, senhas, headers de autenticação, corpos ou dados pessoais.
 */
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;

const perfMonitor = (req, res, next) => {
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const inicioNs = process.hrtime.bigint();
  const originalWriteHead = res.writeHead;

  res.writeHead = function writeHeadComTiming(...args) {
    const duracaoMs = Number(process.hrtime.bigint() - inicioNs) / 1e6;
    if (!res.headersSent) {
      res.setHeader('Server-Timing', `app;dur=${duracaoMs.toFixed(1)}`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const duracaoMs = Number(process.hrtime.bigint() - inicioNs) / 1e6;
    const logarTudo = process.env.LOG_PERF === 'true';
    if (logarTudo || duracaoMs >= SLOW_REQUEST_MS) {
      const rota = (req.originalUrl || req.url || '').split('?')[0];
      const nivel = duracaoMs >= SLOW_REQUEST_MS ? 'warn' : 'log';
      console[nivel](
        `[Perf] ${req.method} ${rota} -> ${res.statusCode} (${duracaoMs.toFixed(1)}ms)`
      );
    }
  });

  return next();
};

module.exports = perfMonitor;
