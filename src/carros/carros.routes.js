const { Router } = require('express');
const { listarTodos, listarDisponiveis, buscarPorId } = require('./carros.controller');

const router = Router();

/**
 * Rotas do modulo Carros
 * Base: /api/carros
 */
router.get('/', listarTodos);
router.get('/disponiveis', listarDisponiveis);
router.get('/:id', buscarPorId);

module.exports = router;
