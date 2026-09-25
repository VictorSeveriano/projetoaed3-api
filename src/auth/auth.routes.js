const { Router } = require('express');
const { login, cadastrar } = require('./auth.controller');
const { validateFields } = require('../middlewares/validate');

const router = Router();

/**
 * Rotas do modulo Auth
 * Base: /api/auth
 */
router.post('/login',    validateFields(['usuario', 'senha']),          login);
router.post('/cadastrar', validateFields(['nome', 'usuario', 'senha', 'perfil']), cadastrar);

module.exports = router;
