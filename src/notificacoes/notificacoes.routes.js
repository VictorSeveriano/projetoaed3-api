const express = require('express');
const { listar, marcarLida, marcarTodasLidas } = require('./notificacoes.controller');

const router = express.Router();

router.get('/',                    listar);
router.patch('/ler-todas',         marcarTodasLidas);
router.patch('/:id/ler',           marcarLida);

module.exports = router;
