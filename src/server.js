require('dotenv').config();
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  process.env.ALLOW_INSECURE_TLS = 'true';
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
}
const { validarVariaveisDeAmbiente } = require('./config/env');

// Falha rapido (sem expor valores) se JWT_SECRET ou DATABASE_URL estiverem ausentes
try {
  validarVariaveisDeAmbiente();
} catch (err) {
  console.error('[CONFIG]', err.message);
  process.exit(1);
}

const app = require('./app');
const prisma = require('./database/prisma');
const expiracaoCorridaService = require('./corridas/expiracaoCorrida.service');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` projetoaed3-api rodando na porta ${PORT}`);
  console.log(`========================================`);
  console.log(` Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health   : http://localhost:${PORT}/api/health`);
  console.log(` Grafo    : http://localhost:${PORT}/api/grafo`);
  console.log(`========================================\n`);

  const aquecimentoBanco = typeof prisma.iniciarKeepAlive === 'function'
    ? Promise.resolve(prisma.iniciarKeepAlive())
    : Promise.resolve();

  if (typeof expiracaoCorridaService.iniciarMonitoramentoExpiracao === 'function') {
    aquecimentoBanco.finally(() => {
      expiracaoCorridaService.iniciarMonitoramentoExpiracao();
    });
  }
});

// Solução para o EADDRINUSE com nodemon no Windows
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Desligando o servidor graciosamente...`);
  if (typeof expiracaoCorridaService.pararMonitoramentoExpiracao === 'function') {
    expiracaoCorridaService.pararMonitoramentoExpiracao();
  }
  if (typeof prisma.pararKeepAlive === 'function') {
    prisma.pararKeepAlive();
  }
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    console.log('Servidor encerrado. Processo finalizado.');
    process.exit(0);
  });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
