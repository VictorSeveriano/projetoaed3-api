require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./auth/auth.routes');
const rotasRoutes = require('./rotas/rotas.routes');
const corridasRoutes = require('./corridas/corridas.routes');
const dashboardRoutes = require('./dashboard/dashboard.routes');
const usuariosRoutes = require('./usuarios/usuarios.routes');
const motoristasRoutes = require('./motoristas/motoristas.routes');
const notificacoesRoutes = require('./notificacoes/notificacoes.routes');
const veiculosRoutes = require('./veiculos/veiculos.routes');
const auditoriaRoutes = require('./auditoria/auditoria.routes');
const grafoRoutes = require('./grafo/grafo.routes');
const errorHandler = require('./middlewares/errorHandler');
const perfMonitor = require('./middlewares/perfMonitor');

const app = express();

// --- Configuracao CORS ---
// Em producao: aceita a origem do frontend configurada em FRONTEND_URL.
// Suporta multiplas origens separadas por virgula (ex: "https://a.vercel.app,https://b.vercel.app").
// Se FRONTEND_URL nao estiver definida, aceita qualquer origem (*).
function resolverOrigens() {
  const raw = process.env.FRONTEND_URL || '';
  if (!raw.trim()) return '*';
  const origens = raw.split(',').map((o) => o.trim()).filter(Boolean);
  if (origens.length === 1) return origens[0];
  return origens;
}

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? resolverOrigens() : true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  optionsSuccessStatus: 204,
  maxAge: 600,
};

// Responde ao preflight OPTIONS em todas as rotas antes de qualquer outro middleware
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(perfMonitor);

// --- Middlewares ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API projetoaed3 funcionando', version: '1.0.0' });
});

// --- Rotas ---
app.use('/api/auth', authRoutes);
app.use('/api/rotas', rotasRoutes);
app.use('/api/corridas', corridasRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/motoristas', motoristasRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/veiculos', veiculosRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/grafo', grafoRoutes);

// --- Rota nao encontrada ---
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Rota '${req.originalUrl}' nao encontrada.` });
});

// --- Tratamento global de erros ---
app.use(errorHandler);

module.exports = app;
