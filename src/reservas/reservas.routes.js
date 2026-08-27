const { Router } = require('express');
const { listarTodas, buscarPorId, criar, atualizar, cancelar, deletar } = require('./reservas.controller');
const { validateFields } = require('../middlewares/validate');

const router = Router();

/**
 * Rotas do modulo Reservas
 * Base: /api/reservas
 */
router.get('/', listarTodas);
router.get('/:id', buscarPorId);
router.post(
  '/',
  validateFields(['usuarioId', 'carroId', 'dataInicio', 'dataFim', 'localRetirada', 'localDevolucao']),
  criar
);
router.put('/:id', atualizar);
router.patch('/:id/cancelar', cancelar);
router.delete('/:id', deletar);

module.exports = router;
