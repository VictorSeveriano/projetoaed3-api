const { Router } = require('express');
const { listarLocais, calcularCorrida, geocodificar } = require('./rotas.controller');

const router = Router();

/**
 * Rotas do modulo Rotas
 * Base: /api/rotas
 */

// GET  /api/rotas/locais           — Lista todos os locais com coordenadas
router.get('/locais', listarLocais);

// POST /api/rotas/calcular-corrida — Calcula multiplas rotas (BFS + Dijkstra)
router.post('/calcular-corrida', calcularCorrida);

// POST /api/rotas/geocodificar     — CEP/endereco -> JSON + lat/lng
router.post('/geocodificar', geocodificar);

module.exports = router;
