'use strict';
const AppError      = require('../utils/AppError');
const authRepository = require('../auth/auth.repository');
const jwt           = require('jsonwebtoken');

/** Erros do Prisma que indicam indisponibilidade/conexão do banco (não é falha de autenticação). */
const CODIGOS_PRISMA_INDISPONIBILIDADE = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

const ehIndisponibilidadeDeBanco = (err) =>
  Boolean(err) && (
    CODIGOS_PRISMA_INDISPONIBILIDADE.has(err.code) ||
    err.name === 'PrismaClientInitializationError'
  );

// Cache curto em memória para evitar N consultas repetidas ao banco remoto em requisições paralelas
const AUTH_USER_CACHE_TTL_MS = 10000;
const authUserCache = new Map();

async function obterUsuarioAutenticado(id) {
  if (process.env.NODE_ENV === 'test') {
    return authRepository.encontrarPorId(id);
  }

  const agora = Date.now();
  const entrada = authUserCache.get(id);
  if (entrada) {
    if (entrada.usuario && agora < entrada.expiraEm) {
      return entrada.usuario;
    }
    if (entrada.promise) {
      return entrada.promise;
    }
  }

  const promise = authRepository.encontrarPorId(id)
    .then((user) => {
      if (user) {
        authUserCache.set(id, {
          usuario: user,
          expiraEm: Date.now() + AUTH_USER_CACHE_TTL_MS,
          promise: null,
        });
      } else {
        authUserCache.delete(id);
      }
      return user;
    })
    .catch((err) => {
      authUserCache.delete(id);
      throw err;
    });

  authUserCache.set(id, { usuario: null, expiraEm: 0, promise });
  return promise;
}

function invalidarCacheUsuario(id) {
  if (id) authUserCache.delete(id);
  else authUserCache.clear();
}

/**
 * Middleware de autenticacao.
 * Verifica se existe um token de sessao no header e se o usuario existe.
 * Async para suportar o repositório PostgreSQL.
 *
 * Tratamento de erros:
 *  - token ausente / inválido / expirado / usuário inexistente → 401
 *  - falha da consulta ao banco (indisponibilidade → 503; demais → 500). NUNCA vira 401.
 *  - JWT_SECRET ausente (erro de configuração do servidor) → 500
 */
const authMiddleware = async (req, res, next) => {
  const token = req.headers['x-auth-token'];

  if (!token) {
    return next(new AppError('Nao autorizado. Token nao fornecido.', 401));
  }

  if (token.startsWith('session-token-')) {
    return next(new AppError('Nao autorizado. Formato de token invalido.', 401));
  }

  if (!process.env.JWT_SECRET) {
    console.error('[AuthMiddleware] JWT_SECRET nao configurado.');
    return next(new AppError('Erro interno do servidor.', 500));
  }

  // 1) Validação do JWT — somente falhas esperadas do token resultam em 401
  let id;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    id = decoded.sub;
  } catch (err) {
    return next(new AppError('Nao autorizado.', 401));
  }
  if (id === undefined || id === null || id === '') {
    return next(new AppError('Nao autorizado.', 401));
  }

  // 2) Consulta do usuário — falhas aqui são de infraestrutura, não de autenticação
  let user;
  try {
    user = await obterUsuarioAutenticado(id);
  } catch (err) {
    // Loga apenas o necessário para diagnóstico (sem token, segredo ou connection string)
    console.error('[AuthMiddleware] Falha ao consultar usuario:', err && err.code ? err.code : '', err && err.message ? String(err.message).split('\n')[0] : '');
    if (ehIndisponibilidadeDeBanco(err)) {
      return next(new AppError('Servico temporariamente indisponivel. Tente novamente em instantes.', 503));
    }
    return next(new AppError('Erro interno do servidor.', 500));
  }

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

module.exports = { authMiddleware, requireAdmin, invalidarCacheUsuario };
