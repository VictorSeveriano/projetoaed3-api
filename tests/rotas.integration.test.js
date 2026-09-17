const rotasService = require('../src/rotas/rotas.service');
const grafoService = require('../src/grafo/grafo.service');

// Spy on grafoService methods to verify isolation and integration
jest.spyOn(grafoService, 'construirGrafoDaOperacao');
jest.spyOn(grafoService, 'organizarAlternativasComABB');

// Mock Google Maps API integration inside rotasService
jest.mock('https', () => ({
  request: jest.fn((options, cb) => {
    const res = {
      on: jest.fn((event, handler) => {
        if (event === 'data') {
          handler(JSON.stringify({
            routes: [
              { distanceMeters: 8200, duration: '600s', polyline: { encodedPolyline: 'poly8200' } },
              { distanceMeters: 5400, duration: '400s', polyline: { encodedPolyline: 'poly5400' } },
              { distanceMeters: 6700, duration: '500s', polyline: { encodedPolyline: 'poly6700' } }
            ]
          }));
        }
        if (event === 'end') handler();
      })
    };
    cb(res);
    return {
      on: jest.fn(),
      setTimeout: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
  })
}));

describe('RotasService - Integration with Grafo and ABB', () => {
  let originalApiKey;

  beforeAll(() => {
    originalApiKey = process.env.GOOGLE_MAPS_API_KEY;
    process.env.GOOGLE_MAPS_API_KEY = 'test_key';
  });

  afterAll(() => {
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('deve integrar fluxo completo: Rotas -> Grafo (com multiplas alternativas) -> ABB', async () => {
    const origem = { nome: 'OrigemA', lat: -20, lng: -40 };
    const destino = { nome: 'DestinoB', lat: -21, lng: -41 };

    const resultado = await rotasService.calcularCorrida(origem, destino);

    // 1. O grafo da operacao foi construido
    expect(grafoService.construirGrafoDaOperacao).toHaveBeenCalledTimes(1);
    
    // 2. A ABB organizou as rotas
    expect(grafoService.organizarAlternativasComABB).toHaveBeenCalledTimes(1);

    // 3. Verifica as rotas formatadas e retornadas pela ABB estao na ordem correta
    expect(resultado.rotas).toHaveLength(3);
    expect(resultado.rotas[0].distanciaKm).toBe(5.4); // 5400m
    expect(resultado.rotas[1].distanciaKm).toBe(6.7); // 6700m
    expect(resultado.rotas[2].distanciaKm).toBe(8.2); // 8200m

    // 4. Verifica se o grafo contem 3 arestas (multiplas rotas/multigrafo)
    const grafo = resultado.grafoDaOperacao;
    expect(grafo['OrigemA']).toBeDefined();
    expect(grafo['OrigemA']).toHaveLength(3); // 3 arestas saindo da origem para o destino
    
    // Verifica se os pesos das arestas sao exatamente as distancias recebidas
    const pesos = grafo['OrigemA'].map(a => a.peso).sort((a, b) => a - b);
    expect(pesos).toEqual([5.4, 6.7, 8.2]);
  });

  test('teste de isolamento: multiplas operacoes nao devem misturar dados', async () => {
    const op1Origem = { nome: 'O1', lat: -20, lng: -40 };
    const op1Destino = { nome: 'D1', lat: -21, lng: -41 };

    const op2Origem = { nome: 'O2', lat: -22, lng: -42 };
    const op2Destino = { nome: 'D2', lat: -23, lng: -43 };

    const [res1, res2] = await Promise.all([
      rotasService.calcularCorrida(op1Origem, op1Destino),
      rotasService.calcularCorrida(op2Origem, op2Destino)
    ]);

    // Grafo 1 s tem O1 e D1
    expect(Object.keys(res1.grafoDaOperacao)).toEqual(['O1', 'D1']);
    // Grafo 2 s tem O2 e D2
    expect(Object.keys(res2.grafoDaOperacao)).toEqual(['O2', 'D2']);

    // Nao se misturaram
    expect(res1.grafoDaOperacao['O2']).toBeUndefined();
    expect(res2.grafoDaOperacao['O1']).toBeUndefined();
  });
});
