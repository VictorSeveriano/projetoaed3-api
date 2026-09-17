// Mock do grafo service para testes de reservas
jest.mock('../src/grafo/grafo.service', () => ({
  localizacaoExiste: (nome) => ['Centro', 'Shopping', 'Aeroporto', 'Rodoviaria', 'Praia', 'Universidade'].includes(nome),
  calcularRota: (origem, destino) => ({
    origem, destino,
    caminho: [origem, destino],
    distanciaTotal: 10,
  }),
}));

const reservasService = require('../src/reservas/reservas.service');
const carrosService = require('../src/carros/carros.service');

describe('ReservasService', () => {
  beforeEach(() => {
    // Garante que o carro 1 esteja disponivel antes de cada teste
    try { carrosService.atualizarStatus('1', 'DISPONIVEL'); } catch (_) {}
  });

  test('deve criar uma reserva valida', () => {
    const dados = {
      usuarioId: '1',
      carroId: '1',
      dataInicio: '2025-10-01',
      dataFim: '2025-10-05',
      localRetirada: 'Centro',
      localDevolucao: 'Aeroporto',
    };
    const reserva = reservasService.criar(dados);
    expect(reserva).toHaveProperty('id');
    expect(reserva.status).toBe('ATIVA');
    expect(reserva.rota).not.toBeNull();
    // Limpa: cancela a reserva e libera o carro
    reservasService.cancelar(reserva.id);
  });

  test('deve lancar erro para carro nao disponivel', () => {
    carrosService.atualizarStatus('2', 'RESERVADO');
    expect(() =>
      reservasService.criar({
        usuarioId: '1', carroId: '2',
        dataInicio: '2025-11-01', dataFim: '2025-11-05',
        localRetirada: 'Centro', localDevolucao: 'Aeroporto',
      })
    ).toThrow('nao esta disponivel');
    carrosService.atualizarStatus('2', 'DISPONIVEL');
  });

  test('deve lancar erro para data fim anterior a data inicio', () => {
    expect(() =>
      reservasService.criar({
        usuarioId: '1', carroId: '3',
        dataInicio: '2025-10-10', dataFim: '2025-10-05',
        localRetirada: 'Centro', localDevolucao: 'Aeroporto',
      })
    ).toThrow('data de fim deve ser posterior');
  });


  test('deve cancelar uma reserva ativa', () => {
    const dados = {
      usuarioId: '1', carroId: '4',
      dataInicio: '2025-12-01', dataFim: '2025-12-05',
      localRetirada: 'Rodoviaria', localDevolucao: 'Shopping',
    };
    const reserva = reservasService.criar(dados);
    const cancelada = reservasService.cancelar(reserva.id);
    expect(cancelada.status).toBe('CANCELADA');
  });

  test('deve lancar erro ao cancelar reserva ja cancelada', () => {
    const dados = {
      usuarioId: '1', carroId: '5',
      dataInicio: '2025-12-10', dataFim: '2025-12-15',
      localRetirada: 'Praia', localDevolucao: 'Shopping',
    };
    const reserva = reservasService.criar(dados);
    reservasService.cancelar(reserva.id);
    expect(() => reservasService.cancelar(reserva.id)).toThrow('ja esta cancelada');
  });

  test('deve lancar erro ao buscar reserva inexistente', () => {
    expect(() => reservasService.buscarPorId('id-inexistente')).toThrow('nao encontrada');
  });
});
