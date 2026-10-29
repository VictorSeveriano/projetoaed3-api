/**
 * confirmacao-embarque.test.js — Suíte completa de testes para:
 * - Confirmação de embarque (motorista e passageiro)
 * - Motorista atrasado ("Estou a caminho" com notificação e extensão única de prazo)
 * - Cancelamento de corridas pelo motorista (motivo obrigatório + notificação ao passageiro)
 * - Cancelamento de corridas pelo passageiro (notificação ao motorista + motivo opcional)
 * - Cancelamento automático por ausência de confirmação
 * - Autorização, concorrência/idempotência e resiliência a falhas de notificação
 */
const Corrida = require('../src/corridas/Corrida');
const corridasService = require('../src/corridas/corridas.service');
const corridasRepository = require('../src/corridas/corridas.repository');
const notificacoesService = require('../src/notificacoes/notificacoes.service');
const {
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
  EXTENSAO_A_CAMINHO_MIN,
  TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN,
} = require('../src/utils/constants');

jest.mock('../src/corridas/corridas.repository');
jest.mock('../src/veiculos/veiculos.repository');
jest.mock('../src/motoristas/motoristas.repository');
jest.mock('../src/notificacoes/notificacoes.service');

const MOT = { id: 'mot-1', perfil: 'MOTORISTA' };
const PASS = { id: 'pass-1', perfil: 'USUARIO' };
const minutos = (n) => new Date(Date.now() + n * 60000).toISOString();

const corridaBase = (extra = {}) => ({
  id: 'c1',
  usuarioId: 'pass-1',
  motoristaId: 'mot-1',
  veiculoId: 'v-1',
  status: 'CONFIRMADA',
  origemNome: 'Terminal Laranjeiras',
  destinoNome: 'UFES Goiabeiras',
  dataHorario: minutos(-2),
  embarqueMotoristaConfirmado: null,
  embarqueMotoristaEm: null,
  embarquePassageiroConfirmado: null,
  embarquePassageiroEm: null,
  situacaoMotorista: null,
  motoristaACaminhoEm: null,
  prazoConfirmacaoEm: null,
  motivoCancelamento: null,
  canceladoPor: null,
  canceladaEm: null,
  ...extra,
});

beforeEach(() => {
  jest.resetAllMocks();
  notificacoesService.notificarAtualizacaoCorrida.mockResolvedValue({});
  notificacoesService.notificarPassageiroFinalizacao.mockResolvedValue({});
});

describe('1–5. Confirmação de embarque (motorista e passageiro) e independência dos registros', () => {
  test('1 e 3. Permite confirmação pelo motorista a partir do horário programado, transita para EM_ANDAMENTO e persiste timestamp', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.confirmarEmbarqueMotorista.mockImplementation(async (id, motId, agora) =>
      corridaBase({
        status: 'EM_ANDAMENTO',
        embarqueMotoristaConfirmado: true,
        embarqueMotoristaEm: agora.toISOString(),
        situacaoMotorista: 'EMBARCADO',
      })
    );

    const r = await corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'CONFIRMAR_EMBARQUE' });
    expect(r.status).toBe('EM_ANDAMENTO');
    expect(r.embarqueMotoristaConfirmado).toBe(true);
    expect(r.embarqueMotoristaEm).toBeTruthy();
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledWith(
      'pass-1',
      expect.objectContaining({ corridaId: 'c1', titulo: 'Embarque confirmado' })
    );
  });

  test('2. Bloqueia confirmação do motorista e do passageiro antes do horário programado (400)', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase({ dataHorario: minutos(30) }));
    await expect(
      corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      corridasService.registrarEmbarquePassageiro('c1', PASS, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('4. Permite confirmação de embarque pelo passageiro e notifica o motorista', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.registrarEmbarquePassageiro.mockImplementation(async (id, passId, embarcou, agora) =>
      corridaBase({
        embarquePassageiroConfirmado: embarcou,
        embarquePassageiroEm: agora.toISOString(),
      })
    );

    const r = await corridasService.registrarEmbarquePassageiro('c1', PASS, { acao: 'CONFIRMAR_EMBARQUE' });
    expect(r.embarquePassageiroConfirmado).toBe(true);
    expect(r.embarquePassageiroEm).toBeTruthy();
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledWith(
      'mot-1',
      expect.objectContaining({ corridaId: 'c1', titulo: 'Embarque confirmado pelo passageiro' })
    );
  });

  test('5. Persistência independente: confirmação do passageiro não sobrescreve a do motorista e vice-versa', async () => {
    const estadoAposMotorista = corridaBase({
      status: 'EM_ANDAMENTO',
      embarqueMotoristaConfirmado: true,
      embarqueMotoristaEm: '2026-10-29T13:00:00.000Z',
      situacaoMotorista: 'EMBARCADO',
    });
    corridasRepository.findById.mockResolvedValue(estadoAposMotorista);
    corridasRepository.registrarEmbarquePassageiro.mockImplementation(async (id, passId, embarcou, agora) => ({
      ...estadoAposMotorista,
      embarquePassageiroConfirmado: embarcou,
      embarquePassageiroEm: agora.toISOString(),
    }));

    const r = await corridasService.registrarEmbarquePassageiro('c1', PASS, { acao: 'CONFIRMAR_EMBARQUE' });
    expect(corridasRepository.confirmarEmbarqueMotorista).not.toHaveBeenCalled();
    expect(r.embarqueMotoristaConfirmado).toBe(true);
    expect(r.embarqueMotoristaEm).toBe('2026-10-29T13:00:00.000Z');
    expect(r.embarquePassageiroConfirmado).toBe(true);
    expect(r.embarquePassageiroEm).toBeTruthy();

    const entidade = new Corrida(r);
    expect(entidade.toResumo()).toMatchObject({
      embarqueMotoristaConfirmado: true,
      embarquePassageiroConfirmado: true,
      situacaoMotorista: 'EMBARCADO',
    });
  });
});

