'use strict';
/**
 * validador.corrida.test.js — Testes unitários para validarDadosCriacaoCorrida
 *
 * Foco: validação pareada de coordenadas (lat/lng de origem e destino).
 * Os campos obrigatórios mínimos são: origemNome, destinoNome, distanciaKm.
 */

const { validarDadosCriacaoCorrida } = require('../src/corridas/corridas.validador');
const AppError = require('../src/utils/AppError');

/** Payload base válido (sem coordenadas) */
const baseValido = {
  origemNome: 'Aeroporto',
  destinoNome: 'Centro',
  distanciaKm: 10,
  dataHorario: '2026-01-15T10:00:00Z',
};

describe('validarDadosCriacaoCorrida — validação pareada de coordenadas', () => {

  // ─── origem ─────────────────────────────────────────────────────────────────

  describe('origemLat / origemLng', () => {
    test('aceita quando ambos estão ausentes', () => {
      const resultado = validarDadosCriacaoCorrida({ ...baseValido });
      expect(resultado.origemLat).toBeNull();
      expect(resultado.origemLng).toBeNull();
    });

    test('aceita quando ambos estão presentes e válidos', () => {
      const resultado = validarDadosCriacaoCorrida({
        ...baseValido,
        origemLat: -23.5505,
        origemLng: -46.6333,
      });
      expect(resultado.origemLat).toBeCloseTo(-23.5505);
      expect(resultado.origemLng).toBeCloseTo(-46.6333);
    });

    test('aceita coordenadas iguais a zero', () => {
      const resultado = validarDadosCriacaoCorrida({
        ...baseValido,
        origemLat: 0,
        origemLng: 0,
      });
      expect(resultado.origemLat).toBe(0);
      expect(resultado.origemLng).toBe(0);
    });

    test('rejeita quando apenas origemLat é fornecida', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, origemLat: -23.5505 })
      ).toThrow(AppError);

      try {
        validarDadosCriacaoCorrida({ ...baseValido, origemLat: -23.5505 });
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/origemLat.*origemLng/i);
      }
    });

    test('rejeita quando apenas origemLng é fornecida', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, origemLng: -46.6333 })
      ).toThrow(AppError);

      try {
        validarDadosCriacaoCorrida({ ...baseValido, origemLng: -46.6333 });
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/origemLat.*origemLng/i);
      }
    });
  });

  // ─── destino ─────────────────────────────────────────────────────────────────

  describe('destinoLat / destinoLng', () => {
    test('aceita quando ambos estão ausentes', () => {
      const resultado = validarDadosCriacaoCorrida({ ...baseValido });
      expect(resultado.destinoLat).toBeNull();
      expect(resultado.destinoLng).toBeNull();
    });

    test('aceita quando ambos estão presentes e válidos', () => {
      const resultado = validarDadosCriacaoCorrida({
        ...baseValido,
        destinoLat: -22.9068,
        destinoLng: -43.1729,
      });
      expect(resultado.destinoLat).toBeCloseTo(-22.9068);
      expect(resultado.destinoLng).toBeCloseTo(-43.1729);
    });

    test('aceita coordenadas iguais a zero', () => {
      const resultado = validarDadosCriacaoCorrida({
        ...baseValido,
        destinoLat: 0,
        destinoLng: 0,
      });
      expect(resultado.destinoLat).toBe(0);
      expect(resultado.destinoLng).toBe(0);
    });

    test('rejeita quando apenas destinoLat é fornecida', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, destinoLat: -22.9068 })
      ).toThrow(AppError);

      try {
        validarDadosCriacaoCorrida({ ...baseValido, destinoLat: -22.9068 });
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/destinoLat.*destinoLng/i);
      }
    });

    test('rejeita quando apenas destinoLng é fornecida', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, destinoLng: -43.1729 })
      ).toThrow(AppError);

      try {
        validarDadosCriacaoCorrida({ ...baseValido, destinoLng: -43.1729 });
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.message).toMatch(/destinoLat.*destinoLng/i);
      }
    });
  });

  // ─── campos obrigatórios e regras existentes ──────────────────────────────

  describe('validações pré-existentes (sem regressão)', () => {
    test('rejeita payload sem origemNome', () => {
      const { origemNome: _, ...semOrigem } = baseValido;
      expect(() => validarDadosCriacaoCorrida(semOrigem)).toThrow(AppError);
    });

    test('rejeita payload sem destinoNome', () => {
      const { destinoNome: _, ...semDestino } = baseValido;
      expect(() => validarDadosCriacaoCorrida(semDestino)).toThrow(AppError);
    });

    test('rejeita distanciaKm negativa', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, distanciaKm: -5 })
      ).toThrow(AppError);
    });

    test('rejeita distanciaKm zero', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, distanciaKm: 0 })
      ).toThrow(AppError);
    });

    test('rejeita origemLat fora do intervalo [-90, 90]', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, origemLat: 91, origemLng: 0 })
      ).toThrow(AppError);
    });

    test('rejeita origemLng fora do intervalo [-180, 180]', () => {
      expect(() =>
        validarDadosCriacaoCorrida({ ...baseValido, origemLat: 0, origemLng: 181 })
      ).toThrow(AppError);
    });

    test('aceita payload completo com todos os campos opcionais', () => {
      const resultado = validarDadosCriacaoCorrida({
        ...baseValido,
        origemLat: -23.5505,
        origemLng: -46.6333,
        destinoLat: -22.9068,
        destinoLng: -43.1729,
        duracaoMin: 30,
        classe: 'PREMIUM',
        formaPagamento: 'CARTAO_CREDITO',
      });
      expect(resultado.classe).toBe('PREMIUM');
      expect(resultado.duracaoMin).toBe(30);
    });
  });
});

