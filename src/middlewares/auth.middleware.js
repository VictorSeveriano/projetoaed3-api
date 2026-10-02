'use strict';
const AppError      = require('../utils/AppError');
const authRepository = require('../auth/auth.repository');
const jwt           = require('jsonwebtoken');

/**
 * Middleware de autenticacao.
 * Verifica se existe um token de sessao no header e se o usuario existe.
 * Async para suportar o repositório PostgreSQL.
 */
const authMiddleware = async (req, res, next) => {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return next(new AppError('Nao autorizado. Token nao fornecido.', 401));
  }

  if (token.startsWith('session-token-')) {
    return next(new AppError('Nao autorizado. Formato de token invalido.', 401));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.sub;

    const user = await authRepository.encontrarPorId(id);
    if (!user) {
      return next(new AppError('Nao autorizado. Usuario nao encontrado.', 401));
    }
    
    req.usuario = { id: user.id, usuario: user.usuario, nome: user.nome, perfil: user.perfil };
    next();
  } catch (err) {
    return next(new AppError('Nao autorizado.', 401));
  }
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
