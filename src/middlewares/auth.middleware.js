const AppError = require('../utils/AppError');

const authRepository = require('../auth/auth.repository');

/**
 * Middleware de autenticacao.
 * Verifica se existe um token de sessao no header e se o usuario existe.
 */
const authMiddleware = (req, res, next) => {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return next(new AppError('Nao autorizado. Token nao fornecido.', 401));
  }

  // Token format: session-token-{id}
  if (!token.startsWith('session-token-')) {
    return next(new AppError('Nao autorizado. Token invalido.', 401));
  }

  const id = token.replace('session-token-', '');
  const user = authRepository.encontrarPorId(id);

  if (!user) {
    return next(new AppError('Nao autorizado. Usuario nao encontrado.', 401));
  }

  req.usuario = { id: user.id, usuario: user.usuario, nome: user.nome, perfil: user.perfil };
  next();
};

/**
 * Middleware para exigir perfil ADMINISTRADOR.
 * Deve ser usado apos o authMiddleware.
 */
const requireAdmin = (req, res, next) => {
  if (!req.usuario) {
    return next(new AppError('Nao autorizado. Falha na autenticacao.', 401));
  }
  if (req.usuario.perfil !== 'ADMINISTRADOR') {
    return next(new AppError('Acesso negado. Apenas administradores podem acessar este recurso.', 403));
  }
  next();
};

module.exports = { authMiddleware, requireAdmin };
