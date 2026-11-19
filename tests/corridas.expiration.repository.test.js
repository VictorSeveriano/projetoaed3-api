'use strict';

jest.mock('../src/database/prisma', () => ({
  $transaction: jest.fn(),
}));

const prisma = require('../src/database/prisma');
const corridasRepository = require('../src/corridas/corridas.repository');

describe('CorridasRepository — atomicidade na expiração de corridas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('cancelarSolicitadasVencidas retorna [] e não altera notificações quando UPDATE RETURNING não encontra linhas', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      notificacao: { updateMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));

    const agora = new Date('2026-10-01T14:00:00.000Z');
    const res = await corridasRepository.cancelarSolicitadasVencidas(agora);

    expect(res).toEqual([]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.notificacao.updateMany).not.toHaveBeenCalled();
  });

  test('cancelarSolicitadasVencidas atualiza notificações pendentes somente para os IDs efetivamente atualizados', async () => {
    const atualizada = {
      id: 'corrida-1',
      usuarioId: 'user-1',
      origemNome: 'A',
      destinoNome: 'B',
      dataHorario: new Date('2026-10-01T13:50:00.000Z'),
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([atualizada]),
      notificacao: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));

    const res = await corridasRepository.cancelarSolicitadasVencidas(new Date('2026-10-01T14:00:00.000Z'));

    expect(res).toEqual([atualizada]);
    expect(tx.notificacao.updateMany).toHaveBeenCalledWith({
      where: {
        tipo: 'NOVA_CORRIDA',
        referenciaId: { in: ['corrida-1'] },
        acaoMotorista: 'PENDENTE',
      },
      data: {
        acaoMotorista: 'CANCELADA',
        lida: true,
      },
    });
  });

  test('cancelarConfirmadaComMotivo avalia prazoConfirmacaoEm e embarquePassageiroConfirmado atomicamente no updateMany e retorna null se count === 0', async () => {
    const tx = {
      corrida: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
      },
      veiculo: { updateMany: jest.fn() },
    };
    prisma.$transaction.mockImplementation(async (fn) => fn(tx));

    const limite = new Date('2026-10-01T14:10:00.000Z');
    const res = await corridasRepository.cancelarConfirmadaComMotivo(
      'c-1',
      {
        canceladoPor: 'SISTEMA',
        motivo: 'Ausência de confirmação de embarque.',
        apenasSePrazoVencidoAte: limite,
        toleranciaMs: 5 * 60 * 1000,
      },
      limite
    );

    expect(res).toBeNull();
    expect(tx.corrida.findFirst).not.toHaveBeenCalled();
    expect(tx.corrida.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'c-1',
          status: 'CONFIRMADA',
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.any(Array) }),
            expect.objectContaining({
              OR: [
                { embarquePassageiroConfirmado: null },
                { embarquePassageiroConfirmado: false },
              ],
            }),
          ]),
        }),
      })
    );
    expect(tx.veiculo.updateMany).not.toHaveBeenCalled();
  });
});
