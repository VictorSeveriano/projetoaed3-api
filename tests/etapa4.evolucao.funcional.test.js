'use strict';
/**
 * tests/etapa4.evolucao.funcional.test.js — Suíte abrangente para Etapa 4:
 *  1. Indicadores centralizados de atraso, expiração automática e duração efetiva
 *  2. Linha do tempo cronológica, idempotência concorrente e compatibilidade com corridas pré-existentes
 *  3. Histórico detalhado, isolamento de permissões por perfil, paginação, ordenação e filtros combinados
 *  4. Relatórios exportáveis (CSV com BOM UTF-8 + escapamento; PDF 1.4 multipágina com grande volume)
 *  5. Resiliência de notificações (retry finito em erro transitório, deduplicação concorrente e permissão de destinatário)
 */

const {
  TOLERANCIA_ATRASO_MIN,
  foiExpiradaAutomaticamente,
  calcularDuracaoEfetivaMin,
  classificarPontualidadeCorrida,
} = require('../src/corridas/indicadorAtraso');
const {
  MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
  TIPO_EVENTO_CORRIDA,
} = require('../src/utils/constants');
const corridaEventosService = require('../src/corridas/corridaEventos.service');
const corridaEventosRepository = require('../src/corridas/corridaEventos.repository');
const historicoCorridasService = require('../src/corridas/historicoCorridas.service');
const relatorioCorridasService = require('../src/corridas/relatorioCorridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const motoristasRepository = require('../src/motoristas/motoristas.repository');
const {
  despacharNotificacaoSemFalhar,
  ehErroTransitorioNotificacao,
} = require('../src/notificacoes/despachoNotificacao');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const authRepository = require('../src/auth/auth.repository');
const auditoriaService = require('../src/auditoria/auditoria.service');
const prisma = require('../src/database/prisma');
const { readCache } = require('../src/utils/readCache');

jest.setTimeout(30000);

afterAll(async () => {
  await prisma.$disconnect();
});

// ============================================================================
// 1. INDICADORES DE PONTUALIDADE, ATRASO E EXPIRAÇÃO
// ============================================================================
describe('1. Indicadores de atraso, pontualidade, expiração e duração efetiva', () => {
  const baseHora = new Date('2026-11-25T15:00:00.000Z');
  const minOffset = (min) => new Date(baseHora.getTime() + min * 60000).toISOString();

  test('classifica corrida agendada para o futuro como NO_HORARIO', () => {
    const r = classificarPontualidadeCorrida(
      { status: 'SOLICITADA', dataHorario: minOffset(20) },
      baseHora
    );
    expect(r.codigo).toBe('NO_HORARIO');
    expect(r.rotulo).toBe('No horário');
    expect(r.atrasada).toBe(false);
    expect(r.expirada).toBe(false);
  });

  test('classifica corrida CONFIRMADA dentro da tolerância após horário agendado como AGUARDANDO_EMBARQUE', () => {
    const r = classificarPontualidadeCorrida(
      {
        status: 'CONFIRMADA',
        dataHorario: minOffset(-3),
        embarqueMotoristaConfirmado: null,
      },
      baseHora
    );
    expect(TOLERANCIA_ATRASO_MIN).toBe(5);
    expect(r.codigo).toBe('AGUARDANDO_EMBARQUE');
    expect(r.rotulo).toBe('Aguardando embarque');
    expect(r.atrasada).toBe(false);
    expect(r.minutosAtraso).toBe(3);
  });

  test('classifica corrida SOLICITADA ou CONFIRMADA sem embarque após a tolerância como EM_ATRASO', () => {
    const rConfirmada = classificarPontualidadeCorrida(
      {
        status: 'CONFIRMADA',
        dataHorario: minOffset(-12),
        embarqueMotoristaConfirmado: false,
      },
      baseHora
    );
    expect(rConfirmada.codigo).toBe('EM_ATRASO');
    expect(rConfirmada.rotulo).toBe('Em atraso');
    expect(rConfirmada.atrasada).toBe(true);
    expect(rConfirmada.expirada).toBe(false);
    expect(rConfirmada.minutosAtraso).toBe(12);

    const rSolicitada = classificarPontualidadeCorrida(
      { status: 'SOLICITADA', dataHorario: minOffset(-6) },
      baseHora
    );
    expect(rSolicitada.codigo).toBe('EM_ATRASO');
    expect(rSolicitada.atrasada).toBe(true);
    expect(rSolicitada.minutosAtraso).toBe(6);
  });

  test('NÃO marca corrida EM_ANDAMENTO como atrasada apenas por estar em execução', () => {
    const r = classificarPontualidadeCorrida(
      {
        status: 'EM_ANDAMENTO',
        dataHorario: minOffset(-40),
        embarqueMotoristaConfirmado: true,
        embarqueMotoristaEm: minOffset(-30),
      },
      baseHora
    );
    expect(r.codigo).toBe('EM_ANDAMENTO');
    expect(r.rotulo).toBe('Em andamento');
    expect(r.atrasada).toBe(false);
    expect(r.iniciouComAtraso).toBe(true);
    expect(r.atrasoInicioMinutos).toBe(10);
  });

  test('distingue corrida EXPIRADA automaticamente de corrida CANCELADA manualmente (inclusive por Admin)', () => {
    const expSemMotorista = {
      status: 'CANCELADA',
      canceladoPor: 'SISTEMA',
      motivoCancelamento: MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
    };
    const expSemEmbarque = {
      status: 'CANCELADA',
      canceladoPor: 'SISTEMA',
      motivoCancelamento: MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
    };
    const cancelAdminManual = {
      status: 'CANCELADA',
      canceladoPor: 'SISTEMA',
      motivoCancelamento: 'Cancelamento administrativo solicitado por telefone',
    };
    const cancelMotorista = {
      status: 'CANCELADA',
      canceladoPor: 'MOTORISTA',
      motivoCancelamento: 'Pneu furado a caminho',
    };

    expect(foiExpiradaAutomaticamente(expSemMotorista)).toBe(true);
    expect(foiExpiradaAutomaticamente(expSemEmbarque)).toBe(true);
    expect(foiExpiradaAutomaticamente(cancelAdminManual)).toBe(false);
    expect(foiExpiradaAutomaticamente(cancelMotorista)).toBe(false);

    const cExp = classificarPontualidadeCorrida(expSemMotorista, baseHora);
    expect(cExp.codigo).toBe('EXPIRADA');
    expect(cExp.rotulo).toBe('Expirada');
    expect(cExp.expirada).toBe(true);
    expect(cExp.atrasada).toBe(false);

    const cManual = classificarPontualidadeCorrida(cancelMotorista, baseHora);
    expect(cManual.codigo).toBe('CANCELADA');
    expect(cManual.rotulo).toBe('Cancelada');
    expect(cManual.expirada).toBe(false);
  });

  test('calcula duração efetiva somente quando embarqueMotoristaEm e finalizadaEm existem', () => {
    expect(calcularDuracaoEfetivaMin({ status: 'FINALIZADA', embarqueMotoristaEm: null, finalizadaEm: null })).toBeNull();
    expect(
      calcularDuracaoEfetivaMin({
        status: 'FINALIZADA',
        embarqueMotoristaEm: '2026-11-25T14:00:00.000Z',
        finalizadaEm: '2026-11-25T14:23:00.000Z',
      })
    ).toBe(23);
  });
});

// ============================================================================
// 2. LINHA DO TEMPO DA CORRIDA (ORDEM CRONOLÓGICA, NÃO INVENÇÃO E PERMISSÕES)
// ============================================================================
describe('2. Linha do tempo da corrida — eventos reais, ordem cronológica e autorização', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('constrói linha do tempo cronológica completa para todos os acontecimentos do ciclo de vida sem duplicar', () => {
    const corrida = {
      id: '11111111-1111-4111-8111-111111111111',
      usuarioId: '22222222-2222-4222-8222-222222222222',
      motoristaId: '33333333-3333-4333-8333-333333333333',
      origemNome: 'Shopping Vitória',
      destinoNome: 'UFES Goiabeiras',
      classe: 'NORMAL',
      formaPagamento: 'PIX',
      distanciaKm: 7.4,
      duracaoMin: 16,
      valor: 18.5,
      status: 'FINALIZADA',
      criadaEm: '2026-11-25T12:00:00.000Z',
      dataHorario: '2026-11-25T12:30:00.000Z',
      aceitaEm: '2026-11-25T12:05:00.000Z',
      motoristaACaminhoEm: '2026-11-25T12:31:00.000Z',
      embarqueMotoristaConfirmado: true,
      embarqueMotoristaEm: '2026-11-25T12:36:00.000Z',
      embarquePassageiroConfirmado: true,
      embarquePassageiroEm: '2026-11-25T12:37:00.000Z',
      finalizadaEm: '2026-11-25T12:55:00.000Z',
      passageiro: { id: 'p1', nome: 'Ana Passageira' },
      motorista: { id: 'm1', nome: 'Carlos Motorista' },
      veiculo: { marca: 'Toyota', modelo: 'Corolla', placa: 'UCL1A23' },
    };

    const eventosPersistidos = [
      {
        id: 'ev-fin',
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA,
        titulo: 'Pagamento confirmado e corrida finalizada',
        descricao: 'Viagem concluída.',
        criadoEm: '2026-11-25T12:55:00.000Z',
        autorId: corrida.motoristaId,
        autorPerfil: 'MOTORISTA',
        autorNome: 'Carlos Motorista',
      },
      {
        id: 'ev-sol',
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA,
        titulo: 'Corrida solicitada',
        descricao: 'Solicitação registrada.',
        criadoEm: '2026-11-25T12:00:00.000Z',
        autorId: corrida.usuarioId,
        autorPerfil: 'USUARIO',
        autorNome: 'Ana Passageira',
      },
    ];

    const timeline = corridaEventosService.construirLinhaDoTempo(corrida, eventosPersistidos);

    // Não duplica CORRIDA_SOLICITADA nem CORRIDA_FINALIZADA e ordena todos os marcos reais
    const tipos = timeline.map((e) => e.tipo);
    expect(tipos).toEqual([
      TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA,
      TIPO_EVENTO_CORRIDA.CORRIDA_ACEITA,
      TIPO_EVENTO_CORRIDA.MOTORISTA_A_CAMINHO,
      TIPO_EVENTO_CORRIDA.EMBARQUE_MOTORISTA_CONFIRMADO,
      TIPO_EVENTO_CORRIDA.EMBARQUE_PASSAGEIRO_CONFIRMADO,
      TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA,
    ]);
    expect(timeline[0].responsavel).toContain('Ana Passageira');
    expect(timeline[5].responsavel).toContain('Carlos Motorista');
  });

  test('NÃO inventa eventos para colunas de timestamp ausentes em corridas legadas e distingue expiração de cancelamento', () => {
    const corridaLegadaFinalizadaSemTimestamps = {
      id: '11111111-1111-4111-8111-111111111112',
      usuarioId: 'u1',
      origemNome: 'A',
      destinoNome: 'B',
      status: 'FINALIZADA',
      criadaEm: '2026-10-10T10:00:00.000Z',
      dataHorario: '2026-10-10T10:30:00.000Z',
      aceitaEm: null,
      finalizadaEm: null,
    };

    const tlLegada = corridaEventosService.construirLinhaDoTempo(corridaLegadaFinalizadaSemTimestamps, []);
    expect(tlLegada).toHaveLength(1);
    expect(tlLegada[0].tipo).toBe(TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA);

    const corridaExpirada = {
      id: '11111111-1111-4111-8111-111111111113',
      usuarioId: 'u1',
      origemNome: 'A',
      destinoNome: 'B',
      status: 'CANCELADA',
      criadaEm: '2026-10-10T10:00:00.000Z',
      dataHorario: '2026-10-10T10:30:00.000Z',
      canceladoPor: 'SISTEMA',
      motivoCancelamento: MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
      canceladaEm: '2026-10-10T10:30:01.000Z',
    };
    const tlExpirada = corridaEventosService.construirLinhaDoTempo(corridaExpirada, []);
    expect(tlExpirada.map((e) => e.tipo)).toEqual([
      TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA,
      TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA,
    ]);
  });

  test('obterDetalhesComLinhaDoTempo bloqueia acesso de passageiro ou motorista de terceiros (403) e permite dono e admin', async () => {
    const corridaMock = {
      id: '44444444-4444-4444-8444-444444444444',
      usuarioId: 'pass-dono',
      motoristaId: 'mot-dono',
      origemNome: 'Origem',
      destinoNome: 'Destino',
      status: 'CONFIRMADA',
      criadaEm: '2026-11-25T10:00:00.000Z',
      dataHorario: '2026-11-25T11:00:00.000Z',
    };

    jest.spyOn(corridasRepository, 'findDetalhadaById').mockResolvedValue(corridaMock);
    jest.spyOn(corridaEventosRepository, 'listarPorCorridaId').mockResolvedValue([]);

    await expect(
      corridaEventosService.obterDetalhesComLinhaDoTempo(corridaMock.id, {
        id: 'outro-passageiro',
        perfil: 'USUARIO',
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      corridaEventosService.obterDetalhesComLinhaDoTempo(corridaMock.id, {
        id: 'outro-motorista',
        perfil: 'MOTORISTA',
      })
    ).rejects.toMatchObject({ statusCode: 403 });

    const resDono = await corridaEventosService.obterDetalhesComLinhaDoTempo(corridaMock.id, {
      id: 'pass-dono',
      perfil: 'USUARIO',
    });
    expect(resDono.corrida.id).toBe(corridaMock.id);
    expect(resDono.eventos.length).toBeGreaterThanOrEqual(1);

    const resAdmin = await corridaEventosService.obterDetalhesComLinhaDoTempo(corridaMock.id, {
      id: 'admin-1',
      perfil: 'ADMINISTRADOR',
    });
    expect(resAdmin.corrida.id).toBe(corridaMock.id);
  });
});

// ============================================================================
// 3. HISTÓRICO, FILTROS AVANÇADOS, PERMISSÕES E ORDENAÇÃO/PAGINAÇÃO
// ============================================================================
describe('3. Histórico detalhado e filtros avançados — validação, combinação e permissões', () => {
  beforeEach(() => {
    readCache.limpar();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('valida e combina todos os filtros avançados, ignorando filtros de terceiros quando perfil é USUARIO ou MOTORISTA', () => {
    const admin = { id: '00000000-0000-0000-0000-000000000001', perfil: 'ADMINISTRADOR' };
    const fAdmin = historicoCorridasService.validarENormalizarFiltros(
      {
        escopo: 'historico',
        id: '#abc123',
        status: 'cancelada',
        dataInicio: '2026-11-01',
        dataFim: '2026-11-25',
        origem: 'UFES',
        destino: 'Aeroporto',
        motorista: 'Carlos',
        passageiro: 'Ana',
        veiculo: 'UCL1A23',
        canceladoPor: 'motorista',
        atrasadas: 'false',
        canceladas: 'true',
        expiradas: 'true',
        ordenarPor: 'valor',
        direcao: 'asc',
        page: '2',
        limit: '20',
      },
      admin
    );

    expect(fAdmin).toMatchObject({
      escopo: 'HISTORICO',
      id: '#abc123',
      status: 'CANCELADA',
      origem: 'UFES',
      destino: 'Aeroporto',
      motorista: 'Carlos',
      passageiro: 'Ana',
      veiculo: 'UCL1A23',
      canceladoPor: 'MOTORISTA',
      atrasadas: false,
      canceladas: true,
      expiradas: true,
      ordenarPor: 'valor',
      direcao: 'asc',
      page: 2,
      limit: 20,
    });
    expect(fAdmin.dataInicio).toBeInstanceOf(Date);
    expect(fAdmin.dataFim).toBeInstanceOf(Date);

    // Passageiro não consegue injetar filtro `passageiro` para vasculhar outros usuários
    const fPass = historicoCorridasService.validarENormalizarFiltros(
      { passageiro: 'Outro Passageiro', motorista: 'Carlos' },
      { id: 'pass-1', perfil: 'USUARIO' }
    );
    expect(fPass.usuarioLogadoId).toBe('pass-1');
    expect(fPass.passageiro).toBeNull();
    expect(fPass.motorista).toBe('Carlos');

    // Motorista não consegue injetar filtro `motorista` de outro condutor
    const fMot = historicoCorridasService.validarENormalizarFiltros(
      { motorista: 'Outro Motorista', passageiro: 'Ana' },
      { id: 'mot-1', perfil: 'MOTORISTA' }
    );
    expect(fMot.usuarioLogadoId).toBe('mot-1');
    expect(fMot.motorista).toBeNull();
    expect(fMot.passageiro).toBe('Ana');
  });

  test('rejeita filtros inválidos com status HTTP 400', () => {
    const user = { id: 'u1', perfil: 'ADMINISTRADOR' };
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ dataInicio: '2026-11-20', dataFim: '2026-11-10' }, user)
    ).toThrow(/período inicial/i);
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ status: 'INEXISTENTE' }, user)
    ).toThrow(/Status inválido/i);
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ escopo: 'INVALIDO' }, user)
    ).toThrow(/Escopo inválido/i);
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ page: '0' }, user)
    ).toThrow(/page/i);
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ limit: '999' }, user)
    ).toThrow(/limit/i);
    expect(() =>
      historicoCorridasService.validarENormalizarFiltros({ atrasadas: 'talvez' }, user)
    ).toThrow(/booleano inválido/i);
  });

  test('consultar aplica paginação, resumo e enriquece registros com pontualidade e duração efetiva', async () => {
    jest.spyOn(motoristasRepository, 'findByUsuarioId').mockResolvedValue({ id: 'm1', statusCadastro: 'APROVADO' });
    const spyRepo = jest.spyOn(corridasRepository, 'consultarComFiltros').mockResolvedValue({
      registros: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          usuarioId: 'pass-1',
          motoristaId: 'mot-1',
          origemNome: 'Jardim Camburi',
          destinoNome: 'Praia do Canto',
          distanciaKm: 6.2,
          duracaoMin: 14,
          valor: 15.5,
          status: 'FINALIZADA',
          dataHorario: '2026-11-20T14:00:00.000Z',
          embarqueMotoristaConfirmado: true,
          embarqueMotoristaEm: '2026-11-20T14:02:00.000Z',
          finalizadaEm: '2026-11-20T14:19:00.000Z',
          passageiro: { id: 'pass-1', nome: 'Mariana' },
          motorista: { id: 'mot-1', nome: 'Roberto' },
        },
      ],
      resumo: {
        total: 32,
        ativas: 0,
        finalizadas: 28,
        canceladas: 4,
        expiradas: 1,
        atrasadas: 0,
        valorTotalRegistrado: 640,
        valorTotalFinalizado: 580,
        distanciaTotalKm: 195.4,
      },
    });

    const resposta = await historicoCorridasService.consultar(
      { escopo: 'HISTORICO', page: 2, limit: 15 },
      { id: 'mot-1', perfil: 'MOTORISTA' }
    );

    expect(spyRepo).toHaveBeenCalledTimes(1);
    expect(resposta.meta).toMatchObject({
      total: 32,
      page: 2,
      limit: 15,
      totalPages: 3,
      escopo: 'HISTORICO',
    });
    expect(resposta.data[0].duracaoEfetivaMin).toBe(17);
    expect(resposta.data[0].pontualidade.codigo).toBe('FINALIZADA');
  });
});

