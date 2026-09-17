const { obterGrafo } = require('../src/grafo/grafo.controller');
const grafoService = require('../src/grafo/grafo.service');
const AppError = require('../src/utils/AppError');

// Mock do service para focar apenas na logica do controller
jest.mock('../src/grafo/grafo.service', () => ({
  obterGrafoDaOperacao: jest.fn().mockReturnValue({ mock: 'grafo' }),
}));

describe('GrafoController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  test('deve retornar a documentacao se nao houver origemNome ou destinoNome', () => {
    obterGrafo(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        descricao: expect.any(String),
      })
    }));
  });

  test('deve rejeitar se distancia for ausente, zero ou negativa', () => {
    req.query = {
      origemNome: 'A', destinoNome: 'B',
      origemLat: '-20.0', origemLng: '-40.0',
      destinoLat: '-20.1', destinoLng: '-40.1',
      distanciaMetros: '0'
    };
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Distância inválida/);

    req.query.distanciaMetros = '-100';
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));

    req.query.distanciaMetros = 'abc';
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('deve rejeitar coordenadas invalidas (nao numericas)', () => {
    req.query = {
      origemNome: 'A', destinoNome: 'B',
      origemLat: 'abc', origemLng: '-40.0',
      destinoLat: '-20.1', destinoLng: '-40.1',
      distanciaMetros: '1000'
    };
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].message).toMatch(/Coordenadas inválidas/);
  });

  test('deve rejeitar latitude fora dos limites (-90 a 90)', () => {
    req.query = {
      origemNome: 'A', destinoNome: 'B',
      origemLat: '91', origemLng: '-40.0',
      destinoLat: '-20.1', destinoLng: '-40.1',
      distanciaMetros: '1000'
    };
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('deve rejeitar longitude fora dos limites (-180 a 180)', () => {
    req.query = {
      origemNome: 'A', destinoNome: 'B',
      origemLat: '-20.0', origemLng: '181',
      destinoLat: '-20.1', destinoLng: '-40.1',
      distanciaMetros: '1000'
    };
    obterGrafo(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  test('deve criar grafo se todos os dados forem validos', () => {
    req.query = {
      origemNome: 'Origem', destinoNome: 'Destino',
      origemLat: '-20.0', origemLng: '-40.0',
      destinoLat: '-20.1', destinoLng: '-40.1',
      distanciaMetros: '1500'
    };
    obterGrafo(req, res, next);
    expect(grafoService.obterGrafoDaOperacao).toHaveBeenCalledWith(
      { nome: 'Origem', lat: -20.0, lng: -40.0 },
      { nome: 'Destino', lat: -20.1, lng: -40.1 },
      [{ distanciaMetros: 1500 }]
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { mock: 'grafo' }
    }));
  });
});
