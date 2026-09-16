const { Router } = require('express');
const { listarLocais, calcularCorrida, geocodificar, buscarSugestoes } = require('./rotas.controller');

const router = Router();

/**
 * Rotas do modulo Rotas
 * Base: /api/rotas
 */

// GET  /api/rotas/locais           — Lista todos os locais com coordenadas (grafo fixo / uso acadêmico)
router.get('/locais', listarLocais);

// GET  /api/rotas/sugestoes?q=... — Autocomplete: texto → sugestões de localização (Nominatim)
router.get('/sugestoes', buscarSugestoes);

// POST /api/rotas/calcular-corrida — Calcula multiplas rotas (Routes API + Dijkstra dinâmico)
router.post('/calcular-corrida', calcularCorrida);

// POST /api/rotas/geocodificar     — CEP/endereco -> JSON + lat/lng
router.post('/geocodificar', geocodificar);

module.exports = router;
