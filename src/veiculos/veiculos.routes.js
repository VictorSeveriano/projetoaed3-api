const express = require('express');
const { listarAnalise, listarTodos, cadastrar, aprovar, rejeitar, editarClasse } = require('./veiculos.controller');

const router = express.Router();

router.get('/analise',        listarAnalise);
router.get('/',               listarTodos);
router.post('/',              cadastrar);
router.patch('/:id/aprovar',  aprovar);
router.patch('/:id/rejeitar', rejeitar);
router.patch('/:id/classe',   editarClasse);

module.exports = router;
