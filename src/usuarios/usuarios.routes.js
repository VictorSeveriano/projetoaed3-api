const express = require('express');
const { buscarPorId, listarCorridas, listarTodos, atualizar, criar } = require('./usuarios.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/',            authMiddleware, requireAdmin, criar);
router.get('/',             authMiddleware, requireAdmin, listarTodos);
router.patch('/:id',        authMiddleware, atualizar);

router.get('/:id',          buscarPorId);
router.get('/:id/corridas', listarCorridas);

module.exports = router;
