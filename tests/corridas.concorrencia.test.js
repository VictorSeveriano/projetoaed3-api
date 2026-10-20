/**
 * corridas.concorrencia.test.js — Testes de integração de concorrência, transações,
 * consistência de estados e constraints diretamente no PostgreSQL via Prisma Client real.
 */

const prisma = require('../src/database/prisma');
const corridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const veiculosService = require('../src/veiculos/veiculos.service');
const notificacoesService = require('../src/notificacoes/notificacoes.service');

jest.setTimeout(30000);

const resultados = (settled) => ({
  ok: settled.filter((r) => r.status === 'fulfilled'),
  falhas: settled.filter((r) => r.status === 'rejected'),
});

describe('Concorrência, Transações e Integridade no Banco de Dados (Prisma + PostgreSQL)', () => {
  const sufixo = Date.now().toString().slice(-6);
  let passageiro;
  let mot1User;
  let mot2User;
  let mot1Record;
  let mot2Record;
  let v1;
  let v2;
  let origemEnd;
  let destinoEnd;

  const criarCorridaNoBanco = async (overrides = {}) => {
    return prisma.corrida.create({
      data: {
        usuarioId: passageiro.id,
        motoristaId: overrides.motoristaId ?? null,
        veiculoId: overrides.veiculoId ?? null,
        origemEnderecoId: origemEnd.id,
        destinoEnderecoId: destinoEnd.id,
        origemNome: overrides.origemNome || 'Origem Teste Concorrência',
        destinoNome: overrides.destinoNome || 'Destino Teste Concorrência',
        origemLat: overrides.origemLat !== undefined ? overrides.origemLat : 0,
        origemLng: overrides.origemLng !== undefined ? overrides.origemLng : 0,
        destinoLat: overrides.destinoLat !== undefined ? overrides.destinoLat : -20.3155,
        destinoLng: overrides.destinoLng !== undefined ? overrides.destinoLng : -40.3128,
        distanciaKm: overrides.distanciaKm || 10,
        duracaoMin: overrides.duracaoMin !== undefined ? overrides.duracaoMin : 20,
        valor: overrides.valor || 25,
        classe: overrides.classe || 'NORMAL',
        formaPagamento: overrides.formaPagamento || 'PIX',
        dataHorario: overrides.dataHorario || new Date('2026-10-01T14:00:00.000Z'),
        status: overrides.status || 'SOLICITADA',
      },
    });
  };

  const limparCorridasENotificacoesTeste = async () => {
    const userIds = [passageiro?.id, mot1User?.id, mot2User?.id].filter(Boolean);
    const ops = [];
    if (userIds.length > 0) {
      ops.push(
        prisma.notificacao.deleteMany({
          where: { destinatarioId: { in: userIds } },
        }),
        prisma.corrida.deleteMany({
          where: {
            OR: [
              { usuarioId: { in: userIds } },
              { motoristaId: { in: userIds } },
            ],
          },
        })
      );
    }
    if (v1?.id && v2?.id) {
      ops.push(
        prisma.veiculo.updateMany({
          where: { id: { in: [v1.id, v2.id] } },
          data: {
            porte: 'Medio',
            classe: 'NORMAL',
            statusAprovacao: 'APROVADO',
            status: 'DISPONIVEL',
          },
        })
      );
    }
    await Promise.all(ops);
  };

  beforeAll(async () => {
    origemEnd = await prisma.endereco.create({
      data: { logradouro: 'Rua Origem Concorrencia', cidade: 'Vitória', uf: 'ES', latitude: 0, longitude: 0 },
    });
    destinoEnd = await prisma.endereco.create({
      data: { logradouro: 'Rua Destino Concorrencia', cidade: 'Vila Velha', uf: 'ES', latitude: -20.32, longitude: -40.32 },
    });

    passageiro = await prisma.usuario.create({
      data: {
        nome: 'Passageiro Concorrencia',
        cpf: `91${sufixo}001`.slice(0, 11),
        celular: '27999990001',
        email: `pass.conc.${sufixo}@teste.com`,
        usuario: `passconc${sufixo}`,
        senha: 'hash_password',
        perfil: 'USUARIO',
      },
    });

    mot1User = await prisma.usuario.create({
      data: {
        nome: 'Motorista Conc 1',
        cpf: `92${sufixo}002`.slice(0, 11),
        celular: '27999990002',
        email: `mot1.conc.${sufixo}@teste.com`,
        usuario: `mot1conc${sufixo}`,
        senha: 'hash_password',
        perfil: 'MOTORISTA',
      },
    });

    mot2User = await prisma.usuario.create({
      data: {
        nome: 'Motorista Conc 2',
        cpf: `93${sufixo}003`.slice(0, 11),
        celular: '27999990003',
        email: `mot2.conc.${sufixo}@teste.com`,
        usuario: `mot2conc${sufixo}`,
        senha: 'hash_password',
        perfil: 'MOTORISTA',
      },
    });

    mot1Record = await prisma.motorista.create({
      data: {
        usuarioId: mot1User.id,
        cnh: `CNH1${sufixo}`,
        statusCadastro: 'APROVADO',
        statusPresenca: 'ONLINE',
      },
    });

    mot2Record = await prisma.motorista.create({
      data: {
        usuarioId: mot2User.id,
        cnh: `CNH2${sufixo}`,
        statusCadastro: 'APROVADO',
        statusPresenca: 'ONLINE',
      },
    });

    v1 = await prisma.veiculo.create({
      data: {
        motoristaId: mot1User.id,
        marca: 'Toyota',
        modelo: 'Corolla',
        ano: 2024,
        placa: `CNC${sufixo.slice(0, 4)}`,
        cor: 'Prata',
        porte: 'Medio',
        classe: 'NORMAL',
        statusAprovacao: 'APROVADO',
        status: 'DISPONIVEL',
        documentacaoRegularizada: true,
      },
    });

    v2 = await prisma.veiculo.create({
      data: {
        motoristaId: mot2User.id,
        marca: 'Honda',
        modelo: 'Civic',
        ano: 2024,
        placa: `CND${sufixo.slice(0, 4)}`,
        cor: 'Preto',
        porte: 'Medio',
        classe: 'NORMAL',
        statusAprovacao: 'APROVADO',
        status: 'DISPONIVEL',
        documentacaoRegularizada: true,
      },
    });
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await limparCorridasENotificacoesTeste();
  });

  afterAll(async () => {
    await limparCorridasENotificacoesTeste();
    if (v1?.id || v2?.id) {
      await prisma.veiculo.deleteMany({ where: { id: { in: [v1?.id, v2?.id].filter(Boolean) } } });
    }
    if (mot1Record?.id || mot2Record?.id) {
      await prisma.motorista.deleteMany({ where: { id: { in: [mot1Record?.id, mot2Record?.id].filter(Boolean) } } });
    }
    const userIds = [passageiro?.id, mot1User?.id, mot2User?.id].filter(Boolean);
    if (userIds.length > 0) {
      await prisma.usuario.deleteMany({ where: { id: { in: userIds } } });
    }
    const endIds = [origemEnd?.id, destinoEnd?.id].filter(Boolean);
    if (endIds.length > 0) {
      await prisma.endereco.deleteMany({ where: { id: { in: endIds } } });
    }
    await prisma.$disconnect();
  });

  describe('Aceitação concorrente e reserva atômica de veículo no PostgreSQL', () => {
    test('mesmo veículo × duas corridas concorrentes: só uma reserva vence e o banco real fica consistente', async () => {
      const c1 = await criarCorridaNoBanco();
      const c2 = await criarCorridaNoBanco();

      const { ok, falhas } = resultados(await Promise.allSettled([
        corridasService.aceitar(c1.id, mot1User.id),
        corridasService.aceitar(c2.id, mot1User.id),
      ]));

      expect(ok).toHaveLength(1);
      expect(falhas).toHaveLength(1);
      expect(falhas[0].reason).toMatchObject({ statusCode: 409 });

      const corridasBanco = await prisma.corrida.findMany({
        where: { id: { in: [c1.id, c2.id] } },
      });
      const confirmadas = corridasBanco.filter((x) => x.status === 'CONFIRMADA');
      const solicitadas = corridasBanco.filter((x) => x.status === 'SOLICITADA');
      expect(confirmadas).toHaveLength(1);
      expect(solicitadas).toHaveLength(1);
      expect(confirmadas[0]).toMatchObject({ veiculoId: v1.id, motoristaId: mot1User.id });
      expect(solicitadas[0]).toMatchObject({ veiculoId: null, motoristaId: null });

      const veiculoBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(veiculoBanco.status).toBe('EM_CORRIDA');
    });

    test('mesma corrida × dois motoristas concorrentes: apenas um vence e o veículo do perdedor sofre rollback para DISPONIVEL', async () => {
      const c1 = await criarCorridaNoBanco();

      const { ok, falhas } = resultados(await Promise.allSettled([
        corridasService.aceitar(c1.id, mot1User.id),
        corridasService.aceitar(c1.id, mot2User.id),
      ]));

      expect(ok).toHaveLength(1);
      expect(falhas).toHaveLength(1);
      expect(falhas[0].reason).toMatchObject({ statusCode: 409 });

      const corridaBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      expect(corridaBanco.status).toBe('CONFIRMADA');
      const vencedorId = corridaBanco.motoristaId;
      expect([mot1User.id, mot2User.id]).toContain(vencedorId);

      const veiculoVencedorId = vencedorId === mot1User.id ? v1.id : v2.id;
      const veiculoPerdedorId = vencedorId === mot1User.id ? v2.id : v1.id;

      expect(corridaBanco.veiculoId).toBe(veiculoVencedorId);

      const vVencedor = await prisma.veiculo.findUnique({ where: { id: veiculoVencedorId } });
      const vPerdedor = await prisma.veiculo.findUnique({ where: { id: veiculoPerdedorId } });
      expect(vVencedor.status).toBe('EM_CORRIDA');
      expect(vPerdedor.status).toBe('DISPONIVEL');
    });

    test('falha intermediária dentro da transação reverte a reserva do veículo (rollback real no PostgreSQL)', async () => {
      const c1 = await criarCorridaNoBanco();

      // Força falha após reservar o veículo dentro de uma transação real do Prisma
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.veiculo.update({
            where: { id: v1.id },
            data: { status: 'EM_CORRIDA' },
          });
          throw new Error('Falha intermediária simulada na transação');
        })
      ).rejects.toThrow('Falha intermediária simulada na transação');

      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      const cBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      expect(vBanco.status).toBe('DISPONIVEL');
      expect(cBanco.status).toBe('SOLICITADA');
    });

    test('falha de notificação após o aceite NÃO reverte a corrida confirmada no banco e registra erro em log', async () => {
      const c1 = await criarCorridaNoBanco();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const spyNotif = jest
        .spyOn(notificacoesService, 'notificarPassageiroAceite')
        .mockRejectedValueOnce(new Error('Falha de envio de notificação'));

      const resultado = await corridasService.aceitar(c1.id, mot1User.id);
      expect(resultado.status).toBe('CONFIRMADA');

      const cBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(cBanco.status).toBe('CONFIRMADA');
      expect(vBanco.status).toBe('EM_CORRIDA');
      expect(errorSpy).toHaveBeenCalled();

      spyNotif.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe('Cancelamento, finalização e liberação atômica do veículo no PostgreSQL', () => {
    const admin = { id: 'admin-id', perfil: 'ADMINISTRADOR' };

    test('cancelar corrida CONFIRMADA libera o veículo (EM_CORRIDA -> DISPONIVEL) atomicamente no banco', async () => {
      await prisma.veiculo.update({ where: { id: v1.id }, data: { status: 'EM_CORRIDA' } });
      const c1 = await criarCorridaNoBanco({
        status: 'CONFIRMADA',
        veiculoId: v1.id,
        motoristaId: mot1User.id,
      });

      const r = await corridasService.cancelar(c1.id, admin);
      expect(r.status).toBe('CANCELADA');

      const cBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(cBanco.status).toBe('CANCELADA');
      expect(vBanco.status).toBe('DISPONIVEL');
    });

    test('finalizar corrida libera o veículo (EM_CORRIDA -> DISPONIVEL) atomicamente no banco', async () => {
      await prisma.veiculo.update({ where: { id: v1.id }, data: { status: 'EM_CORRIDA' } });
      const c1 = await criarCorridaNoBanco({
        status: 'EM_ANDAMENTO',
        veiculoId: v1.id,
        motoristaId: mot1User.id,
      });

      const r = await corridasService.confirmarPagamentoEFinalizar(c1.id, {
        id: mot1User.id,
        perfil: 'MOTORISTA',
      });
      expect(r.status).toBe('FINALIZADA');

      const cBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(cBanco.status).toBe('FINALIZADA');
      expect(vBanco.status).toBe('DISPONIVEL');
    });

    test('cancelar × finalizar simultâneos na mesma corrida: apenas uma transição vence e veículo termina DISPONIVEL', async () => {
      await prisma.veiculo.update({ where: { id: v1.id }, data: { status: 'EM_CORRIDA' } });
      const c1 = await criarCorridaNoBanco({
        status: 'CONFIRMADA',
        veiculoId: v1.id,
        motoristaId: mot1User.id,
      });

      const { ok, falhas } = resultados(await Promise.allSettled([
        corridasService.cancelar(c1.id, admin),
        corridasService.confirmarPagamentoEFinalizar(c1.id, admin),
      ]));

      expect(ok).toHaveLength(1);
      expect(falhas).toHaveLength(1);
      expect(falhas[0].reason).toMatchObject({ statusCode: 409 });

      const cBanco = await prisma.corrida.findUnique({ where: { id: c1.id } });
      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(['CANCELADA', 'FINALIZADA']).toContain(cBanco.status);
      expect(vBanco.status).toBe('DISPONIVEL');
    });

    test('transições inválidas: corrida FINALIZADA ou CANCELADA não pode ser cancelada ou finalizada novamente (409)', async () => {
      const cFinalizada = await criarCorridaNoBanco({ status: 'FINALIZADA' });
      const cCancelada = await criarCorridaNoBanco({ status: 'CANCELADA' });

      await expect(corridasService.cancelar(cFinalizada.id, admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(corridasService.confirmarPagamentoEFinalizar(cFinalizada.id, admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(corridasService.cancelar(cCancelada.id, admin)).rejects.toMatchObject({ statusCode: 409 });
      await expect(corridasService.confirmarPagamentoEFinalizar(cCancelada.id, admin)).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('Constraints de integridade e coordenadas zero diretamente no PostgreSQL', () => {
    test('índice único parcial uq_corridas_veiculo_ativo impede duas corridas ativas para o mesmo veículo direto no banco', async () => {
      await criarCorridaNoBanco({
        status: 'CONFIRMADA',
        veiculoId: v1.id,
        motoristaId: mot1User.id,
      });

      await expect(
        criarCorridaNoBanco({
          status: 'EM_ANDAMENTO',
          veiculoId: v1.id,
          motoristaId: mot1User.id,
        })
      ).rejects.toThrow();
    });

    test('check constraint ck_veiculos_porte_classe impede combinação incoerente de porte e classe direto no banco', async () => {
      await expect(
        prisma.veiculo.update({
          where: { id: v1.id },
          data: { porte: 'Pequeno', classe: 'PREMIUM' },
        })
      ).rejects.toThrow();

      const vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(vBanco).toMatchObject({ porte: 'Medio', classe: 'NORMAL' });
    });

    test('alteração de porte pelo ADMINISTRADOR atualiza porte e classe no banco, e MOTORISTA é bloqueado (403)', async () => {
      await expect(
        veiculosService.atualizar(v1.id, { porte: 'Grande' }, { id: mot1User.id, perfil: 'MOTORISTA' })
      ).rejects.toMatchObject({ statusCode: 403 });

      let vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(vBanco).toMatchObject({ porte: 'Medio', classe: 'NORMAL' });

      await veiculosService.atualizar(v1.id, { porte: 'Grande' }, { id: 'admin-1', perfil: 'ADMINISTRADOR' });
      vBanco = await prisma.veiculo.findUnique({ where: { id: v1.id } });
      expect(vBanco).toMatchObject({ porte: 'Grande', classe: 'PREMIUM' });
    });

    test('persistência e leitura no PostgreSQL preservam coordenadas 0 (origemLat = 0, origemLng = 0)', async () => {
      const criada = await corridasRepository.create({
        usuarioId: passageiro.id,
        origemNome: 'Linha do Equador / Meridiano de Greenwich',
        destinoNome: 'UFES',
        origemLat: 0,
        origemLng: 0,
        destinoLat: -20.2769,
        destinoLng: -40.3061,
        distanciaKm: 15,
        duracaoMin: 30,
        valor: 37.5,
        classe: 'NORMAL',
        formaPagamento: 'PIX',
        dataHorario: '2026-10-01T14:00:00.000Z',
      });

      expect(criada.origemLat).toBe(0);
      expect(criada.origemLng).toBe(0);

      const lida = await corridasRepository.findById(criada.id);
      expect(lida.origemLat).toBe(0);
      expect(lida.origemLng).toBe(0);
    });

    test('saneamento auditável de conflitos de veículo ativo nunca converte corrida em FINALIZADA/CANCELADA e registra auditoria', async () => {
      const {
        diagnosticarConflitosVeiculoAtivo,
        sanearConflitosVeiculoAtivo,
      } = require('../src/database/saneamentoCorridasAtivas');

      // Simula cenário pré-migração (sem o índice parcial) com duas corridas ativas no mesmo veículo
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "uq_corridas_veiculo_ativo"');
      let idsCriados = [];
      try {
        const titular = await criarCorridaNoBanco({
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemNome: `Saneamento_Titular_${sufixo}`,
          status: 'EM_ANDAMENTO',
        });
        const excedenteConfirmada = await criarCorridaNoBanco({
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemNome: `Saneamento_Excedente_Confirmada_${sufixo}`,
          status: 'CONFIRMADA',
        });
        const excedenteEmAndamento = await criarCorridaNoBanco({
          motoristaId: mot1User.id,
          veiculoId: v1.id,
          origemNome: `Saneamento_Excedente_EmAndamento_${sufixo}`,
          status: 'EM_ANDAMENTO',
        });
        idsCriados = [titular.id, excedenteConfirmada.id, excedenteEmAndamento.id];

        await prisma.corrida.update({
          where: { id: titular.id },
          data: { criadaEm: new Date('2026-10-01T13:00:00.000Z') },
        });
        await prisma.corrida.update({
          where: { id: excedenteConfirmada.id },
          data: { criadaEm: new Date('2026-10-01T13:05:00.000Z') },
        });
        await prisma.corrida.update({
          where: { id: excedenteEmAndamento.id },
          data: { criadaEm: new Date('2026-10-01T13:10:00.000Z') },
        });

        const diag = await diagnosticarConflitosVeiculoAtivo(prisma);
        const conflitoV1 = diag.conflitos.find((c) => c.veiculoId === v1.id);
        expect(conflitoV1).toBeDefined();
        expect(conflitoV1.corridaTitular.id).toBe(titular.id);
        expect(conflitoV1.corridasExcedentes.map((e) => e.id)).toEqual([
          excedenteEmAndamento.id,
          excedenteConfirmada.id,
        ]);

        // 1ª execução sem resolução explícita: CONFIRMADA volta para SOLICITADA; EM_ANDAMENTO ambígua NÃO é alterada
        const resParcial = await sanearConflitosVeiculoAtivo(prisma, { perfil: 'SISTEMA' });
        expect(resParcial.prontoParaIndiceUnico).toBe(false);
        expect(resParcial.naoResolvidos.map((n) => n.corridaId)).toContain(excedenteEmAndamento.id);

        const aposParcialConfirmada = await prisma.corrida.findUnique({ where: { id: excedenteConfirmada.id } });
        const aposParcialEmAndamento = await prisma.corrida.findUnique({ where: { id: excedenteEmAndamento.id } });
        expect(aposParcialConfirmada).toMatchObject({
          status: 'SOLICITADA',
          veiculoId: null,
          motoristaId: null,
        });
        expect(aposParcialEmAndamento.status).toBe('EM_ANDAMENTO');
        expect(aposParcialConfirmada.status).not.toBe('FINALIZADA');
        expect(aposParcialEmAndamento.status).not.toBe('FINALIZADA');

        // 2ª execução com resolução explícita de realocação para v2 (disponível)
        const resFinal = await sanearConflitosVeiculoAtivo(prisma, {
          perfil: 'ADMINISTRADOR',
          resolucoesExplicitas: {
            [excedenteEmAndamento.id]: {
              acao: 'REALOCAR_VEICULO',
              veiculoId: v2.id,
              motoristaId: mot2User.id,
              justificativa: 'Realocação auditada de corrida em andamento para veículo v2.',
            },
          },
        });
        expect(resFinal.prontoParaIndiceUnico).toBe(true);

        const aposRealocacao = await prisma.corrida.findUnique({ where: { id: excedenteEmAndamento.id } });
        expect(aposRealocacao).toMatchObject({
          status: 'EM_ANDAMENTO',
          veiculoId: v2.id,
          motoristaId: mot2User.id,
        });

        const logsAuditoria = await prisma.auditoria.findMany({
          where: { entidadeId: { in: [excedenteConfirmada.id, excedenteEmAndamento.id] } },
        });
        expect(logsAuditoria.length).toBeGreaterThanOrEqual(3);

        await prisma.auditoria.deleteMany({
          where: { entidadeId: { in: [excedenteConfirmada.id, excedenteEmAndamento.id] } },
        });
      } finally {
        if (idsCriados.length > 0) {
          await prisma.corrida.deleteMany({
            where: { id: { in: idsCriados } },
          });
        }
        await prisma.$executeRawUnsafe(
          'CREATE UNIQUE INDEX IF NOT EXISTS "uq_corridas_veiculo_ativo" ON "corridas"("veiculo_id") WHERE "status" IN (\'CONFIRMADA\', \'EM_ANDAMENTO\') AND "veiculo_id" IS NOT NULL'
        );
      }
    });
  });
});
