'use strict';

const { ReadCache } = require('../src/utils/readCache');

jest.mock('../src/corridas/corridas.repository', () => ({
  findAllParaDashboard: jest.fn(),
  findAll: jest.fn(),
}));
jest.mock('../src/veiculos/veiculos.repository', () => ({
  findAllParaDashboard: jest.fn(),
  findAll: jest.fn(),
}));
jest.mock('../src/notificacoes/notificacoes.repository', () => ({
  findByDestinatario: jest.fn(),
  findById: jest.fn(),
  findNaoLidas: jest.fn(),
  contarNaoLidas: jest.fn(),
  obterResumoNaoLidas: jest.fn(),
  create: jest.fn(),
  atualizarAcaoMotorista: jest.fn(),
  marcarLida: jest.fn(),
  marcarTodasLidas: jest.fn(),
  marcarLidaPorReferencia: jest.fn(),
}));

const corridasRepository = require('../src/corridas/corridas.repository');
const veiculosRepository = require('../src/veiculos/veiculos.repository');
const notificacoesRepository = require('../src/notificacoes/notificacoes.repository');
const dashboardService = require('../src/dashboard/dashboard.service');
const notificacoesService = require('../src/notificacoes/notificacoes.service');

describe('Etapa 4 — Otimizações de backend (ReadCache, Dashboard consolidado, Resumo de notificações)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('ReadCache coalesces chamadas concorrentes, respeita TTL e invalida por chave e prefixo', async () => {
    const cache = new ReadCache({ maxEntries: 3, bypassInTest: false });
    let chamadas = 0;

    const carregador = () => new Promise((resolve) => {
      chamadas += 1;
      setTimeout(() => resolve({ n: chamadas }), 20);
    });

    const [a, b] = await Promise.all([
      cache.obterOuCarregar('k:1', 5000, carregador),
      cache.obterOuCarregar('k:1', 5000, carregador),
    ]);

    expect(a).toEqual({ n: 1 });
    expect(b).toEqual({ n: 1 });
    expect(chamadas).toBe(1);

    // Hit em cache quente
    const c = await cache.obterOuCarregar('k:1', 5000, carregador);
    expect(c).toEqual({ n: 1 });
    expect(chamadas).toBe(1);

    // Invalidação por prefixo força recarga
    cache.invalidarPrefixo('k:');
    const d = await cache.obterOuCarregar('k:1', 5000, carregador);
    expect(d).toEqual({ n: 2 });
    expect(chamadas).toBe(2);
  });

  test('ReadCache impede race condition quando uma chave é invalidada durante requisição em voo', async () => {
    const cache = new ReadCache({ maxEntries: 10, bypassInTest: false });
    let resolverLento;
    const pLenta = cache.obterOuCarregar(
      'corridas:admin',
      5000,
      () => new Promise((resolve) => { resolverLento = resolve; })
    );

    // Aguarda um microtask para o carregador iniciar e registrar resolverLento
    await Promise.resolve();
    // Mutação invalida antes da resposta antiga chegar
    cache.invalidar('corridas:admin');
    resolverLento(['valor-antigo']);
    await pLenta;

    // Próxima leitura não pode receber o valor antigo
    const atualizado = await cache.obterOuCarregar('corridas:admin', 5000, async () => ['valor-novo']);
    expect(atualizado).toEqual(['valor-novo']);
  });

  test('ReadCache aplica limite máximo de entradas (bounded FIFO)', async () => {
    const cache = new ReadCache({ maxEntries: 2, bypassInTest: false });
    await cache.obterOuCarregar('a', 5000, async () => 1);
    await cache.obterOuCarregar('b', 5000, async () => 2);
    await cache.obterOuCarregar('c', 5000, async () => 3);

    let recarregouA = false;
    await cache.obterOuCarregar('a', 5000, async () => {
      recarregouA = true;
      return 10;
    });
    expect(recarregouA).toBe(true);
  });

  test('DashboardService.getCompleto retorna resumo e todas as 5 séries em uma única consulta de fonte', async () => {
    corridasRepository.findAllParaDashboard.mockResolvedValue([
      {
        status: 'FINALIZADA',
        valor: 50,
        dataHorario: '2026-03-10T12:00:00.000Z',
        origemNome: 'Centro',
        destinoNome: 'UFES',
        veiculoId: 'v-1',
      },
      {
        status: 'CONFIRMADA',
        valor: 30,
        dataHorario: '2026-03-15T12:00:00.000Z',
        origemNome: 'Centro',
        destinoNome: 'Aeroporto',
        veiculoId: 'v-1',
      },
      {
        status: 'CANCELADA',
        valor: 20,
        dataHorario: '2026-03-16T12:00:00.000Z',
        origemNome: 'Praia',
        destinoNome: 'Centro',
        veiculoId: 'v-2',
      },
    ]);
    veiculosRepository.findAllParaDashboard.mockResolvedValue([
      { id: 'v-1', status: 'DISPONIVEL', marca: 'Toyota', modelo: 'Corolla' },
      { id: 'v-2', status: 'EM_CORRIDA', marca: 'Honda', modelo: 'Civic' },
    ]);

    const completo = await dashboardService.getCompleto();

    expect(corridasRepository.findAllParaDashboard).toHaveBeenCalledTimes(1);
    expect(veiculosRepository.findAllParaDashboard).toHaveBeenCalledTimes(1);
    expect(completo.resumo).toEqual({
      totalCorridas: 3,
      corridasAtivas: 1,
      faturamentoTotal: 80,
      veiculosDisponiveis: 1,
      totalVeiculos: 2,
    });
    expect(completo.faturamento).toHaveLength(12);
    expect(completo.corridas).toHaveLength(12);
    expect(completo.origens[0]).toEqual({ nome: 'Centro', quantidade: 2 });
    expect(completo.rotas).toHaveLength(2);
    expect(completo.veiculos[0]).toEqual({ nome: 'Toyota Corolla', quantidade: 2 });
  });

  test('NotificacoesService.obterResumo usa agregação leve do repositório e contarNaoLidas usa count', async () => {
    notificacoesRepository.obterResumoNaoLidas.mockResolvedValue({
      naoLidas: 3,
      porTipo: { NOVA_CORRIDA: 2, ATUALIZACAO_CORRIDA: 1 },
    });
    notificacoesRepository.contarNaoLidas.mockResolvedValue(3);

    const resumo = await notificacoesService.obterResumo('user-1');
    const total = await notificacoesService.contarNaoLidas('user-1');

    expect(resumo).toEqual({
      naoLidas: 3,
      porTipo: { NOVA_CORRIDA: 2, ATUALIZACAO_CORRIDA: 1 },
    });
    expect(total).toBe(3);
    expect(notificacoesRepository.findByDestinatario).not.toHaveBeenCalled();
    expect(notificacoesRepository.findNaoLidas).not.toHaveBeenCalled();
  });
});
