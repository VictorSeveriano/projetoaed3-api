require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(` projetoaed3-api rodando na porta ${PORT}`);
  console.log(`========================================`);
  console.log(` Ambiente : ${process.env.NODE_ENV || 'development'}`);
  console.log(` Health   : http://localhost:${PORT}/api/health`);
  console.log(` Grafo    : http://localhost:${PORT}/api/grafo`);
  console.log(` Rota     : http://localhost:${PORT}/api/grafo/rota?origem=Centro&destino=Aeroporto`);
  console.log(`========================================\n`);
});
