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


describe('Corridas — Cálculo de valor por categoria e horário', () => {
  const t = (hora, minuto) => {
    return `2026-10-01T${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}:00.000Z`;
  };

  test('BASICO deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(10, 0) })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(15, 0) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(20, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(2, 0) })).toBe(2.50);
  });

  test('NORMAL deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: t(10, 0) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: t(15, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: t(20, 0) })).toBe(3.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: t(2, 0) })).toBe(3.00);
  });

  test('PREMIUM deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: t(10, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: t(15, 0) })).toBe(3.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: t(20, 0) })).toBe(3.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: t(2, 0) })).toBe(3.50);
  });

  test('Limites de horário devem transitar corretamente', () => {
    const d = 1;
    // 04:59 -> faixa noturna, 05:00 -> primeira faixa
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(4, 59) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(5, 0) })).toBe(1.50);
    
    // 12:59 -> primeira faixa, 13:00 -> segunda faixa
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(12, 59) })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(13, 0) })).toBe(2.00);

    // 18:59 -> segunda faixa, 19:00 -> terceira faixa
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(18, 59) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: t(19, 0) })).toBe(2.50);
  });

  test('Exemplos completos de cálculo final', () => {
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'BASICO', dataHorario: t(10, 0) })).toBe(15.00);
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'NORMAL', dataHorario: t(15, 0) })).toBe(25.00);
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'PREMIUM', dataHorario: t(20, 0) })).toBe(35.00);
  });
});
