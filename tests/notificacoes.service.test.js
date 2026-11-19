'use strict';

jest.mock('../src/notificacoes/notificacoes.repository', () => ({
  findByDestinatario: jest.fn(),
  findById: jest.fn(),
  findNaoLidas: jest.fn(),
  create: jest.fn(),
  atualizarAcaoMotorista: jest.fn(),
  marcarLida: jest.fn(),
  marcarTodasLidas: jest.fn(),
  marcarLidaPorReferencia: jest.fn(),
}));

jest.mock('../src/corridas/corridas.repository', () => ({
  cancelarSolicitadasVencidas: jest.fn(),
  findConfirmadasComPrazoVencido: jest.fn(),
  findById: jest.fn(),
  transicionarComLiberacaoDeVeiculo: jest.fn(),
}));

const notificacoesRepository = require('../src/notificacoes/notificacoes.repository');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const {
  EstrategiaNotificacao,
  EstrategiaSolicitacaoAdmin,
  EstrategiaNovaCorrida,
  EstrategiaAtualizacaoCorrida,
  ESTRATEGIAS_NOTIFICACAO,
} = require('../src/notificacoes/estrategiasNotificacao');
const { despacharNotificacaoSemFalhar } = require('../src/notificacoes/despachoNotificacao');
const expiracaoCorridaService = require('../src/corridas/expiracaoCorrida.service');
const finalizacaoCorridaService = require('../src/corridas/finalizacaoCorrida.service');
const cancelamentoCorridaService = require('../src/corridas/cancelamentoCorrida.service');
const corridasRepository = require('../src/corridas/corridas.repository');

describe('Notificações — Estratégias polimórficas, NotificacoesService e despacho resiliente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    notificacoesRepository.create.mockImplementation(async (payload) => ({ id: 'n-1', ...payload }));
  });

  test('estratégias polimórficas constroem payloads corretos para cada tipo de evento', () => {
    expect(ESTRATEGIAS_NOTIFICACAO.NOVA_CORRIDA).toBeInstanceOf(EstrategiaNovaCorrida);
    expect(ESTRATEGIAS_NOTIFICACAO.SOLICITACAO_MOTORISTA).toBeInstanceOf(EstrategiaSolicitacaoAdmin);
    expect(ESTRATEGIAS_NOTIFICACAO.CORRIDA_ACEITA).toBeInstanceOf(EstrategiaAtualizacaoCorrida);

    const payloadNova = ESTRATEGIAS_NOTIFICACAO.NOVA_CORRIDA.construir('mot-1', {
      corridaId: 'c1',
      classe: 'NORMAL',
      origemNome: 'Origem',
      destinoNome: 'Destino',
      dataFormatada: '01/10/2026 14:00',
      distanciaKm: 12,
    });
    expect(payloadNova).toEqual({
      destinatarioId: 'mot-1',
      tipo: 'NOVA_CORRIDA',
      titulo: 'Nova corrida disponível',
      mensagem: expect.stringContaining('Distância: 12 km'),
      referenciaId: 'c1',
      acaoMotorista: 'PENDENTE',
    });

    const base = new EstrategiaNotificacao('SISTEMA');
    expect(() => base.construir('u1', {})).toThrow(/montarConteudo/);
  });

  test('NotificacoesService delega eventos às estratégias e persiste no repositório', async () => {
    await notificacoesService.notificarSolicitacaoMotorista('admin-1', {
      nomeMotorista: 'João',
      motoristaId: 'm1',
    });
    expect(notificacoesRepository.create).toHaveBeenCalledWith({
      destinatarioId: 'admin-1',
      tipo: 'SOLICITACAO_MOTORISTA',
      titulo: 'Nova solicitação de motorista',
      mensagem: 'João solicitou cadastro como motorista.',
      referenciaId: 'm1',
    });

    await notificacoesService.notificarPassageiroAceite('u1', {
      corridaId: 'c1',
      origemNome: 'A',
      destinoNome: 'B',
    });
    expect(notificacoesRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        destinatarioId: 'u1',
        tipo: 'ATUALIZACAO_CORRIDA',
        titulo: 'Sua corrida foi aceita!',
        referenciaId: 'c1',
      })
    );

    await expect(notificacoesService.emitirEvento('DESCONHECIDO', 'u1', {})).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  test('despacharNotificacaoSemFalhar captura erros sem propagar e retorna status booleano', async () => {
    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(despacharNotificacaoSemFalhar('Teste', 'ctx', async () => {})).resolves.toBe(true);
    await expect(
      despacharNotificacaoSemFalhar('Teste', 'ctx', async () => {
        throw new Error('falha smtp');
      })
    ).resolves.toBe(false);
    expect(spyErr).toHaveBeenCalledTimes(1);
    spyErr.mockRestore();
  });
});

