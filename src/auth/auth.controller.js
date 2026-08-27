const authService = require('./auth.service');
const { success } = require('../utils/responseHelper');

/**
 * AuthController — Controlador de autenticacao.
 */
const login = (req, res, next) => {
  try {
    const { usuario, senha } = req.body;
    const resultado = authService.login(usuario, senha);
    return success(res, resultado, 'Login realizado com sucesso');
  } catch (err) {
    next(err);
  }
};

module.exports = { login };
