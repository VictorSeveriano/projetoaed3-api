'use strict';
const { Router } = require('express');
const { obterGrafo } = require('./grafo.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/grafo
 * Retorna a estrutura do grafo dinâmico para uma operação de rota específica.
 * Query params: origemNome, origemLat, origemLng, destinoNome, destinoLat, destinoLng, distanciaMetros
 */
router.get('/', obterGrafo);

module.exports = router;