describe('ExpiracaoCorridaService & FinalizacaoCorridaService — ciclo de vida e fluxos', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    expiracaoCorridaService.pararMonitoramentoExpiracao();
    process.env.NODE_ENV = originalEnv;
    jest.useRealTimers();
  });

  test('iniciarMonitoramentoExpiracao não duplica timers e pararMonitoramentoExpiracao encerra corretamente', () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'development';
    corridasRepository.cancelarSolicitadasVencidas.mockResolvedValue([]);
    corridasRepository.findConfirmadasComPrazoVencido.mockResolvedValue([]);

    expiracaoCorridaService.iniciarMonitoramentoExpiracao(10000);
    const timer1 = expiracaoCorridaService._expiracaoTimer;
    expect(timer1).not.toBeNull();
    expect(expiracaoCorridaService._monitoramentoAtivo).toBe(true);

    // Segunda chamada não substitui nem cria timer paralelo
    expiracaoCorridaService.iniciarMonitoramentoExpiracao(10000);
    expect(expiracaoCorridaService._expiracaoTimer).toBe(timer1);

    expiracaoCorridaService.pararMonitoramentoExpiracao();
    expect(expiracaoCorridaService._expiracaoTimer).toBeNull();
    expect(expiracaoCorridaService._monitoramentoAtivo).toBe(false);
  });

  test('FinalizacaoCorridaService.finalizar delega para confirmarPagamentoEFinalizar preservando regras e notificação', async () => {
    corridasRepository.findById.mockResolvedValue({
      id: 'c1',
      usuarioId: 'pass-1',
      motoristaId: 'mot-1',
      origemNome: 'A',
      destinoNome: 'B',
      status: 'EM_ANDAMENTO',
    });
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockResolvedValue({
      id: 'c1',
      status: 'FINALIZADA',
    });
    notificacoesRepository.create.mockResolvedValue({ id: 'n-fin' });

    const r = await finalizacaoCorridaService.finalizar('c1', { id: 'mot-1', perfil: 'MOTORISTA' });
    expect(r.status).toBe('FINALIZADA');
    expect(notificacoesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        destinatarioId: 'pass-1',
        tipo: 'ATUALIZACAO_CORRIDA',
        titulo: 'Corrida finalizada',
        referenciaId: 'c1',
      })
    );
  });

  test('FinalizacaoCorridaService e CancelamentoCorridaService validam estados e permissões usando Corrida', async () => {
    corridasRepository.findById.mockResolvedValueOnce({
      id: 'c-sol',
      usuarioId: 'pass-1',
      status: 'SOLICITADA',
    });
    await expect(
      finalizacaoCorridaService.confirmarPagamentoEFinalizar('c-sol', { id: 'admin-1', perfil: 'ADMINISTRADOR' })
    ).rejects.toMatchObject({ statusCode: 409 });

    corridasRepository.findById.mockResolvedValueOnce({
      id: 'c-and',
      usuarioId: 'pass-1',
      motoristaId: 'mot-1',
      origemNome: 'A',
      destinoNome: 'B',
      status: 'EM_ANDAMENTO',
      embarqueMotoristaConfirmado: true,
    });
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockResolvedValueOnce({
      id: 'c-and',
      status: 'CANCELADA',
      canceladoPor: 'SISTEMA',
    });

    const canceladaAdmin = await cancelamentoCorridaService.cancelar(
      'c-and',
      { id: 'admin-1', perfil: 'ADMINISTRADOR' },
      { motivo: 'Cancelamento administrativo' }
    );
    expect(canceladaAdmin.status).toBe('CANCELADA');
  });
});
