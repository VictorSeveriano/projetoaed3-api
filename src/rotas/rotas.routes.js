const { Router } = require('express');
const { calcularCorrida, geocodificar, buscarSugestoes, geocodificarReverso } = require('./rotas.controller');

const { authMiddleware } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authMiddleware);

/**
 * Rotas do módulo Rotas
 * Base: /api/rotas
 */

// GET  /api/rotas/sugestoes?q=... — Autocomplete: texto → sugestoes de localizacao (Nominatim)
router.get('/sugestoes', buscarSugestoes);

// GET  /api/rotas/reverso?lat=...&lng=... — Geocodificação reversa: coordenadas → endereço legível
router.get('/reverso', geocodificarReverso);

// POST /api/rotas/calcular-corrida — Calcula rotas reais (Routes API) + organiza via ABB
router.post('/calcular-corrida', calcularCorrida);

// POST /api/rotas/geocodificar     — CEP/endereco -> JSON + lat/lng
router.post('/geocodificar', geocodificar);

module.exports = router;
