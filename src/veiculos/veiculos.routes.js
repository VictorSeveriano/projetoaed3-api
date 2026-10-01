const express = require('express');
const { listarAnalise, listarTodos, cadastrar, aprovar, rejeitar, editarClasse, atualizar } = require('./veiculos.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/analise',        listarAnalise);
router.get('/',               listarTodos);
router.post('/',              cadastrar);
router.patch('/:id/aprovar',  aprovar);
router.patch('/:id/rejeitar', rejeitar);
router.patch('/:id/classe',   editarClasse);
router.patch('/:id',          authMiddleware, atualizar);

module.exports = router;
