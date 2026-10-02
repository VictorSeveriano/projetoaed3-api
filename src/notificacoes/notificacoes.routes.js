const express = require('express');
const { listar, marcarLida, marcarTodasLidas } = require('./notificacoes.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/',                    authMiddleware, listar);
router.patch('/ler-todas',         authMiddleware, marcarTodasLidas);
router.patch('/:id/ler',           authMiddleware, marcarLida);

module.exports = router;
