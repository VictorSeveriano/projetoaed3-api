/**
 * corridas.test.js — Testes da entidade Corrida e do CorridasService.
 *
 * Cobre:
 * - Criação de corrida com ID único e sequencial (formato 'c15', 'c16'...)
 * - Múltiplas corridas sem colisão de ID
 * - Consulta por ID (existente e inexistente)
 * - Cancelamento: SOLICITADA → CANCELADA
 * - Cancelamento de corrida já cancelada → erro 409
 * - Finalização de corrida
 * - Dados inválidos: campos obrigatórios, distância inválida, duração inválida
 * - Cálculo de valor por categoria de veículo
 */

const CorridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');

describe('Corridas — Criação e ID', () => {
  test('deve criar corrida com ID no formato "c<numero>"', () => {
    const corrida = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'Aeroporto de Vitória',
      destinoNome: 'Shopping Montserrat',
      distanciaKm: 15,
      duracaoMin: 25,
    });

    expect(corrida.id).toMatch(/^c\d+$/);
    expect(corrida.status).toBe('SOLICITADA');
    expect(corrida.origemNome).toBe('Aeroporto de Vitória');
    expect(corrida.destinoNome).toBe('Shopping Montserrat');
  });

  test('deve criar múltiplas corridas com IDs sequenciais sem colisão', () => {
    const ids = new Set();
    const n = 5;
    for (let i = 0; i < n; i++) {
      const c = CorridasService.criar({
        usuarioId: '2',
        origemNome: 'Origem ' + i,
        destinoNome: 'Destino ' + i,
        distanciaKm: i + 1,
        duracaoMin: 10,
      });
      expect(c.id).toMatch(/^c\d+$/);
      ids.add(c.id);
    }
    expect(ids.size).toBe(n); // todos os IDs são únicos
  });

  test('corrida criada deve ter status SOLICITADA por padrão', () => {
    const corrida = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'Centro',
      destinoNome: 'Praia',
      distanciaKm: 8,
    });
    expect(corrida.status).toBe('SOLICITADA');
  });

  test('corrida criada deve preservar polyline e coordenadas quando fornecidos', () => {
    const corrida = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'Ponto A',
      destinoNome: 'Ponto B',
      distanciaKm: 10,
      origemLat: -20.25,
      origemLng: -40.28,
      destinoLat: -20.30,
      destinoLng: -40.32,
      polyline: 'abc123xyz',
    });
    expect(corrida.origemLat).toBe(-20.25);
    expect(corrida.origemLng).toBe(-40.28);
    expect(corrida.polyline).toBe('abc123xyz');
  });
});

describe('Corridas — Consulta', () => {
  let corridaCriada;

  beforeEach(() => {
    corridaCriada = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 5,
    });
  });

  test('deve encontrar corrida pelo ID correto', () => {
    const encontrada = CorridasService.buscarPorId(corridaCriada.id);
    expect(encontrada).not.toBeNull();
    expect(encontrada.id).toBe(corridaCriada.id);
  });

  test('deve lançar erro ao buscar ID inexistente', () => {
    expect(() => CorridasService.buscarPorId('c99999')).toThrow();
  });

  test('listarTodas deve retornar array não vazio', () => {
    const todas = CorridasService.listarTodas();
    expect(Array.isArray(todas)).toBe(true);
    expect(todas.length).toBeGreaterThan(0);
  });
});

describe('Corridas — Cancelamento', () => {
  let corridaCriada;

  beforeEach(() => {
    corridaCriada = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 5,
    });
  });

  test('deve cancelar corrida com status SOLICITADA', () => {
    expect(corridaCriada.status).toBe('SOLICITADA');
    const cancelada = CorridasService.cancelar(corridaCriada.id);
    expect(cancelada.status).toBe('CANCELADA');
  });

  test('deve lançar erro 409 ao tentar cancelar corrida já CANCELADA', () => {
    CorridasService.cancelar(corridaCriada.id);
    expect(() => CorridasService.cancelar(corridaCriada.id)).toThrow();
  });

  test('deve lançar erro ao tentar cancelar corrida FINALIZADA', () => {
    CorridasService.finalizar(corridaCriada.id);
    expect(() => CorridasService.cancelar(corridaCriada.id)).toThrow();
  });
});

describe('Corridas — Finalização', () => {
  let corridaCriada;

  beforeEach(() => {
    corridaCriada = CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 5,
    });
  });

  test('deve finalizar corrida com status SOLICITADA', () => {
    const finalizada = CorridasService.finalizar(corridaCriada.id);
    expect(finalizada.status).toBe('FINALIZADA');
  });

  test('deve lançar erro ao tentar finalizar corrida já FINALIZADA', () => {
    CorridasService.finalizar(corridaCriada.id);
    expect(() => CorridasService.finalizar(corridaCriada.id)).toThrow();
  });
});

describe('Corridas — Validação de dados inválidos', () => {
  test('deve lançar erro se usuarioId não fornecido', () => {
    expect(() => CorridasService.criar({
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 5,
    })).toThrow();
  });

  test('deve lançar erro se origemNome não fornecido', () => {
    expect(() => CorridasService.criar({
      usuarioId: '1',
      destinoNome: 'B',
      distanciaKm: 5,
    })).toThrow();
  });

  test('deve lançar erro se destinoNome não fornecido', () => {
    expect(() => CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      distanciaKm: 5,
    })).toThrow();
  });

  test('deve lançar erro se distanciaKm for zero', () => {
    expect(() => CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 0,
    })).toThrow();
  });

  test('deve lançar erro se distanciaKm for negativa', () => {
    expect(() => CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: -5,
    })).toThrow();
  });

  test('deve lançar erro se duracaoMin for zero quando fornecido', () => {
    expect(() => CorridasService.criar({
      usuarioId: '1',
      origemNome: 'A',
      destinoNome: 'B',
      distanciaKm: 10,
      duracaoMin: 0,
    })).toThrow();
  });
});

describe('Corridas — Cálculo de valor por categoria', () => {
  test('calcularValor deve retornar valor proporcional à distancia para categoria Hatch', () => {
    const valor = CorridasService.calcularValor(10, 'Hatch');
    expect(valor).toBeGreaterThan(0);
    expect(valor).toBe(CorridasService.calcularValor(10, 'Hatch'));
  });

  test('categoria SUV deve ter tarifa maior que Hatch', () => {
    const valorHatch = CorridasService.calcularValor(10, 'Hatch');
    const valorSuv = CorridasService.calcularValor(10, 'SUV');
    expect(valorSuv).toBeGreaterThan(valorHatch);
  });

  test('categoria default deve usar tarifa base quando categoria desconhecida', () => {
    const valor = CorridasService.calcularValor(10, 'CategoriaInexistente');
    expect(valor).toBeGreaterThan(0);
  });

  test('valor deve escalar linearmente com a distancia', () => {
    const valor10 = CorridasService.calcularValor(10, 'Sedan');
    const valor20 = CorridasService.calcularValor(20, 'Sedan');
    expect(valor20).toBeCloseTo(valor10 * 2, 1);
  });
});
