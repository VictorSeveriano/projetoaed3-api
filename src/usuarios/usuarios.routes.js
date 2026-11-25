const express = require('express');
const {
  buscarPorId, listarCorridas, listarTodos, exportarRelatorio, atualizar, remover, criar,
} = require('./usuarios.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/',            authMiddleware, requireAdmin, criar);
router.get('/exportar',     authMiddleware, requireAdmin, exportarRelatorio);
router.get('/',             authMiddleware, requireAdmin, listarTodos);
router.patch('/:id',        authMiddleware, atualizar);
router.delete('/:id',       authMiddleware, requireAdmin, remover);

router.get('/:id',          authMiddleware, buscarPorId);
router.get('/:id/corridas', authMiddleware, listarCorridas);

module.exports = router;