describe('6–8. Motorista atrasado ("Estou a caminho") e "Não vou embarcar"', () => {
  test('6. Fluxo "Estou a caminho": registra situação, estende prazo 1x e envia notificação persistente ao passageiro', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.registrarMotoristaACaminho.mockImplementation(async (id, u, prazo) =>
      corridaBase({ situacaoMotorista: 'A_CAMINHO', prazoConfirmacaoEm: prazo.toISOString() })
    );

    const r = await corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'ESTOU_A_CAMINHO' });
    const prazo = corridasRepository.registrarMotoristaACaminho.mock.calls[0][2];
    expect(prazo.getTime()).toBeGreaterThan(Date.now() + (EXTENSAO_A_CAMINHO_MIN - 1) * 60000);
    expect(r.situacaoMotorista).toBe('A_CAMINHO');
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledWith(
      'pass-1',
      expect.objectContaining({
        corridaId: 'c1',
        titulo: 'Motorista a caminho',
        mensagem: expect.stringContaining('Acompanhe as atualizações na área Minhas corridas'),
      })
    );

    // Repetição idempotente: não estende o prazo novamente nem reenvia notificação
    corridasRepository.findById.mockResolvedValue(corridaBase({ situacaoMotorista: 'A_CAMINHO' }));
    await corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'ESTOU_A_CAMINHO' });
    expect(corridasRepository.registrarMotoristaACaminho).toHaveBeenCalledTimes(1);
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledTimes(1);
  });

  test('7. Fluxo "Não embarcou" -> "Não vou embarcar" com motivo válido: cancela, registra autor/motivo/data e notifica', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.cancelarConfirmadaComMotivo.mockImplementation(async (id, opcoes, agora) =>
      corridaBase({
        status: 'CANCELADA',
        canceladoPor: opcoes.canceladoPor,
        motivoCancelamento: opcoes.motivo,
        canceladaEm: agora.toISOString(),
        situacaoMotorista: opcoes.situacaoMotorista,
      })
    );

    const r = await corridasService.registrarEmbarqueMotorista('c1', MOT, {
      acao: 'NAO_VOU_EMBARCAR',
      motivo: '  Imprevisto mecânico no veículo  ',
    });
    expect(r.status).toBe('CANCELADA');
    expect(r.canceladoPor).toBe('MOTORISTA');
    expect(r.motivoCancelamento).toBe('Imprevisto mecânico no veículo');
    expect(r.canceladaEm).toBeTruthy();
    expect(notificacoesService.notificarAtualizacaoCorrida.mock.calls[0][1].mensagem).toContain(
      'Imprevisto mecânico no veículo'
    );
  });

  test.each([undefined, null, '', '     ', '1234', 'x'.repeat(501)])(
    '8. Bloqueio de cancelamento do motorista com motivo vazio, só espaços ou fora dos limites (%p)',
    async (motivo) => {
      corridasRepository.findById.mockResolvedValue(corridaBase());
      await expect(
        corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'NAO_VOU_EMBARCAR', motivo })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(corridasRepository.cancelarConfirmadaComMotivo).not.toHaveBeenCalled();
    }
  );
});

