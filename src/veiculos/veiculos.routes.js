const express = require('express');
const { listarAnalise, listarTodos, cadastrar, aprovar, rejeitar, editarClasse, atualizar } = require('./veiculos.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/analise',        authMiddleware, requireAdmin, listarAnalise);
router.get('/',               authMiddleware, requireAdmin, listarTodos);
router.post('/',              authMiddleware, cadastrar);
router.patch('/:id/aprovar',  authMiddleware, requireAdmin, aprovar);
router.patch('/:id/rejeitar', authMiddleware, requireAdmin, rejeitar);
router.patch('/:id/classe',   authMiddleware, requireAdmin, editarClasse);
router.patch('/:id',          authMiddleware, atualizar);

module.exports = router;
