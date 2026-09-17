const { Router } = require('express');
const { calcularCorrida, geocodificar, buscarSugestoes } = require('./rotas.controller');

const router = Router();

/**
 * Rotas do módulo Rotas
 * Base: /api/rotas
 */

// GET  /api/rotas/sugestoes?q=... — Autocomplete: texto → sugestoes de localizacao (Nominatim)
router.get('/sugestoes', buscarSugestoes);

// POST /api/rotas/calcular-corrida — Calcula rotas reais (Routes API) + organiza via ABB
router.post('/calcular-corrida', calcularCorrida);

// POST /api/rotas/geocodificar     — CEP/endereco -> JSON + lat/lng
router.post('/geocodificar', geocodificar);

module.exports = router;
