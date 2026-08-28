require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` projetoaed3-api rodando na porta ${PORT}`);
  console.log(`========================================`);
  console.log(` Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health   : http://localhost:${PORT}/api/health`);
  console.log(` Grafo    : http://localhost:${PORT}/api/grafo`);
  console.log(` Rota     : http://localhost:${PORT}/api/grafo/rota?origem=Rodoviária de Vitória&destino=Aeroporto de Vitória`);
  console.log(`========================================\n`);
});

// Solução para o EADDRINUSE com nodemon no Windows
const gracefulShutdown = (signal) => {
  console.log(`\n[${signal}] Desligando o servidor graciosamente...`);
  server.close(() => {
    console.log('Servidor encerrado. Processo finalizado.');
    process.exit(0);
  });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
