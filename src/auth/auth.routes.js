const { Router } = require('express');
const { login } = require('./auth.controller');
const { validateFields } = require('../middlewares/validate');

const router = Router();

/**
 * Rotas do modulo Auth
 * Base: /api/auth
 */
router.post('/login', validateFields(['usuario', 'senha']), login);

module.exports = router;
