const { Router } = require('express');
const { listarTodas, buscarPorId } = require('./localizacoes.controller');

const router = Router();

/**
 * Rotas do modulo Localizacoes
 * Base: /api/localizacoes
 */
router.get('/', listarTodas);
router.get('/:id', buscarPorId);

module.exports = router;
