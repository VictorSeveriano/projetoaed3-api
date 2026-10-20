'use strict';

/**
 * constants.js — Constantes globais da aplicação.
 *
 * Centraliza valores fixos compartilhados entre módulos para evitar
 * duplicação e facilitar manutenção.
 */

/**
 * UUID fixo do administrador principal do sistema.
 * Definido pela migration inicial e pelo seed.
 * Utilizado para envio de notificações administrativas.
 */
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

// ---------- Veículos ----------

/** Portes aceitos (valores já persistidos pelo sistema — ver migration padronizar_porte). */
const PORTES_VALIDOS = Object.freeze(['Pequeno', 'Medio', 'Grande']);

/** Classes de serviço aceitas. */
const CLASSES_VALIDAS = Object.freeze(['BASICO', 'NORMAL', 'PREMIUM']);

/** Mapeamento oficial porte → classe de serviço. */
const PORTE_PARA_CLASSE = Object.freeze({
  Pequeno: 'BASICO',
  Medio:   'NORMAL',
  Grande:  'PREMIUM',
});

const STATUS_APROVACAO_VEICULO = Object.freeze({
  PENDENTE:  'PENDENTE',
  APROVADO:  'APROVADO',
  REJEITADO: 'REJEITADO',
  EXCLUIDO:  'EXCLUIDO',
});

const STATUS_VEICULO = Object.freeze({
  DISPONIVEL:   'DISPONIVEL',
  EM_CORRIDA:   'EM_CORRIDA',
  INDISPONIVEL: 'INDISPONIVEL',
});

// ---------- Corridas ----------

const FORMAS_PAGAMENTO_VALIDAS = Object.freeze(['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX']);

const STATUS_CORRIDA = Object.freeze({
  SOLICITADA:   'SOLICITADA',
  CONFIRMADA:   'CONFIRMADA',
  EM_ANDAMENTO: 'EM_ANDAMENTO',
  FINALIZADA:   'FINALIZADA',
  CANCELADA:    'CANCELADA',
});

/** Status em que a corrida mantém um veículo reservado. */
const STATUS_CORRIDA_ATIVOS = Object.freeze([STATUS_CORRIDA.CONFIRMADA, STATUS_CORRIDA.EM_ANDAMENTO]);

/**
 * Transições de estado permitidas (preservam o comportamento já existente):
 *  - aceitar:   SOLICITADA → CONFIRMADA
 *  - cancelar:  qualquer estado não encerrado → CANCELADA
 *  - finalizar: CONFIRMADA | EM_ANDAMENTO → FINALIZADA (após confirmação de pagamento)
 */
const TRANSICOES_CORRIDA = Object.freeze({
  aceitar:   Object.freeze({ de: Object.freeze([STATUS_CORRIDA.SOLICITADA]), para: STATUS_CORRIDA.CONFIRMADA }),
  cancelar:  Object.freeze({
    de: Object.freeze([STATUS_CORRIDA.SOLICITADA, STATUS_CORRIDA.CONFIRMADA, STATUS_CORRIDA.EM_ANDAMENTO]),
    para: STATUS_CORRIDA.CANCELADA,
  }),
  finalizar: Object.freeze({
    de: Object.freeze([STATUS_CORRIDA.CONFIRMADA, STATUS_CORRIDA.EM_ANDAMENTO]),
    para: STATUS_CORRIDA.FINALIZADA,
  }),
});

/**
 * Fuso horário de referência do negócio para a definição da faixa tarifária.
 * O sistema opera no Espírito Santo/Brasil (Horário de Brasília). O Brasil não adota
 * horário de verão desde 2019, mas o cálculo usa o identificador IANA para ser explícito.
 */
const BUSINESS_TIMEZONE = 'America/Sao_Paulo';

module.exports = {
  ADMIN_ID,
  PORTES_VALIDOS,
  CLASSES_VALIDAS,
  PORTE_PARA_CLASSE,
  STATUS_APROVACAO_VEICULO,
  STATUS_VEICULO,
  FORMAS_PAGAMENTO_VALIDAS,
  STATUS_CORRIDA,
  STATUS_CORRIDA_ATIVOS,
  TRANSICOES_CORRIDA,
  BUSINESS_TIMEZONE,
};
