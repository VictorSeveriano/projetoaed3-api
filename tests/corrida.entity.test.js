'use strict';

const Corrida = require('../src/corridas/Corrida');
const { TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN } = require('../src/utils/constants');

describe('Entidade Corrida — comportamentos de domínio e invariantes', () => {
  const base = (extra = {}) => ({
    id: 'c1',
    usuarioId: 'pass-1',
    motoristaId: 'mot-1',
    veiculoId: 'v-1',
    origemNome: 'Centro',
    destinoNome: 'UFES',
    distanciaKm: 10,
    valor: 25,
    status: 'CONFIRMADA',
    dataHorario: '2026-10-01T14:00:00.000Z',
    criadaEm: '2026-10-01T12:00:00.000Z',
    ...extra,
  });

  test('garantirInstancia preserva instância existente, envolve objeto simples e retorna null para nulo', () => {
    expect(Corrida.garantirInstancia(null)).toBeNull();
    expect(Corrida.garantirInstancia(undefined)).toBeNull();

    const instancia = new Corrida(base());
    expect(Corrida.garantirInstancia(instancia)).toBe(instancia);

    const convertida = Corrida.garantirInstancia(base());
    expect(convertida).toBeInstanceOf(Corrida);
    expect(convertida.id).toBe('c1');
  });

  test('predicados de estado e trajetoDescricao refletem corretamente cada status', () => {
    const solicitada = new Corrida(base({ status: 'SOLICITADA', motoristaId: null }));
    expect(solicitada.estaSolicitada()).toBe(true);
    expect(solicitada.estaAtiva()).toBe(false);
    expect(solicitada.podeSerFinalizada()).toBe(false);

    const confirmada = new Corrida(base({ status: 'CONFIRMADA', situacaoMotorista: 'A_CAMINHO' }));
    expect(confirmada.estaConfirmada()).toBe(true);
    expect(confirmada.estaAtiva()).toBe(true);
    expect(confirmada.motoristaEstaACaminho()).toBe(true);
    expect(confirmada.estaAguardandoConfirmacaoEmbarque()).toBe(true);
    expect(confirmada.podeSerFinalizada()).toBe(true);
    expect(confirmada.trajetoDescricao()).toBe('Centro para UFES');

    const emAndamento = new Corrida(base({ status: 'EM_ANDAMENTO', embarqueMotoristaConfirmado: true, situacaoMotorista: 'A_CAMINHO' }));
    expect(emAndamento.estaEmAndamento()).toBe(true);
    expect(emAndamento.embarqueMotoristaFoiConfirmado()).toBe(true);
    expect(emAndamento.motoristaEstaACaminho()).toBe(false);
    expect(emAndamento.estaAguardandoConfirmacaoEmbarque()).toBe(false);
    expect(emAndamento.podeSerFinalizada()).toBe(true);

    const finalizada = new Corrida(base({ status: 'FINALIZADA' }));
    expect(finalizada.estaFinalizada()).toBe(true);
    expect(finalizada.podeSerFinalizada()).toBe(false);

    const cancelada = new Corrida(base({ status: 'CANCELADA' }));
    expect(cancelada.estaCancelada()).toBe(true);
    expect(cancelada.podeSerFinalizada()).toBe(false);
  });

  test('podeSerAcessadaPor e podeSerCanceladaPor aplicam posse e regras por perfil', () => {
    const confirmada = new Corrida(base({ status: 'CONFIRMADA' }));
    expect(confirmada.podeSerAcessadaPor({ id: 'pass-1', perfil: 'USUARIO' })).toBe(true);
    expect(confirmada.podeSerAcessadaPor({ id: 'outro', perfil: 'USUARIO' })).toBe(false);
    expect(confirmada.podeSerAcessadaPor({ id: 'mot-1', perfil: 'MOTORISTA' })).toBe(true);
    expect(confirmada.podeSerAcessadaPor({ id: 'outro', perfil: 'MOTORISTA' })).toBe(false);
    expect(confirmada.podeSerAcessadaPor({ id: 'admin', perfil: 'ADMINISTRADOR' })).toBe(true);

    expect(confirmada.podeSerCanceladaPor('USUARIO')).toBe(true);
    expect(confirmada.podeSerCanceladaPor('MOTORISTA')).toBe(true);
    expect(confirmada.podeSerCanceladaPor('ADMINISTRADOR')).toBe(true);

    const emAndamento = new Corrida(base({ status: 'EM_ANDAMENTO', embarqueMotoristaConfirmado: true }));
    expect(emAndamento.podeSerCanceladaPor('USUARIO')).toBe(false);
    expect(emAndamento.podeSerCanceladaPor('MOTORISTA')).toBe(false);
    expect(emAndamento.podeSerCanceladaPor('ADMINISTRADOR')).toBe(true);

    const finalizada = new Corrida(base({ status: 'FINALIZADA' }));
    expect(finalizada.podeSerCanceladaPor('ADMINISTRADOR')).toBe(false);
  });

  test('janela de confirmação, prazo vigente e expiração para aceite', () => {
    const corrida = new Corrida(base({ status: 'CONFIRMADA', dataHorario: '2026-10-01T14:00:00.000Z' }));
    expect(corrida.horarioAgendadoJaChegou(new Date('2026-10-01T13:59:59.000Z'))).toBe(false);
    expect(corrida.estaDentroDaJanelaConfirmacao(new Date('2026-10-01T13:59:59.000Z'))).toBe(false);
    expect(corrida.horarioAgendadoJaChegou(new Date('2026-10-01T14:00:00.000Z'))).toBe(true);
    expect(corrida.estaDentroDaJanelaConfirmacao(new Date('2026-10-01T14:00:00.000Z'))).toBe(true);

    const esperadoPadrao = new Date('2026-10-01T14:00:00.000Z').getTime() + TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN * 60 * 1000;
    expect(corrida.prazoConfirmacaoVigente().getTime()).toBe(esperadoPadrao);

    const estendida = new Corrida(base({ prazoConfirmacaoEm: '2026-10-01T14:30:00.000Z' }));
    expect(estendida.prazoConfirmacaoVigente().toISOString()).toBe('2026-10-01T14:30:00.000Z');

    const solicitadaVencida = new Corrida(base({
      status: 'SOLICITADA',
      motoristaId: null,
      dataHorario: '2026-10-01T14:00:00.000Z',
      criadaEm: '2026-10-01T13:00:00.000Z',
    }));
    expect(solicitadaVencida.estaExpiradaParaAceite(new Date('2026-10-01T14:01:00.000Z'))).toBe(true);
    expect(solicitadaVencida.estaExpiradaParaAceite(new Date('2026-10-01T13:59:00.000Z'))).toBe(false);

    const semDataExplicita = new Corrida({ id: 'c2', usuarioId: 'u1', origemNome: 'A', destinoNome: 'B', status: 'SOLICITADA' });
    expect(semDataExplicita.estaExpiradaParaAceite(new Date(Date.now() + 60000))).toBe(false);
  });
});
