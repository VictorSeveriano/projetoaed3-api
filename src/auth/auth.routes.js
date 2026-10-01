const { Router } = require('express');
const { login, cadastrar, verificarDisponibilidadeCadastro } = require('./auth.controller');
const { validateFields } = require('../middlewares/validate');

const router = Router();

/**
 * Rotas do modulo Auth
 * Base: /api/auth
 */
router.post('/login',    validateFields(['usuario', 'senha']),          login);
router.post('/verificar-disponibilidade-cadastro', validateFields(['cpf', 'email', 'perfil']), verificarDisponibilidadeCadastro);
router.post('/cadastrar', validateFields(['nome', 'cpf', 'celular', 'email', 'senha', 'perfil']), cadastrar);

module.exports = router;