describe('Cancelamento direto pela tela Minhas corridas (corridasService.cancelar)', () => {
  test('Motorista cancela corrida CONFIRMADA com motivo obrigatório e notifica exclusivamente o passageiro', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase({ dataHorario: minutos(25) }));
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockImplementation(async (id, transicao, meta) =>
      corridaBase({ status: 'CANCELADA', ...meta })
    );

    const r = await corridasService.cancelar('c1', MOT, { motivo: '  Trânsito bloqueado na rodovia  ' });
    expect(r.status).toBe('CANCELADA');
    expect(r.canceladoPor).toBe('MOTORISTA');
    expect(r.motivoCancelamento).toBe('Trânsito bloqueado na rodovia');
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledTimes(1);
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledWith(
      'pass-1',
      expect.objectContaining({
        corridaId: 'c1',
        titulo: 'Corrida cancelada pelo motorista',
        mensagem: expect.stringContaining('Trânsito bloqueado na rodovia'),
      })
    );
  });

  test.each([undefined, '', '   ', 'abc'])(
    'Motorista não pode cancelar via cancelar() sem motivo válido (%p)',
    async (motivo) => {
      corridasRepository.findById.mockResolvedValue(corridaBase({ dataHorario: minutos(25) }));
      await expect(corridasService.cancelar('c1', MOT, { motivo })).rejects.toMatchObject({ statusCode: 400 });
      expect(corridasRepository.transicionarComLiberacaoDeVeiculo).not.toHaveBeenCalled();
    }
  );

  test('Passageiro cancela corrida CONFIRMADA e notifica exclusivamente o motorista vinculado (com motivo)', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase({ dataHorario: minutos(25) }));
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockImplementation(async (id, transicao, meta) =>
      corridaBase({ status: 'CANCELADA', ...meta })
    );

    const r = await corridasService.cancelar('c1', PASS, { motivo: 'Mudança de compromisso' });
    expect(r.status).toBe('CANCELADA');
    expect(r.canceladoPor).toBe('PASSAGEIRO');
    expect(r.motivoCancelamento).toBe('Mudança de compromisso');
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledTimes(1);
    expect(notificacoesService.notificarAtualizacaoCorrida).toHaveBeenCalledWith(
      'mot-1',
      expect.objectContaining({
        corridaId: 'c1',
        titulo: 'Corrida cancelada pelo passageiro',
        mensagem: expect.stringContaining('Mudança de compromisso'),
      })
    );
  });

  test('Bloqueia cancelamento pelo motorista ou passageiro quando a corrida já está EM_ANDAMENTO, FINALIZADA ou CANCELADA', async () => {
    for (const statusInvalido of ['EM_ANDAMENTO', 'FINALIZADA', 'CANCELADA']) {
      corridasRepository.findById.mockResolvedValue(corridaBase({ status: statusInvalido }));
      await expect(
        corridasService.cancelar('c1', MOT, { motivo: 'Motivo válido' })
      ).rejects.toMatchObject({ statusCode: 409 });
      await expect(
        corridasService.cancelar('c1', PASS, { motivo: 'Motivo válido' })
      ).rejects.toMatchObject({ statusCode: 409 });
    }
  });
});

describe('9–11. Cancelamento automático por ausência de confirmação', () => {
  test('9. Cancela automaticamente como SISTEMA após expiração do prazo e notifica motorista e passageiro', async () => {
    corridasRepository.cancelarSolicitadasVencidas.mockResolvedValue([]);
    corridasRepository.findConfirmadasComPrazoVencido.mockResolvedValue([
      { id: 'c1', usuarioId: 'pass-1', motoristaId: 'mot-1', origemNome: 'A', destinoNome: 'B' },
    ]);
    corridasRepository.cancelarConfirmadaComMotivo.mockResolvedValue(
      corridaBase({
        status: 'CANCELADA',
        canceladoPor: 'SISTEMA',
        motivoCancelamento: MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
      })
    );

    await corridasService.cancelarCorridasExpiradas(new Date(), { forcar: true });
    expect(corridasRepository.cancelarConfirmadaComMotivo).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        canceladoPor: 'SISTEMA',
        motivo: MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
        toleranciaMs: TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN * 60 * 1000,
      }),
      expect.any(Date)
    );
    const destinatarios = notificacoesService.notificarAtualizacaoCorrida.mock.calls.map((c) => c[0]).sort();
    expect(destinatarios).toEqual(['mot-1', 'pass-1']);
  });

  test('10. Não cancela automaticamente quando as confirmações já foram realizadas', async () => {
    corridasRepository.cancelarSolicitadasVencidas.mockResolvedValue([]);
    corridasRepository.findConfirmadasComPrazoVencido.mockResolvedValue([]);

    await corridasService.cancelarCorridasExpiradas(new Date(), { forcar: true });
    expect(corridasRepository.cancelarConfirmadaComMotivo).not.toHaveBeenCalled();
    expect(notificacoesService.notificarAtualizacaoCorrida).not.toHaveBeenCalled();
  });

  test('11. Não cancela viagem quando motorista informou "Estou a caminho" e está dentro do prazo estendido', async () => {
    corridasRepository.cancelarSolicitadasVencidas.mockResolvedValue([]);
    corridasRepository.findConfirmadasComPrazoVencido.mockResolvedValue([
      { id: 'c1', usuarioId: 'pass-1', motoristaId: 'mot-1', origemNome: 'A', destinoNome: 'B' },
    ]);
    corridasRepository.cancelarConfirmadaComMotivo.mockResolvedValue(null);

    await corridasService.cancelarCorridasExpiradas(new Date(), { forcar: true });
    expect(notificacoesService.notificarAtualizacaoCorrida).not.toHaveBeenCalled();
  });
});

