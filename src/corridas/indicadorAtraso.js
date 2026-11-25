'use strict';
/**
 * indicadorAtraso.js — Classificação pura e determinística de pontualidade,
 * atraso, expiração automática e duração efetiva de corridas.
 *
 * Regras centrais:
 *  - Utiliza exclusivamente a constante centralizada `TOLERANCIA_ATRASO_MIN` (5 min).
 *  - NÃO cria novos status de banco de dados nem altera prazos de expiração.
 *  - NÃO confunde corrida em atraso (`EM_ATRASO`) com corrida expirada (`EXPIRADA`).
 *  - NÃO classifica corrida `EM_ANDAMENTO` como atrasada apenas por estar em andamento.
 *  - Calcula duração efetiva somente quando os dois instantes reais (`embarqueMotoristaEm`
 *    e `finalizadaEm`) existem no registro.
 */

const {
  STATUS_CORRIDA,
  TOLERANCIA_ATRASO_MIN,
  SITUACAO_PONTUALIDADE_CORRIDA,
  ORIGEM_CANCELAMENTO,
  MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
} = require('../utils/constants');

/**
 * Identifica se uma corrida `CANCELADA` foi encerrada por expiração automática do sistema
 * (sem aceite até o horário agendado ou ausência de confirmação de embarque no prazo).
 * Distingue expiração automática de cancelamento manual administrativo.
 */
function foiExpiradaAutomaticamente(corrida) {
  if (!corrida || corrida.status !== STATUS_CORRIDA.CANCELADA) return false;
  if (corrida.canceladoPor !== ORIGEM_CANCELAMENTO.SISTEMA) return false;

  const motivo = typeof corrida.motivoCancelamento === 'string'
    ? corrida.motivoCancelamento.trim()
    : '';

  if (!motivo) return false;

  return (
    motivo === MOTIVO_CANCELAMENTO_SEM_MOTORISTA ||
    motivo === MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO ||
    /^cancelada automaticamente pelo sistema/i.test(motivo)
  );
}

/**
 * Calcula a duração efetiva da corrida em minutos apenas quando os timestamps
 * reais de início (`embarqueMotoristaEm`) e fim (`finalizadaEm`) estão persistidos.
 * Nunca inventa dados não persistidos.
 */
function calcularDuracaoEfetivaMin(corrida) {
  if (!corrida || !corrida.embarqueMotoristaEm || !corrida.finalizadaEm) {
    return null;
  }
  const inicioMs = new Date(corrida.embarqueMotoristaEm).getTime();
  const fimMs = new Date(corrida.finalizadaEm).getTime();
  if (Number.isNaN(inicioMs) || Number.isNaN(fimMs) || fimMs < inicioMs) {
    return null;
  }
  return Math.max(0, Math.round((fimMs - inicioMs) / 60000));
}

/**
 * Classifica a situação temporal/pontualidade de uma corrida.
 *
 * @param {object} corrida
 * @param {Date|string|number} [agora=new Date()]
 * @param {number} [toleranciaMin=TOLERANCIA_ATRASO_MIN]
 */
function classificarPontualidadeCorrida(
  corrida,
  agora = new Date(),
  toleranciaMin = TOLERANCIA_ATRASO_MIN
) {
  const duracaoEfetivaMin = calcularDuracaoEfetivaMin(corrida);
  const agendadoMs = corrida?.dataHorario ? new Date(corrida.dataHorario).getTime() : NaN;
  const embarqueMs =
    corrida?.embarqueMotoristaConfirmado === true && corrida?.embarqueMotoristaEm
      ? new Date(corrida.embarqueMotoristaEm).getTime()
      : NaN;

  let iniciouComAtraso = false;
  let atrasoInicioMinutos = 0;
  if (!Number.isNaN(agendadoMs) && !Number.isNaN(embarqueMs) && embarqueMs > agendadoMs) {
    const diffInicio = Math.floor((embarqueMs - agendadoMs) / 60000);
    if (diffInicio > toleranciaMin) {
      iniciouComAtraso = true;
      atrasoInicioMinutos = diffInicio;
    }
  }

  const base = {
    toleranciaMin,
    duracaoEfetivaMin,
    iniciouComAtraso,
    atrasoInicioMinutos,
  };

  if (!corrida) {
    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.NO_HORARIO,
      rotulo: 'No horário',
      cor: 'muted',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.FINALIZADA,
      rotulo: 'Finalizada',
      cor: 'success',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  if (corrida.status === STATUS_CORRIDA.CANCELADA) {
    if (foiExpiradaAutomaticamente(corrida)) {
      return {
        ...base,
        codigo: SITUACAO_PONTUALIDADE_CORRIDA.EXPIRADA,
        rotulo: 'Expirada',
        cor: 'muted',
        atrasada: false,
        expirada: true,
        minutosAtraso: 0,
      };
    }
    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.CANCELADA,
      rotulo: 'Cancelada',
      cor: 'danger',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  // Corridas em andamento NÃO são marcadas como atrasadas apenas por estarem em execução
  if (corrida.status === STATUS_CORRIDA.EM_ANDAMENTO) {
    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.EM_ANDAMENTO,
      rotulo: 'Em andamento',
      cor: 'warning',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  // Estados pré-embarque: SOLICITADA ou CONFIRMADA
  const agoraMs = agora instanceof Date ? agora.getTime() : new Date(agora).getTime();
  if (Number.isNaN(agendadoMs) || Number.isNaN(agoraMs) || agoraMs < agendadoMs) {
    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.NO_HORARIO,
      rotulo: 'No horário',
      cor: 'success',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  const limiteToleranciaMs = agendadoMs + toleranciaMin * 60 * 1000;
  const minutosPassados = Math.max(0, Math.floor((agoraMs - agendadoMs) / 60000));

  if (agoraMs <= limiteToleranciaMs) {
    if (corrida.status === STATUS_CORRIDA.CONFIRMADA && corrida.embarqueMotoristaConfirmado !== true) {
      return {
        ...base,
        codigo: SITUACAO_PONTUALIDADE_CORRIDA.AGUARDANDO_EMBARQUE,
        rotulo: 'Aguardando embarque',
        cor: 'info',
        atrasada: false,
        expirada: false,
        minutosAtraso: minutosPassados,
      };
    }

    return {
      ...base,
      codigo: SITUACAO_PONTUALIDADE_CORRIDA.NO_HORARIO,
      rotulo: 'No horário',
      cor: 'info',
      atrasada: false,
      expirada: false,
      minutosAtraso: 0,
    };
  }

  return {
    ...base,
    codigo: SITUACAO_PONTUALIDADE_CORRIDA.EM_ATRASO,
    rotulo: 'Em atraso',
    cor: 'danger',
    atrasada: true,
    expirada: false,
    minutosAtraso: Math.max(1, minutosPassados),
  };
}

module.exports = {
  TOLERANCIA_ATRASO_MIN,
  foiExpiradaAutomaticamente,
  calcularDuracaoEfetivaMin,
  classificarPontualidadeCorrida,
};
