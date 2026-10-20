const jwt = require('jsonwebtoken');
const { authMiddleware, requireAdmin } = require('../src/middlewares/auth.middleware');
const { validarVariaveisDeAmbiente } = require('../src/config/env');
const authRepository = require('../src/auth/auth.repository');
const AppError = require('../src/utils/AppError');

jest.mock('../src/auth/auth.repository');

describe('Auth Middleware & Config Env', () => {
  let req, res, next;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test_secret';
  });

  beforeEach(() => {
    req = { headers: {} };
    res = {};
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('token inexistente -> 401', async () => {
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Token nao fornecido/);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('token antigo (session-token-123) -> 401', async () => {
    req.headers['x-auth-token'] = 'session-token-123';
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Formato de token invalido/);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('token malformado/invalido -> 401 generico', async () => {
    req.headers['x-auth-token'] = 'invalid_jwt_token';
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toBe('Nao autorizado.');
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('token com assinatura invalida -> 401 generico', async () => {
    const fakeToken = jwt.sign({ sub: 1 }, 'wrong_secret');
    req.headers['x-auth-token'] = fakeToken;
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toBe('Nao autorizado.');
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('token expirado -> 401 generico', async () => {
    const expiredToken = jwt.sign({ sub: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    req.headers['x-auth-token'] = expiredToken;
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toBe('Nao autorizado.');
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('usuario inexistente -> 401', async () => {
    const token = jwt.sign({ sub: 999 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;
    authRepository.encontrarPorId.mockResolvedValue(null);
    
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Usuario nao encontrado/);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });

  test('falha de conexao do banco (P1001 / PrismaClientInitializationError) ao buscar usuario -> 503 (nunca 401)', async () => {
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;

    const erroConexao = new Error('Can\'t reach database server');
    erroConexao.code = 'P1001';
    authRepository.encontrarPorId.mockRejectedValueOnce(erroConexao);

    const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
    await authMiddleware(req, res, next);
    spyConsole.mockRestore();

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(503);
    expect(next.mock.calls[0][0].statusCode).not.toBe(401);
  });

  test('erro inesperado do banco ao buscar usuario -> 500 (nunca 401)', async () => {
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;

    const erroInesperado = new Error('Query internal failure');
    erroInesperado.code = 'P2010';
    authRepository.encontrarPorId.mockRejectedValueOnce(erroInesperado);

    const spyConsole = jest.spyOn(console, 'error').mockImplementation(() => {});
    await authMiddleware(req, res, next);
    spyConsole.mockRestore();

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(500);
    expect(next.mock.calls[0][0].statusCode).not.toBe(401);
  });

  test('token valido -> req.usuario preenchido e chama next()', async () => {
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;
    authRepository.encontrarPorId.mockResolvedValue({
      id: 1, usuario: 'user1', nome: 'User One', perfil: 'USUARIO'
    });
    
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.usuario).toEqual({
      id: 1, usuario: 'user1', nome: 'User One', perfil: 'USUARIO'
    });
  });

  test('requireAdmin bloqueia perfil não-admin (403) e permite ADMINISTRADOR', () => {
    const nextAdmin = jest.fn();
    requireAdmin({ usuario: { id: 1, perfil: 'MOTORISTA' } }, {}, nextAdmin);
    expect(nextAdmin).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));

    const nextOk = jest.fn();
    requireAdmin({ usuario: { id: 99, perfil: 'ADMINISTRADOR' } }, {}, nextOk);
    expect(nextOk).toHaveBeenCalledWith();
  });

  test('validarVariaveisDeAmbiente lança erro explícito quando JWT_SECRET ou DATABASE_URL estão ausentes', () => {
    expect(() => validarVariaveisDeAmbiente({ DATABASE_URL: 'postgres://localhost/db' })).toThrow(/JWT_SECRET/);
    expect(() => validarVariaveisDeAmbiente({ JWT_SECRET: 'segredo' })).toThrow(/DATABASE_URL/);
    expect(() => validarVariaveisDeAmbiente({ JWT_SECRET: 'segredo', DATABASE_URL: 'postgres://localhost/db' })).not.toThrow();
  });
});
