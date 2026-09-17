const { calcularCorrida } = require('../src/rotas/rotas.controller');
const rotasService = require('../src/rotas/rotas.service');
const AppError = require('../src/utils/AppError');

jest.mock('../src/rotas/rotas.service', () => ({
  calcularCorrida: jest.fn().mockResolvedValue({ mock: 'ok' }),
}));

describe('RotasController - calcularCorrida Validations', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('deve rejeitar se origem ou destino ausentes', async () => {
    req.body = { origem: null, destino: null };
    await calcularCorrida(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/obrigatórios/);
  });

  test('deve rejeitar se nomes nao forem strings', async () => {
    req.body = {
      origem: { nome: 123, lat: -20, lng: -40 },
      destino: { nome: 'A', lat: -20, lng: -40 }
    };
    await calcularCorrida(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/textos válidos/);
  });

  test('deve rejeitar se coordenadas fora do limite', async () => {
    req.body = {
      origem: { nome: 'A', lat: 91, lng: -40 },
      destino: { nome: 'B', lat: -20, lng: -40 }
    };
    await calcularCorrida(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/válidas/);
  });

  test('deve rejeitar se origem e destino forem o mesmo local (mesmo com nomes diferentes)', async () => {
    req.body = {
      origem: { nome: 'Rua A', lat: -20.31970, lng: -40.33760 },
      destino: { nome: 'Local B', lat: -20.31975, lng: -40.33765 }
    };
    await calcularCorrida(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/diferentes fisicamente/);
  });

  test('nao deve rejeitar se nomes iguais mas locais fisicos distantes', async () => {
    req.body = {
      origem: { nome: 'Terminal', lat: -20.31970, lng: -40.33760 },
      destino: { nome: 'Terminal', lat: -21.0, lng: -41.0 }
    };
    await calcularCorrida(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(rotasService.calcularCorrida).toHaveBeenCalled();
  });

  test('deve rejeitar coordenadas parcialmente numericas como 20abc', async () => {
    req.body = {
      origem: { nome: 'A', lat: '20abc', lng: '-40.5' },
      destino: { nome: 'B', lat: -21.0, lng: -41.0 }
    };
    await calcularCorrida(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/numéricas e válidas/);
  });

  test('deve repassar ao service se valido', async () => {
    req.body = {
      origem: { nome: 'A', lat: -20, lng: -40 },
      destino: { nome: 'B', lat: -21, lng: -41 }
    };
    await calcularCorrida(req, res, next);
    expect(rotasService.calcularCorrida).toHaveBeenCalledWith(
      { nome: 'A', lat: -20, lng: -40 },
      { nome: 'B', lat: -21, lng: -41 }
    );
  });
});
