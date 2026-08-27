const AppError = require('../utils/AppError');

/**
 * Middleware de autenticacao simulado.
 * Verifica se existe um token de sessao no header.
 * NOTA: Este middleware esta preparado para futura substituicao por JWT real.
 */
const authMiddleware = (req, res, next) => {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return next(new AppError('Nao autorizado. Token nao fornecido.', 401));
  }

  if (token !== 'session-admin-token') {
    return next(new AppError('Nao autorizado. Token invalido.', 401));
  }

  req.usuario = { id: '1', usuario: 'admin', nome: 'Administrador' };
  next();
};

module.exports = authMiddleware;
