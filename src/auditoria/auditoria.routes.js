const express = require('express');
const { listar, buscarPorId } = require('./auditoria.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', listar);
router.get('/:id', buscarPorId);

module.exports = router;
