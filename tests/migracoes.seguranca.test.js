'use strict';
/**
 * tests/migracoes.seguranca.test.js — Testes de segurança, atomicidade, determinismo,
 * auditoria, imutabilidade de histórico e idempotência das migrações SQL (Cenários A a G).
 *
 * Executa cada cenário em um schema PostgreSQL isolado (test_mig_<sufixo>), sem alterar
 * nem depender dos dados do schema public.
 */

const {
  diagnosticarConflitosVeiculoAtivo,
  sanearConflitosVeiculoAtivo,
} = require('../src/database/saneamentoCorridasAtivas');
const {
  MIGRACOES_BASE,
  MIGRACAO_INDICES_CONSTRAINTS,
  MIGRACAO_CORRETIVA,
  INDICES_ESPERADOS,
  CONSTRAINTS_ESPERADAS,
  criarAmbienteIsolado,
  semearBaseDadosValidos,
} = require('./helpers/isolatedSchema');

jest.setTimeout(180000);

describe('Segurança, Consistência e Histórico das Migrações SQL (Cenários A a G)', () => {
  test('Cenário A — Banco vazio: aplica toda a cadeia de migrações e cria todos os índices e restrições sem erros', async () => {
    const env = await criarAmbienteIsolado('cenario_a');
    try {
      const aplicadas = await env.aplicarMigracoesPendentes();
      expect(aplicadas).toEqual([
        ...MIGRACOES_BASE,
        MIGRACAO_INDICES_CONSTRAINTS,
        MIGRACAO_CORRETIVA,
      ]);

      const indices = await env.listarIndicesCriados();
      expect(indices).toEqual([...INDICES_ESPERADOS].sort());

      const constraints = await env.listarConstraintsCriadas();
      expect(constraints).toEqual([...CONSTRAINTS_ESPERADAS].sort());

      const historico = await env.client.$queryRawUnsafe(
        `SELECT "migration_name", "applied_steps_count" FROM "${env.schemaName}"."_prisma_migrations" ORDER BY "started_at" ASC`
      );
      expect(historico).toHaveLength(6);
      expect(historico.every((h) => h.applied_steps_count === 1)).toBe(true);
    } finally {
      await env.destruir();
    }
  });

  test('Cenário B — Banco com dados válidos: preserva integralmente os dados existentes e sincroniza veículos ativos', async () => {
    const env = await criarAmbienteIsolado('cenario_b');
    try {
      await env.aplicarMigracoesBase();
      const { endOrigem, endDestino, passageiro, mot1User, mot2User, v1, v2 } =
        await semearBaseDadosValidos(env.client);

      const corridaEmAndamento = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'UFES',
          destinoNome: 'Centro',
          distanciaKm: 8.5,
          duracaoMin: 18,
          valor: 21.25,
          dataHorario: new Date('2026-10-01T14:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      const corridaConfirmada = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot2User.id,
          veiculoId: v2.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Jardim da Penha',
          destinoNome: 'Praia do Canto',
          distanciaKm: 5.0,
          duracaoMin: 12,
          valor: 10.0,
          dataHorario: new Date('2026-10-01T15:00:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'BASICO',
          formaPagamento: 'CARTAO_CREDITO',
        },
      });

      const corridaFinalizada = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Aeroporto',
          destinoNome: 'UFES',
          distanciaKm: 6.0,
          duracaoMin: 14,
          valor: 15.0,
          dataHorario: new Date('2026-10-01T10:00:00.000Z'),
          status: 'FINALIZADA',
          classe: 'NORMAL',
          formaPagamento: 'DINHEIRO',
        },
      });

      await env.aplicarMigracaoNoSchema(MIGRACAO_INDICES_CONSTRAINTS);
      await env.aplicarMigracaoNoSchema(MIGRACAO_CORRETIVA);

      const c1Depois = await env.client.corrida.findUnique({ where: { id: corridaEmAndamento.id } });
      const c2Depois = await env.client.corrida.findUnique({ where: { id: corridaConfirmada.id } });
      const c3Depois = await env.client.corrida.findUnique({ where: { id: corridaFinalizada.id } });
      expect(c1Depois).toMatchObject({ status: 'EM_ANDAMENTO', veiculoId: v1.id, motoristaId: mot1User.id });
      expect(c2Depois).toMatchObject({ status: 'CONFIRMADA', veiculoId: v2.id, motoristaId: mot2User.id });
      expect(c3Depois).toMatchObject({ status: 'FINALIZADA', veiculoId: v1.id, motoristaId: mot1User.id });

      const v1Depois = await env.client.veiculo.findUnique({ where: { id: v1.id } });
      const v2Depois = await env.client.veiculo.findUnique({ where: { id: v2.id } });
      expect(v1Depois.status).toBe('EM_CORRIDA');
      expect(v2Depois.status).toBe('EM_CORRIDA');

      const auditoriasSaneamento = await env.client.auditoria.count({
        where: { acao: 'SANEAMENTO_CONFLITO_VEICULO_ATIVO' },
      });
      expect(auditoriasSaneamento).toBe(0);

      expect(await env.listarIndicesCriados()).toEqual([...INDICES_ESPERADOS].sort());
      expect(await env.listarConstraintsCriadas()).toEqual([...CONSTRAINTS_ESPERADAS].sort());
    } finally {
      await env.destruir();
    }
  });

  test('Cenário C — Corridas CONFIRMADA com conflito determinístico: retorna excedentes para SOLICITADA e registra auditoria completa', async () => {
    const env = await criarAmbienteIsolado('cenario_c');
    try {
      await env.aplicarMigracoesBase();
      const { endOrigem, endDestino, passageiro, mot1User, mot2User, v1, v2 } =
        await semearBaseDadosValidos(env.client);

      const titularV1 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Titular V1',
          destinoNome: 'Destino V1',
          distanciaKm: 10,
          duracaoMin: 20,
          valor: 25,
          dataHorario: new Date('2026-10-01T12:00:00.000Z'),
          criadaEm: new Date('2026-10-01T12:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      const excedenteV1 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Excedente Confirmada V1',
          destinoNome: 'Destino V1',
          distanciaKm: 7,
          duracaoMin: 15,
          valor: 17.5,
          dataHorario: new Date('2026-10-01T12:05:00.000Z'),
          criadaEm: new Date('2026-10-01T12:05:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      const titularV2 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot2User.id,
          veiculoId: v2.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Titular Confirmada V2',
          destinoNome: 'Destino V2',
          distanciaKm: 6,
          duracaoMin: 12,
          valor: 12,
          dataHorario: new Date('2026-10-01T13:00:00.000Z'),
          criadaEm: new Date('2026-10-01T13:00:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'BASICO',
          formaPagamento: 'DINHEIRO',
        },
      });
      const excedenteV2 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot2User.id,
          veiculoId: v2.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Excedente Confirmada V2',
          destinoNome: 'Destino V2',
          distanciaKm: 8,
          duracaoMin: 16,
          valor: 16,
          dataHorario: new Date('2026-10-01T13:10:00.000Z'),
          criadaEm: new Date('2026-10-01T13:10:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'BASICO',
          formaPagamento: 'DINHEIRO',
        },
      });

      const naoRelacionada = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Corrida Histórica',
          destinoNome: 'Destino Histórico',
          distanciaKm: 5,
          duracaoMin: 10,
          valor: 12.5,
          dataHorario: new Date('2026-10-01T09:00:00.000Z'),
          criadaEm: new Date('2026-10-01T09:00:00.000Z'),
          status: 'FINALIZADA',
          classe: 'NORMAL',
          formaPagamento: 'CARTAO_DEBITO',
        },
      });

      await env.aplicarMigracaoNoSchema(MIGRACAO_INDICES_CONSTRAINTS);
      await env.aplicarMigracaoNoSchema(MIGRACAO_CORRETIVA);

      const t1 = await env.client.corrida.findUnique({ where: { id: titularV1.id } });
      const e1 = await env.client.corrida.findUnique({ where: { id: excedenteV1.id } });
      const t2 = await env.client.corrida.findUnique({ where: { id: titularV2.id } });
      const e2 = await env.client.corrida.findUnique({ where: { id: excedenteV2.id } });
      const nr = await env.client.corrida.findUnique({ where: { id: naoRelacionada.id } });

      expect(t1).toMatchObject({ status: 'EM_ANDAMENTO', veiculoId: v1.id, motoristaId: mot1User.id });
      expect(e1).toMatchObject({ status: 'SOLICITADA', veiculoId: null, motoristaId: null });
      expect(t2).toMatchObject({ status: 'CONFIRMADA', veiculoId: v2.id, motoristaId: mot2User.id });
      expect(e2).toMatchObject({ status: 'SOLICITADA', veiculoId: null, motoristaId: null });
      expect(nr).toMatchObject({ status: 'FINALIZADA', veiculoId: v1.id, motoristaId: mot1User.id });

      const auditorias = await env.client.auditoria.findMany({
        where: { acao: 'SANEAMENTO_CONFLITO_VEICULO_ATIVO' },
        orderBy: { criadoEm: 'asc' },
      });
      expect(auditorias).toHaveLength(2);

      const audE1 = auditorias.find((a) => a.entidadeId === excedenteV1.id);
      const audE2 = auditorias.find((a) => a.entidadeId === excedenteV2.id);
      expect(audE1).toBeDefined();
      expect(audE1.resultado).toBe('SUCESSO');
      expect(audE1.dadosAnteriores).toMatchObject({
        status: 'CONFIRMADA',
        veiculoId: v1.id,
        motoristaId: mot1User.id,
        corridaTitularId: titularV1.id,
        corridaTitularStatus: 'EM_ANDAMENTO',
      });
      expect(audE1.dadosNovos).toMatchObject({
        status: 'SOLICITADA',
        veiculoId: null,
        motoristaId: null,
      });
      expect(audE1.dadosNovos.atualizadaEm).toBeTruthy();

      expect(audE2).toBeDefined();
      expect(audE2.dadosAnteriores).toMatchObject({
        status: 'CONFIRMADA',
        veiculoId: v2.id,
        motoristaId: mot2User.id,
        corridaTitularId: titularV2.id,
        corridaTitularStatus: 'CONFIRMADA',
      });
      expect(audE2.dadosNovos.atualizadaEm).toBeTruthy();
    } finally {
      await env.destruir();
    }
  });

  test('Cenário D — Corridas EM_ANDAMENTO com conflito ambíguo (e CONFIRMADA empatadas): interrompe sem alterações parciais', async () => {
    const env = await criarAmbienteIsolado('cenario_d');
    try {
      await env.aplicarMigracoesBase();
      const { endOrigem, endDestino, passageiro, mot1User, mot2User, v1, v2 } =
        await semearBaseDadosValidos(env.client);

      const titularV1 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Titular V1',
          destinoNome: 'Destino V1',
          distanciaKm: 5,
          duracaoMin: 10,
          valor: 12.5,
          dataHorario: new Date('2026-10-01T10:00:00.000Z'),
          criadaEm: new Date('2026-10-01T10:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      const confirmadaV1 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Confirmada V1',
          destinoNome: 'Destino V1',
          distanciaKm: 6,
          duracaoMin: 12,
          valor: 15,
          dataHorario: new Date('2026-10-01T10:05:00.000Z'),
          criadaEm: new Date('2026-10-01T10:05:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      const emAndamento1 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot2User.id,
          veiculoId: v2.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Em Andamento 1 V2',
          destinoNome: 'Destino V2',
          distanciaKm: 8,
          duracaoMin: 16,
          valor: 16,
          dataHorario: new Date('2026-10-01T11:00:00.000Z'),
          criadaEm: new Date('2026-10-01T11:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'BASICO',
          formaPagamento: 'DINHEIRO',
        },
      });
      const emAndamento2 = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot2User.id,
          veiculoId: v2.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Em Andamento 2 V2',
          destinoNome: 'Destino V2',
          distanciaKm: 9,
          duracaoMin: 18,
          valor: 18,
          dataHorario: new Date('2026-10-01T11:05:00.000Z'),
          criadaEm: new Date('2026-10-01T11:05:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'BASICO',
          formaPagamento: 'DINHEIRO',
        },
      });

      await expect(env.aplicarMigracaoNoSchema(MIGRACAO_INDICES_CONSTRAINTS)).rejects.toThrow(
        /conflito ambíguo.*saneamentoCorridasAtivas\.js/i
      );

      const cConfirmadaV1Banco = await env.client.corrida.findUnique({ where: { id: confirmadaV1.id } });
      const cEmAndamento1Banco = await env.client.corrida.findUnique({ where: { id: emAndamento1.id } });
      const cEmAndamento2Banco = await env.client.corrida.findUnique({ where: { id: emAndamento2.id } });
      expect(cConfirmadaV1Banco.status).toBe('CONFIRMADA');
      expect(cConfirmadaV1Banco.veiculoId).toBe(v1.id);
      expect(cEmAndamento1Banco.status).toBe('EM_ANDAMENTO');
      expect(cEmAndamento2Banco.status).toBe('EM_ANDAMENTO');
      expect(await env.client.auditoria.count()).toBe(0);
      expect(await env.listarIndicesCriados()).toHaveLength(0);
      expect(await env.listarConstraintsCriadas()).toHaveLength(0);

      await env.client.corrida.deleteMany({ where: { id: { in: [titularV1.id, confirmadaV1.id, emAndamento1.id, emAndamento2.id] } } });
      const instanteEmpate = new Date('2026-10-01T16:00:00.000Z');
      await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Empate Confirmada A',
          destinoNome: 'Destino',
          distanciaKm: 5,
          duracaoMin: 10,
          valor: 12.5,
          dataHorario: instanteEmpate,
          criadaEm: instanteEmpate,
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Empate Confirmada B',
          destinoNome: 'Destino',
          distanciaKm: 5,
          duracaoMin: 10,
          valor: 12.5,
          dataHorario: instanteEmpate,
          criadaEm: instanteEmpate,
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      await expect(env.aplicarMigracaoNoSchema(MIGRACAO_INDICES_CONSTRAINTS)).rejects.toThrow(
        /conflito ambíguo/i
      );
      expect(await env.client.corrida.count({ where: { status: 'CONFIRMADA' } })).toBe(2);
    } finally {
      await env.destruir();
    }
  });

  test('Cenário E — Falha durante a migração, rollback completo e nova tentativa segura após resolução do problema', async () => {
    const env = await criarAmbienteIsolado('cenario_e');
    try {
      await env.aplicarMigracoesBase();
      const { endOrigem, endDestino, passageiro, mot1User, v1, v2 } =
        await semearBaseDadosValidos(env.client);

      await env.client.veiculo.update({
        where: { id: v2.id },
        data: { porte: 'Pequeno', classe: 'PREMIUM' },
      });

      await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Titular V1',
          destinoNome: 'Destino V1',
          distanciaKm: 10,
          duracaoMin: 20,
          valor: 25,
          dataHorario: new Date('2026-10-01T12:00:00.000Z'),
          criadaEm: new Date('2026-10-01T12:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      const excedenteConfirmada = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Excedente V1',
          destinoNome: 'Destino V1',
          distanciaKm: 7,
          duracaoMin: 14,
          valor: 17.5,
          dataHorario: new Date('2026-10-01T12:05:00.000Z'),
          criadaEm: new Date('2026-10-01T12:05:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      const excedenteEmAndamento = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Excedente EM_ANDAMENTO V1',
          destinoNome: 'Destino V1',
          distanciaKm: 8,
          duracaoMin: 16,
          valor: 20,
          dataHorario: new Date('2026-10-01T12:10:00.000Z'),
          criadaEm: new Date('2026-10-01T12:10:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      await expect(env.aplicarMigracoesPendentes()).rejects.toThrow(/conflito ambíguo/i);

      await sanearConflitosVeiculoAtivo(env.client, {
        perfil: 'ADMINISTRADOR',
        resolucoesExplicitas: {
          [excedenteEmAndamento.id]: {
            acao: 'DESVINCULAR_PARA_SOLICITADA',
            justificativa: 'Resolução explícita de corrida duplicada antes da migração.',
          },
        },
      });

      await env.client.corrida.update({
        where: { id: excedenteConfirmada.id },
        data: { status: 'CONFIRMADA', veiculoId: v1.id, motoristaId: mot1User.id },
      });
      const auditoriasAntesFalhaVeiculo = await env.client.auditoria.count();

      await expect(env.aplicarMigracoesPendentes()).rejects.toThrow(/veículo\(s\) com dados incompatíveis/i);

      const cAposRollback = await env.client.corrida.findUnique({ where: { id: excedenteConfirmada.id } });
      expect(cAposRollback.status).toBe('CONFIRMADA');
      expect(await env.client.auditoria.count()).toBe(auditoriasAntesFalhaVeiculo);
      expect(await env.listarIndicesCriados()).toHaveLength(0);
      expect(await env.listarConstraintsCriadas()).toHaveLength(0);

      await env.client.veiculo.update({
        where: { id: v2.id },
        data: { porte: 'Pequeno', classe: 'BASICO' },
      });

      const recemAplicadas = await env.aplicarMigracoesPendentes();
      expect(recemAplicadas).toEqual([MIGRACAO_INDICES_CONSTRAINTS, MIGRACAO_CORRETIVA]);

      const cPosSucesso = await env.client.corrida.findUnique({ where: { id: excedenteConfirmada.id } });
      expect(cPosSucesso).toMatchObject({ status: 'SOLICITADA', veiculoId: null, motoristaId: null });
      expect(await env.listarIndicesCriados()).toEqual([...INDICES_ESPERADOS].sort());
      expect(await env.listarConstraintsCriadas()).toEqual([...CONSTRAINTS_ESPERADAS].sort());
    } finally {
      await env.destruir();
    }
  });

  test('Cenário F — Migração já aplicada: preserva histórico imutável e aplica apenas a migração corretiva', async () => {
    const env = await criarAmbienteIsolado('cenario_f');
    try {
      await env.aplicarMigracoesBase();
      await env.aplicarMigracaoNoSchema(MIGRACAO_INDICES_CONSTRAINTS);

      const { endOrigem, endDestino, passageiro } = await semearBaseDadosValidos(env.client);
      const corridaSaneadaAntes = await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Origem F',
          destinoNome: 'Destino F',
          distanciaKm: 10,
          duracaoMin: 20,
          valor: 25,
          dataHorario: new Date('2026-10-01T14:00:00.000Z'),
          status: 'SOLICITADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      const audIncompleta = await env.client.auditoria.create({
        data: {
          perfil: 'SISTEMA',
          acao: 'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
          modulo: 'CORRIDAS',
          entidade: 'Corrida',
          entidadeId: corridaSaneadaAntes.id,
          descricao: 'Saneamento anterior sem atualizadaEm em dados_novos.',
          dadosAnteriores: { status: 'CONFIRMADA' },
          dadosNovos: { status: 'SOLICITADA', motoristaId: null, veiculoId: null },
          resultado: 'SUCESSO',
        },
      });
      const audPendenteResolvida = await env.client.auditoria.create({
        data: {
          perfil: 'SISTEMA',
          acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
          modulo: 'CORRIDAS',
          entidade: 'Corrida',
          entidadeId: corridaSaneadaAntes.id,
          descricao: 'Conflito anterior já desfeito.',
          resultado: 'PENDENTE',
        },
      });

      const historicoAntes = await env.client.$queryRawUnsafe(
        `SELECT "id", "migration_name", "checksum", "finished_at" FROM "${env.schemaName}"."_prisma_migrations" ORDER BY "started_at" ASC`
      );
      expect(historicoAntes).toHaveLength(5);

      const aplicadasAgora = await env.aplicarMigracoesPendentes();
      expect(aplicadasAgora).toEqual([MIGRACAO_CORRETIVA]);

      const historicoDepois = await env.client.$queryRawUnsafe(
        `SELECT "id", "migration_name", "checksum", "finished_at" FROM "${env.schemaName}"."_prisma_migrations" ORDER BY "started_at" ASC`
      );
      expect(historicoDepois).toHaveLength(6);
      expect(historicoDepois.slice(0, 5)).toEqual(historicoAntes);

      const audIncompletaDepois = await env.client.auditoria.findUnique({ where: { id: audIncompleta.id } });
      const audPendenteDepois = await env.client.auditoria.findUnique({ where: { id: audPendenteResolvida.id } });
      expect(audIncompletaDepois.dadosNovos.atualizadaEm).toBeTruthy();
      expect(audPendenteDepois.resultado).toBe('RESOLVIDO');
    } finally {
      await env.destruir();
    }
  });

  test('Cenário G — Reexecução e idempotência de rotinas de diagnóstico, saneamento e migração corretiva', async () => {
    const env = await criarAmbienteIsolado('cenario_g');
    try {
      await env.aplicarMigracoesBase();
      const { endOrigem, endDestino, passageiro, mot1User, v1 } =
        await semearBaseDadosValidos(env.client);

      await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Titular G',
          destinoNome: 'Destino G',
          distanciaKm: 10,
          duracaoMin: 20,
          valor: 25,
          dataHorario: new Date('2026-10-01T12:00:00.000Z'),
          criadaEm: new Date('2026-10-01T12:00:00.000Z'),
          status: 'EM_ANDAMENTO',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });
      await env.client.corrida.create({
        data: {
          usuarioId: passageiro.id,
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemEnderecoId: endOrigem.id,
          destinoEnderecoId: endDestino.id,
          origemNome: 'Excedente G',
          destinoNome: 'Destino G',
          distanciaKm: 6,
          duracaoMin: 12,
          valor: 15,
          dataHorario: new Date('2026-10-01T12:05:00.000Z'),
          criadaEm: new Date('2026-10-01T12:05:00.000Z'),
          status: 'CONFIRMADA',
          classe: 'NORMAL',
          formaPagamento: 'PIX',
        },
      });

      await env.aplicarMigracoesPendentes();

      const totalAuditoriaPosMigracao = await env.client.auditoria.count();
      expect(totalAuditoriaPosMigracao).toBe(1);

      const novasMigracoes = await env.aplicarMigracoesPendentes();
      expect(novasMigracoes).toEqual([]);

      const diag1 = await diagnosticarConflitosVeiculoAtivo(env.client);
      expect(diag1.possuiConflitos).toBe(false);

      const san1 = await sanearConflitosVeiculoAtivo(env.client);
      expect(san1.saneadas).toHaveLength(0);
      expect(san1.naoResolvidos).toHaveLength(0);
      expect(san1.prontoParaIndiceUnico).toBe(true);

      const san2 = await sanearConflitosVeiculoAtivo(env.client);
      expect(san2.saneadas).toHaveLength(0);
      expect(await env.client.auditoria.count()).toBe(totalAuditoriaPosMigracao);
    } finally {
      await env.destruir();
    }
  });
});