describe('12–18. Autorização, estados finais, idempotência, fuso horário, pagamento e resiliência', () => {
  test('12. Bloqueia ações de embarque e de cancelamento por usuário não autorizado (403)', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    await expect(
      corridasService.registrarEmbarqueMotorista('c1', { id: 'outro-mot', perfil: 'MOTORISTA' }, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      corridasService.registrarEmbarquePassageiro('c1', { id: 'outro-pass', perfil: 'USUARIO' }, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      corridasService.cancelar('c1', { id: 'outro-mot', perfil: 'MOTORISTA' }, { motivo: 'Motivo válido' })
    ).rejects.toMatchObject({ statusCode: 403 });

    await expect(
      corridasService.cancelar('c1', { id: 'outro-pass', perfil: 'USUARIO' }, { motivo: 'Motivo válido' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test('13 e 14. Bloqueia confirmação em viagem já CANCELADA (409) e cancelamento em viagem FINALIZADA (409)', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase({ status: 'CANCELADA' }));
    await expect(
      corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      corridasService.registrarEmbarquePassageiro('c1', PASS, { acao: 'CONFIRMAR_EMBARQUE' })
    ).rejects.toMatchObject({ statusCode: 409 });

    corridasRepository.findById.mockResolvedValue(corridaBase({ status: 'FINALIZADA' }));
    await expect(
      corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'NAO_VOU_EMBARCAR', motivo: 'Motivo válido' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  test('15 e 16. Idempotência em requisições repetidas e concorrência (409 quando transição perde corrida)', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase({ status: 'CANCELADA', canceladoPor: 'MOTORISTA' }));
    await corridasService.registrarEmbarqueMotorista('c1', MOT, { acao: 'NAO_VOU_EMBARCAR', motivo: 'Pneu furado' });
    expect(corridasRepository.cancelarConfirmadaComMotivo).not.toHaveBeenCalled();
    expect(notificacoesService.notificarAtualizacaoCorrida).not.toHaveBeenCalled();

    // Duas requisições simultâneas a cancelar(): a segunda recebe null do repositório e retorna 409 sem notificar 2x
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockResolvedValueOnce(null);
    await expect(
      corridasService.cancelar('c1', MOT, { motivo: 'Pneu furado' })
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(notificacoesService.notificarAtualizacaoCorrida).not.toHaveBeenCalled();
  });

  test('17. Compatibilidade com o fluxo de confirmação de pagamento e finalização após embarque', async () => {
    corridasRepository.findById.mockResolvedValue(
      corridaBase({ status: 'EM_ANDAMENTO', embarqueMotoristaConfirmado: true })
    );
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockResolvedValue(
      corridaBase({ status: 'FINALIZADA', embarqueMotoristaConfirmado: true })
    );

    const r = await corridasService.confirmarPagamentoEFinalizar('c1', MOT);
    expect(r.status).toBe('FINALIZADA');
    expect(notificacoesService.notificarPassageiroFinalizacao).toHaveBeenCalledWith(
      'pass-1',
      expect.objectContaining({ corridaId: 'c1' })
    );
  });

  test('18. Resiliência quando o serviço de notificações falha: operação principal não é revertida', async () => {
    corridasRepository.findById.mockResolvedValue(corridaBase());
    corridasRepository.transicionarComLiberacaoDeVeiculo.mockImplementation(async (id, t, meta) =>
      corridaBase({ status: 'CANCELADA', ...meta })
    );
    notificacoesService.notificarAtualizacaoCorrida.mockRejectedValue(new Error('Falha no serviço de notificações'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      corridasService.cancelar('c1', MOT, { motivo: 'Imprevisto no veículo' })
    ).resolves.toMatchObject({ status: 'CANCELADA', canceladoPor: 'MOTORISTA' });
  });
});
