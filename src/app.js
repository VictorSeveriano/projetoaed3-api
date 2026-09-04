require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./auth/auth.routes');
const carrosRoutes = require('./carros/carros.routes');
const reservasRoutes = require('./reservas/reservas.routes');
const localizacoesRoutes = require('./localizacoes/localizacoes.routes');
const grafoRoutes = require('./grafo/grafo.routes');
const rotasRoutes = require('./rotas/rotas.routes');
const corridasRoutes = require('./corridas/corridas.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// --- Configuracao CORS ---
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
};
app.use(cors(corsOptions));

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API projetoaed3 funcionando', version: '1.0.0' });
});

// --- Rotas ---
app.use('/api/auth', authRoutes);
app.use('/api/carros', carrosRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/localizacoes', localizacoesRoutes);
app.use('/api/grafo', grafoRoutes);
app.use('/api/rotas', rotasRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/dashboard', dashboardRoutes);

// --- Rota nao encontrada ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Rota '${req.originalUrl}' nao encontrada.` });
});

// --- Tratamento global de erros ---
app.use(errorHandler);

module.exports = app;
