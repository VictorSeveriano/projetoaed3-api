const { Router } = require('express');
const { obterGrafo } = require('./grafo.controller');

const router = Router();

/**
 * Rotas do módulo Grafo
 * Base: /api/grafo
 *
 * GET /api/grafo
 *   Retorna a estrutura do grafo dinâmico para uma operação de rota.
 *   Parâmetros (query): origemNome, origemLat, origemLng,
 *                       destinoNome, destinoLat, destinoLng, distanciaMetros
 */
router.get('/', obterGrafo);

module.exports = router;
