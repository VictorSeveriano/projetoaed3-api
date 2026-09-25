const express = require('express');
const { buscarPorId, listarCorridas, listarTodos, atualizar } = require('./usuarios.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/',             authMiddleware, requireAdmin, listarTodos);
router.patch('/:id',        authMiddleware, requireAdmin, atualizar);

router.get('/:id',          buscarPorId);
router.get('/:id/corridas', listarCorridas);

module.exports = router;