// ============================================================================
// 4. EXPORTAÇÃO DE RELATÓRIOS (CSV UTF-8 BOM & PDF MULTIPÁGINA COM VOLUME)
// ============================================================================
describe('4. Relatórios exportáveis (CSV e PDF) — codificação, cabeçalhos, filtros e alto volume', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('exporta CSV com BOM UTF-8, acentuação, escapamento seguro e resumo consolidado', async () => {
    jest.spyOn(corridasRepository, 'consultarComFiltros').mockResolvedValue({
      registros: [
        {
          id: '66666666-6666-4666-8666-666666666666',
          usuarioId: 'pass-1',
          motoristaId: 'mot-1',
          origemNome: 'Estação Porto; Vitória, "Centro"',
          destinoNome: 'Conceição da Barra\nPraia',
          distanciaKm: 12.4,
          duracaoMin: 22,
          valor: 31.0,
          classe: 'PREMIUM',
          formaPagamento: 'PIX',
          status: 'CANCELADA',
          dataHorario: '2026-11-24T13:00:00.000Z',
          canceladoPor: 'MOTORISTA',
          canceladaEm: '2026-11-24T13:04:00.000Z',
          motivoCancelamento: 'Interdição na via; desvio obrigatório',
          passageiro: { id: 'pass-1', nome: 'João Conceição' },
          motorista: { id: 'mot-1', nome: 'Andréia Araújo' },
          veiculo: { marca: 'Honda', modelo: 'Civic', placa: 'BRA2E19' },
        },
      ],
      resumo: {
        total: 1,
        ativas: 0,
        finalizadas: 0,
        canceladas: 1,
        expiradas: 0,
        atrasadas: 0,
        valorTotalRegistrado: 31,
        valorTotalFinalizado: 0,
        distanciaTotalKm: 12.4,
      },
    });

    const arq = await relatorioCorridasService.exportar(
      { formato: 'csv', escopo: 'HISTORICO', canceladas: 'true' },
      { id: '00000000-0000-0000-0000-000000000001', perfil: 'ADMINISTRADOR', nome: 'Admin UCL' }
    );

    expect(arq.contentType).toContain('text/csv');
    expect(arq.filename).toMatch(/\.csv$/);

    const texto = arq.buffer.toString('utf8');
    // Verifica presença do BOM UTF-8 (\uFEFF)
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    expect(texto).toContain('ID da Corrida;Data/Hora Programada;Início Efetivo');
    expect(texto).toContain('João Conceição');
    expect(texto).toContain('Andréia Araújo');
    // Ponto-e-vírgula, vírgula e aspas devidamente escapados entre aspas duplas
    expect(texto).toContain('"Estação Porto; Vitória, ""Centro"""');
    expect(texto).toContain('"Interdição na via; desvio obrigatório"');
    expect(texto).toContain('RESUMO DO RELATÓRIO;VALOR');
    expect(texto).toContain('Corridas UCL');
  });

  test('exporta PDF multipágina válido (%PDF-1.4) com 150 registros sem corte nem erro', async () => {
    const lote150 = Array.from({ length: 150 }, (_, idx) => ({
      id: `77777777-7777-4777-8777-${String(idx + 1).padStart(12, '0')}`,
      usuarioId: 'pass-1',
      motoristaId: 'mot-1',
      origemNome: `Origem Acadêmica Nº ${idx + 1} - Vitória`,
      destinoNome: `Destino Tecnológico Nº ${idx + 1} - Serra`,
      distanciaKm: 10.5,
      duracaoMin: 20,
      valor: 26.25,
      classe: 'NORMAL',
      formaPagamento: 'CARTAO_CREDITO',
      status: idx % 5 === 0 ? 'CANCELADA' : 'FINALIZADA',
      dataHorario: new Date(Date.UTC(2026, 10, (idx % 25) + 1, 14, 0)).toISOString(),
      embarqueMotoristaConfirmado: idx % 5 !== 0,
      embarqueMotoristaEm: idx % 5 !== 0 ? new Date(Date.UTC(2026, 10, (idx % 25) + 1, 14, 2)).toISOString() : null,
      finalizadaEm: idx % 5 !== 0 ? new Date(Date.UTC(2026, 10, (idx % 25) + 1, 14, 21)).toISOString() : null,
      canceladoPor: idx % 5 === 0 ? 'SISTEMA' : null,
      canceladaEm: idx % 5 === 0 ? new Date(Date.UTC(2026, 10, (idx % 25) + 1, 14, 16)).toISOString() : null,
      motivoCancelamento: idx % 5 === 0 ? MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO : null,
      passageiro: { id: 'pass-1', nome: 'Passageiro Teste' },
      motorista: { id: 'mot-1', nome: 'Motorista Teste' },
      veiculo: { marca: 'Chevrolet', modelo: 'Onix', placa: 'XYZ9K88' },
    }));

    jest.spyOn(corridasRepository, 'consultarComFiltros').mockResolvedValue({
      registros: lote150,
      resumo: {
        total: 150,
        ativas: 0,
        finalizadas: 120,
        canceladas: 30,
        expiradas: 30,
        atrasadas: 0,
        valorTotalRegistrado: 3937.5,
        valorTotalFinalizado: 3150.0,
        distanciaTotalKm: 1575.0,
      },
    });

    const inicioMs = Date.now();
    const arq = await relatorioCorridasService.exportar(
      { formato: 'pdf', dataInicio: '2026-11-01', dataFim: '2026-11-30' },
      { id: 'pass-1', perfil: 'USUARIO', nome: 'Passageiro Teste' }
    );
    const duracaoGeracaoMs = Date.now() - inicioMs;

    expect(arq.contentType).toBe('application/pdf');
    expect(arq.filename).toMatch(/\.pdf$/);
    expect(duracaoGeracaoMs).toBeLessThan(1500);

    const rawPdf = arq.buffer.toString('latin1');
    expect(rawPdf.startsWith('%PDF-1.4')).toBe(true);
    expect(rawPdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(rawPdf).toContain('Corridas UCL');
    // 150 registros devem ser paginados em múltiplas páginas (/Count > 3)
    const matchCount = rawPdf.match(/\/Type \/Pages \/Kids \[[^\]]+\] \/Count (\d+)/);
    expect(matchCount).not.toBeNull();
    expect(Number(matchCount[1])).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// 5. MELHORIAS NO PROCESSAMENTO DE NOTIFICAÇÕES (RETRY, DEDUP, CONCORRÊNCIA, PERMISSÃO)
// ============================================================================
describe('5. Confiabilidade de notificações — retry controlado, concorrência e permissão', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('despacharNotificacaoSemFalhar reexecuta falha transitória e obtém sucesso sem falhar fluxo', async () => {
    let tentativas = 0;
    const ok = await despacharNotificacaoSemFalhar(
      'TesteRetry',
      'envio com falha transitoria P1001',
      async () => {
        tentativas++;
        if (tentativas < 3) {
          const err = new Error("Can't reach database server");
          err.code = 'P1001';
          throw err;
        }
        return { id: 'notif-ok' };
      },
      { maxTentativas: 3, atrasoBaseMs: 2 }
    );

    expect(ok).toBe(true);
    expect(tentativas).toBe(3);
  });

  test('despacharNotificacaoSemFalhar encerra de forma finita quando todas as tentativas transitórias falham e não repete erro 4xx', async () => {
    const spyErr = jest.spyOn(console, 'error').mockImplementation(() => {});

    let chamadasTransitorias = 0;
    const resFalha = await despacharNotificacaoSemFalhar(
      'TesteRetryLimite',
      'timeout persistente',
      async () => {
        chamadasTransitorias++;
        const err = new Error('Timed out fetching a new connection from the connection pool');
        err.code = 'P2024';
        throw err;
      },
      { maxTentativas: 3, atrasoBaseMs: 1 }
    );
    expect(resFalha).toBe(false);
    expect(chamadasTransitorias).toBe(3);

    let chamadas4xx = 0;
    const res4xx = await despacharNotificacaoSemFalhar(
      'Teste4xx',
      'validacao',
      async () => {
        chamadas4xx++;
        const err = new Error('Dados inválidos');
        err.statusCode = 400;
        throw err;
      },
      { maxTentativas: 3, atrasoBaseMs: 1 }
    );
    expect(res4xx).toBe(false);
    expect(chamadas4xx).toBe(1);
    expect(ehErroTransitorioNotificacao({ code: 'P1001' })).toBe(true);
    expect(ehErroTransitorioNotificacao({ statusCode: 403, message: 'Proibido' })).toBe(false);

    spyErr.mockRestore();
  });

  test('NotificacoesRepository.create valida perfil do destinatário e evita duplicações sob concorrência', async () => {
    const notificacoesRepoReal = require('../src/notificacoes/notificacoes.repository');
    const spyWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const uPassageiroId = '88888888-8888-4888-8888-888888888881';
    const uMotoristaId = '88888888-8888-4888-8888-888888888882';
    const corridaRefId = '99999999-9999-4999-8999-999999999999';

    jest.spyOn(prisma.usuario, 'findUnique').mockImplementation(async ({ where }) => {
      if (where.id === uPassageiroId) return { id: uPassageiroId, perfil: 'USUARIO' };
      if (where.id === uMotoristaId) return { id: uMotoristaId, perfil: 'MOTORISTA' };
      return null;
    });

    const spyFindFirst = jest.spyOn(prisma.notificacao, 'findFirst').mockResolvedValue(null);
    let contadorInsert = 0;
    const spyCreate = jest.spyOn(prisma.notificacao, 'create').mockImplementation(async ({ data }) => {
      contadorInsert++;
      await new Promise((r) => setTimeout(r, 15));
      return { id: `notif-${contadorInsert}`, ...data };
    });

    // 1. Bloqueia envio de NOVA_CORRIDA para USUARIO (não motorista)
    const bloqueada = await notificacoesRepoReal.create({
      destinatarioId: uPassageiroId,
      tipo: 'NOVA_CORRIDA',
      titulo: 'Nova corrida disponível',
      mensagem: 'Teste',
      referenciaId: corridaRefId,
    });
    expect(bloqueada).toBeNull();
    expect(spyCreate).not.toHaveBeenCalled();

    // 2. Coalesce 5 disparos concorrentes idênticos para o mesmo motorista/corrida em 1 único INSERT
    const promessas = Array.from({ length: 5 }, () =>
      notificacoesRepoReal.create({
        destinatarioId: uMotoristaId,
        tipo: 'NOVA_CORRIDA',
        titulo: 'Nova corrida disponível',
        mensagem: 'Origem -> Destino',
        referenciaId: corridaRefId,
        acaoMotorista: 'PENDENTE',
      })
    );
    const resultados = await Promise.all(promessas);
    expect(spyCreate).toHaveBeenCalledTimes(1);
    expect(new Set(resultados.map((r) => r.id)).size).toBe(1);

    // 3. Deduplicação por banco quando já existe notificação idêntica recente
    spyFindFirst.mockResolvedValueOnce({ id: 'notif-ja-existe', destinatarioId: uMotoristaId });
    const dedupBanco = await notificacoesRepoReal.create({
      destinatarioId: uMotoristaId,
      tipo: 'ATUALIZACAO_CORRIDA',
      titulo: 'Embarque confirmado',
      mensagem: 'Boa viagem',
      referenciaId: corridaRefId,
    });
    expect(dedupBanco.id).toBe('notif-ja-existe');
    expect(spyCreate).toHaveBeenCalledTimes(1);

    spyWarn.mockRestore();
  });
});

// ============================================================================
// 6. INTEGRAÇÃO HTTP + POSTGRESQL: ENDPOINTS E CONSULTA PAGINADA NO BANCO
// ============================================================================
describe('6. Integração PostgreSQL e Rotas HTTP — histórico, linha do tempo e exportação', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('consulta paginada real no PostgreSQL executa sem erro e respeita isolamento por perfil', async () => {
    const fakePassageiroId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const resultado = await corridasRepository.consultarComFiltros({
      usuarioLogadoId: fakePassageiroId,
      perfil: 'USUARIO',
      escopo: 'HISTORICO',
      page: 1,
      limit: 10,
      ordenarPor: 'dataHorario',
      direcao: 'desc',
    });

    expect(Array.isArray(resultado.registros)).toBe(true);
    expect(resultado.resumo).toMatchObject({
      total: 0,
      finalizadas: 0,
      canceladas: 0,
      expiradas: 0,
      atrasadas: 0,
    });
  });

  test('endpoints HTTP /historico, /exportar e /:id/linha-do-tempo exigem autenticação e respeitam permissões', async () => {
    const secret = process.env.JWT_SECRET || 'secret-test';
    process.env.JWT_SECRET = secret;
    const uPass1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    const uPass2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
    const corridaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

    const tokenPass1 = jwt.sign({ sub: uPass1, perfil: 'USUARIO' }, secret, { expiresIn: '1h' });
    const tokenPass2 = jwt.sign({ sub: uPass2, perfil: 'USUARIO' }, secret, { expiresIn: '1h' });

    jest.spyOn(authRepository, 'encontrarPorId').mockImplementation(async (id) => {
      if (id === uPass1) return { id: uPass1, nome: 'Pass 1', perfil: 'USUARIO' };
      if (id === uPass2) return { id: uPass2, nome: 'Pass 2', perfil: 'USUARIO' };
      return null;
    });
    jest.spyOn(auditoriaService, 'registrar').mockResolvedValue(null);

    // 1. Sem token -> 401
    const semToken = await request(app).get('/api/corridas/historico');
    expect(semToken.statusCode).toBe(401);

    // 2. GET /api/corridas/historico autenticado -> 200 com data + meta
    const resHist = await request(app)
      .get('/api/corridas/historico?escopo=HISTORICO&page=1&limit=10')
      .set('x-auth-token', tokenPass1);
    expect(resHist.statusCode).toBe(200);
    expect(resHist.body.success).toBe(true);
    expect(Array.isArray(resHist.body.data)).toBe(true);
    expect(resHist.body.meta).toHaveProperty('resumo');

    // 3. GET /api/corridas/exportar?formato=csv -> 200 attachment CSV
    const resCsv = await request(app)
      .get('/api/corridas/exportar?formato=csv&escopo=HISTORICO')
      .set('x-auth-token', tokenPass1);
    expect(resCsv.statusCode).toBe(200);
    expect(resCsv.headers['content-type']).toContain('text/csv');
    expect(resCsv.headers['content-disposition']).toContain('attachment;');

    // 4. GET /api/corridas/:id/linha-do-tempo -> 403 para passageiro terceiro e 200 para titular
    jest.spyOn(corridasRepository, 'findDetalhadaById').mockResolvedValue({
      id: corridaId,
      usuarioId: uPass1,
      motoristaId: null,
      origemNome: 'UFES',
      destinoNome: 'Centro',
      status: 'SOLICITADA',
      criadaEm: '2026-11-25T12:00:00.000Z',
      dataHorario: '2026-11-25T13:00:00.000Z',
    });
    jest.spyOn(corridaEventosRepository, 'listarPorCorridaId').mockResolvedValue([]);

    const resProibido = await request(app)
      .get(`/api/corridas/${corridaId}/linha-do-tempo`)
      .set('x-auth-token', tokenPass2);
    expect(resProibido.statusCode).toBe(403);

    const resPermitido = await request(app)
      .get(`/api/corridas/${corridaId}/linha-do-tempo`)
      .set('x-auth-token', tokenPass1);
    expect(resPermitido.statusCode).toBe(200);
    expect(resPermitido.body.data.corrida.id).toBe(corridaId);
    expect(resPermitido.body.data.eventos.length).toBeGreaterThanOrEqual(1);
  });
});
