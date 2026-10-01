const express = require('express');
const { listar, marcarLida, marcarTodasLidas } = require('./notificacoes.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/',                    authMiddleware, listar);
router.patch('/ler-todas',         marcarTodasLidas);
router.patch('/:id/ler',           marcarLida);

module.exports = router;
