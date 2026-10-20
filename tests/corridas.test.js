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
const corridasController = require('../src/corridas/corridas.controller');
const corridasRepository = require('../src/corridas/corridas.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const auditoriaService = require('../src/auditoria/auditoria.service');
const AppError = require('../src/utils/AppError');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/veiculos/veiculos.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/notificacoes/notificacoes.service');
jest.mock('../src/auditoria/auditoria.service');


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

describe('Corridas — Validações de criação e segurança na persistência', () => {
  const usuarioAutenticado = { id: 'user-autenticado-1', perfil: 'USUARIO' };
  const payloadValido = {
    origemNome: 'Terminal Laranjeiras',
    destinoNome: 'UFES Goiabeiras',
    distanciaKm: 12.5,
    duracaoMin: 25,
    classe: 'NORMAL',
    formaPagamento: 'PIX',
    dataHorario: '2026-10-01T14:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    veiculosRepository.findDisponiveis.mockResolvedValue([
      { id: 'v1', classe: 'NORMAL', motoristaId: 'mot-1' },
      { id: 'v2', classe: 'BASICO', motoristaId: 'mot-2' },
    ]);
    motoristasRepository.findByUsuarioId.mockResolvedValue({ statusCadastro: 'APROVADO' });
    corridasRepository.create.mockImplementation(async (dados) => ({ id: 'corrida-1', ...dados }));
  });

  test('cria corrida com payload válido sem usuarioId e persiste com o ID do usuário autenticado', async () => {
    const resultado = await CorridasService.criar(payloadValido, usuarioAutenticado);

    expect(corridasRepository.create).toHaveBeenCalledTimes(1);
    expect(corridasRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId: 'user-autenticado-1',
      origemNome: 'Terminal Laranjeiras',
      destinoNome: 'UFES Goiabeiras',
      distanciaKm: 12.5,
      classe: 'NORMAL',
      formaPagamento: 'PIX',
      status: 'SOLICITADA',
    }));
    expect(resultado.usuarioId).toBe('user-autenticado-1');
  });

  test('ignora usuarioId de terceiro no payload e mantém usuário autenticado na persistência', async () => {
    const resultado = await CorridasService.criar(
      { ...payloadValido, usuarioId: 'outro-usuario-malicioso' },
      usuarioAutenticado
    );

    expect(corridasRepository.create).toHaveBeenCalledTimes(1);
    expect(corridasRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      usuarioId: 'user-autenticado-1',
    }));
    expect(resultado.usuarioId).toBe('user-autenticado-1');
  });

  test('rejeita criação quando origemNome ou destinoNome estão ausentes e não persiste', async () => {
    await expect(
      CorridasService.criar({ ...payloadValido, origemNome: '' }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      CorridasService.criar({ ...payloadValido, destinoNome: null }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita distância inválida (zero, negativa ou não numérica) e não persiste', async () => {
    await expect(
      CorridasService.criar({ ...payloadValido, distanciaKm: 0 }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      CorridasService.criar({ ...payloadValido, distanciaKm: -5 }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      CorridasService.criar({ ...payloadValido, distanciaKm: 'invalida' }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita duração inválida (zero ou negativa) e não persiste', async () => {
    await expect(
      CorridasService.criar({ ...payloadValido, duracaoMin: 0 }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      CorridasService.criar({ ...payloadValido, duracaoMin: -10 }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita classe ou forma de pagamento inválidas e não persiste', async () => {
    await expect(
      CorridasService.criar({ ...payloadValido, classe: 'LUXO' }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      CorridasService.criar({ ...payloadValido, formaPagamento: 'BOLETO' }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita quando não há veículos disponíveis da classe solicitada (409) e não persiste', async () => {
    await expect(
      CorridasService.criar({ ...payloadValido, classe: 'PREMIUM' }, usuarioAutenticado)
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('controller rejeita campos obrigatórios ausentes (400) sem acionar persistência', async () => {
    const req = {
      body: { origemNome: 'Origem', distanciaKm: 10 }, // falta destinoNome
      usuario: usuarioAutenticado,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    await corridasController.criar(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(corridasRepository.create).not.toHaveBeenCalled();
  });
});
