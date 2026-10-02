const jwt = require('jsonwebtoken');
const { authMiddleware } = require('../src/middlewares/auth.middleware');
const authRepository = require('../src/auth/auth.repository');
const AppError = require('../src/utils/AppError');

jest.mock('../src/auth/auth.repository');

describe('Auth Middleware', () => {
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
  });

  test('token antigo (session-token-123) -> 401', async () => {
    req.headers['x-auth-token'] = 'session-token-123';
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Formato de token invalido/);
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
  });

  test('token expirado -> 401 generico', async () => {
    const expiredToken = jwt.sign({ sub: 1 }, process.env.JWT_SECRET, { expiresIn: '-1s' });
    req.headers['x-auth-token'] = expiredToken;
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toBe('Nao autorizado.');
  });

  test('usuario inexistente -> 401', async () => {
    const token = jwt.sign({ sub: 999 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;
    authRepository.encontrarPorId.mockResolvedValue(null);
    
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Usuario nao encontrado/);
  });

  test('token valido -> req.usuario preenchido e chama next()', async () => {
    const token = jwt.sign({ sub: 1 }, process.env.JWT_SECRET);
    req.headers['x-auth-token'] = token;
    authRepository.encontrarPorId.mockResolvedValue({
      id: 1, usuario: 'user1', nome: 'User One', perfil: 'USUARIO'
    });
    
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalledWith(); // called without error
    expect(req.usuario).toBeDefined();
    expect(req.usuario).toEqual({
      id: 1, usuario: 'user1', nome: 'User One', perfil: 'USUARIO'
    });
  });
});
