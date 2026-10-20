/**
 * corridas.test.js — Testes da entidade Corrida e do CorridasService.
 */

const Corrida = require('../src/corridas/Corrida');
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

describe('Corridas — Cálculo de valor por categoria e horário (fuso America/Sao_Paulo)', () => {
  // Horário no fuso do negócio (America/Sao_Paulo, UTC-03:00)
  const tLocal = (hora, minuto) =>
    `2026-10-01T${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}:00-03:00`;

  // Mesmo horário expresso como ISO sem offset (datetime-local)
  const tSemOffset = (hora, minuto) =>
    `2026-10-01T${hora.toString().padStart(2, '0')}:${minuto.toString().padStart(2, '0')}`;

  test('BASICO deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(10, 0) })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(15, 0) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(20, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(2, 0) })).toBe(2.50);
  });

  test('NORMAL deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: tLocal(10, 0) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: tLocal(15, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: tLocal(20, 0) })).toBe(3.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'NORMAL', dataHorario: tLocal(2, 0) })).toBe(3.00);
  });

  test('PREMIUM deve cobrar corretamente por faixa de horário', () => {
    const d = 1;
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: tLocal(10, 0) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: tLocal(15, 0) })).toBe(3.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: tLocal(20, 0) })).toBe(3.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'PREMIUM', dataHorario: tLocal(2, 0) })).toBe(3.50);
  });

  test('Limites exatos de horário (04:59, 05:00, 12:59, 13:00, 18:59, 19:00) em America/Sao_Paulo e ISO UTC', () => {
    const d = 1;
    // Com offset -03:00 e sem offset
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(4, 59) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(5, 0) })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(12, 59) })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(13, 0) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(18, 59) })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tLocal(19, 0) })).toBe(2.50);

    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tSemOffset(4, 59) })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: tSemOffset(5, 0) })).toBe(1.50);

    // Equivalentes em UTC (Z): 07:59Z = 04:59 BRT (noite), 08:00Z = 05:00 BRT (manhã),
    // 15:59Z = 12:59 BRT (manhã), 16:00Z = 13:00 BRT (tarde),
    // 21:59Z = 18:59 BRT (tarde), 22:00Z = 19:00 BRT (noite)
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T07:59:00.000Z' })).toBe(2.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T08:00:00.000Z' })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T15:59:00.000Z' })).toBe(1.50);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T16:00:00.000Z' })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T21:59:00.000Z' })).toBe(2.00);
    expect(CorridasService.calcularValor({ distanciaKm: d, classe: 'BASICO', dataHorario: '2026-10-01T22:00:00.000Z' })).toBe(2.50);
  });

  test('Exemplos completos de cálculo final', () => {
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'BASICO', dataHorario: tLocal(10, 0) })).toBe(15.00);
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'NORMAL', dataHorario: tLocal(15, 0) })).toBe(25.00);
    expect(CorridasService.calcularValor({ distanciaKm: 10, classe: 'PREMIUM', dataHorario: tLocal(20, 0) })).toBe(35.00);
  });

  test('Rejeita dataHorario inválido ou inexistente no calendário (400)', () => {
    for (const dataInvalida of ['', '   ', 'data-invalida', '2026-02-30T10:00:00Z', '2026-13-01T10:00:00', null, undefined, {}, []]) {
      expect(() =>
        CorridasService.calcularValor({ distanciaKm: 5, classe: 'NORMAL', dataHorario: dataInvalida })
      ).toThrow(AppError);
    }
  });
});

describe('Corridas — Validações de criação, duração, coordenadas e segurança na persistência', () => {
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
      duracaoMin: 25,
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

  test('rejeita criação quando origemNome ou destinoNome estão ausentes ou não são strings e não persiste', async () => {
    for (const invalido of ['', '   ', null, undefined, 123, {}, []]) {
      await expect(
        CorridasService.criar({ ...payloadValido, origemNome: invalido }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });

      await expect(
        CorridasService.criar({ ...payloadValido, destinoNome: invalido }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita distância inválida (zero, negativa, não numérica, booleano, array, objeto, Infinity, NaN) e não persiste', async () => {
    for (const distInvalida of [0, -5, 'invalida', '', '   ', NaN, Infinity, -Infinity, true, false, [], {}, null, undefined]) {
      await expect(
        CorridasService.criar({ ...payloadValido, distanciaKm: distInvalida }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('validação numérica completa de duracaoMin: ausente/null -> null; inteiro positivo/string numérica -> convertido; inválidos -> 400', async () => {
    // Ausente ou null -> persiste null
    const { duracaoMin: _omit, ...semDuracao } = payloadValido;
    const rSem = await CorridasService.criar(semDuracao, usuarioAutenticado);
    expect(rSem.duracaoMin).toBeNull();

    const rNull = await CorridasService.criar({ ...payloadValido, duracaoMin: null }, usuarioAutenticado);
    expect(rNull.duracaoMin).toBeNull();

    // String numérica inteira -> convertida para número
    const rStr = await CorridasService.criar({ ...payloadValido, duracaoMin: '25' }, usuarioAutenticado);
    expect(rStr.duracaoMin).toBe(25);
    expect(typeof rStr.duracaoMin).toBe('number');

    corridasRepository.create.mockClear();

    // Inválidos -> 400 e não persiste
    const duracoesInvalidas = [0, -1, -10, '0', '-5', 'abc', '', '   ', NaN, Infinity, -Infinity, true, false, [], [10], {}, 12.5, '12.5'];
    for (const durInvalida of duracoesInvalidas) {
      await expect(
        CorridasService.criar({ ...payloadValido, duracaoMin: durInvalida }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('coordenadas geográficas: preserva 0 como coordenada válida, aceita limites e rejeita fora da faixa ou tipos inválidos', async () => {
    const rZero = await CorridasService.criar({
      ...payloadValido,
      origemLat: 0,
      origemLng: 0,
      destinoLat: -90,
      destinoLng: 180,
    }, usuarioAutenticado);

    expect(rZero.origemLat).toBe(0);
    expect(rZero.origemLng).toBe(0);
    expect(rZero.destinoLat).toBe(-90);
    expect(rZero.destinoLng).toBe(180);

    // Entidade Corrida também preserva 0
    const entidade = new Corrida({ ...rZero, id: 'c-zero' });
    expect(entidade.origemLat).toBe(0);
    expect(entidade.origemLng).toBe(0);

    corridasRepository.create.mockClear();

    // Fora da faixa ou tipos inválidos
    const coordsInvalidas = [
      { origemLat: -90.001 },
      { origemLat: 90.001 },
      { destinoLat: 95 },
      { origemLng: -180.001 },
      { origemLng: 180.001 },
      { destinoLng: -200 },
      { origemLat: 'abc' },
      { origemLng: '' },
      { destinoLat: true },
      { destinoLng: [] },
      { origemLat: NaN },
      { origemLng: Infinity },
    ];

    for (const invalida of coordsInvalidas) {
      await expect(
        CorridasService.criar({ ...payloadValido, ...invalida }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(corridasRepository.create).not.toHaveBeenCalled();
  });

  test('rejeita classe ou forma de pagamento inválidas (incluindo tipos não-string) e não persiste', async () => {
    for (const classeInv of ['LUXO', '', 123, {}, []]) {
      await expect(
        CorridasService.criar({ ...payloadValido, classe: classeInv }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }

    for (const pgtoInv of ['BOLETO', '', 123, {}, []]) {
      await expect(
        CorridasService.criar({ ...payloadValido, formaPagamento: pgtoInv }, usuarioAutenticado)
      ).rejects.toMatchObject({ statusCode: 400 });
    }

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
