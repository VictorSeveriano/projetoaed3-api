const authService = require('./auth.service');
const { success } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');

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

/**
 * POST /api/auth/cadastrar
 * Cria conta publica (USUARIO ou MOTORISTA — nunca ADMINISTRADOR).
 */
const cadastrar = (req, res, next) => {
  try {
    const { nome, cpf, celular, email, senha, perfil, endereco, cnh } = req.body;
    if (!nome || !senha || !perfil || !cpf || !celular || !email) {
      return next(new AppError('Campos obrigatórios ausentes.', 400));
    }
    if (perfil === 'ADMINISTRADOR') {
      return next(new AppError('Nao e possivel criar conta de administrador pelo cadastro publico.', 403));
    }
    const resultado = authService.cadastrar({ nome, cpf, celular, email, senha, perfil, endereco, cnh });
    return res.status(201).json({ success: true, data: resultado, message: 'Conta criada com sucesso.' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, cadastrar };
