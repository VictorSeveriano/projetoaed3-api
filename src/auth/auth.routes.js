const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const {
  login,
  cadastrar,
  verificarDisponibilidadeCadastro,
  verificarIdentidadeRedefinicao,
  redefinirSenha,
} = require('./auth.controller');
const { validateFields } = require('../middlewares/validate');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limita cada IP a 100 requisições por windowMs
  message: { success: false, message: 'Muitas requisições deste IP, tente novamente mais tarde.' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Max 10 tentativas de login
  message: { success: false, message: 'Muitas tentativas de login. Tente novamente mais tarde.' }
});

const recuperacaoSenhaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Max 10 tentativas de recuperação de senha por IP a cada 15 min
  message: { success: false, message: 'Muitas tentativas de recuperação de senha. Tente novamente mais tarde.' }
});

router.use(authLimiter);

/**
 * Rotas do modulo Auth
 * Base: /api/auth
 */
router.post('/login',    loginLimiter, validateFields(['usuario', 'senha']),          login);
router.post('/verificar-disponibilidade-cadastro', validateFields(['cpf', 'email', 'perfil']), verificarDisponibilidadeCadastro);
router.post('/cadastrar', validateFields(['nome', 'cpf', 'celular', 'email', 'senha', 'perfil']), cadastrar);
router.post('/verificar-identidade-redefinicao', recuperacaoSenhaLimiter, validateFields(['usuario', 'cpf']), verificarIdentidadeRedefinicao);
router.post('/redefinir-senha', recuperacaoSenhaLimiter, validateFields(['usuario', 'cpf', 'novaSenha']), redefinirSenha);

module.exports = router;
