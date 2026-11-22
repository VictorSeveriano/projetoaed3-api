const express = require('express');
const { listar, obterResumo, marcarLida, marcarTodasLidas } = require('./notificacoes.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/',                    authMiddleware, listar);
router.get('/resumo',              authMiddleware, obterResumo);
router.patch('/ler-todas',         authMiddleware, marcarTodasLidas);
router.patch('/:id/ler',           authMiddleware, marcarLida);

module.exports = router;
