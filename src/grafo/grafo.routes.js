const { Router } = require('express');
const { obterGrafo, calcularRota } = require('./grafo.controller');

const router = Router();

/**
 * Rotas do modulo Grafo
 * Base: /api/grafo
 */
router.get('/', obterGrafo);
router.get('/rota', calcularRota);

module.exports = router;
