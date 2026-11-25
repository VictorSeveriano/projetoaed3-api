'use strict';

/**
 * despachoNotificacao.js — Disparo resiliente de efeitos colaterais de notificação
 * com tentativa controlada (retry finito + backoff exponencial) para falhas transitórias.
 *
 * Política:
 *  - Falhas em notificações após o commit da operação principal são registradas em log
 *    estruturado para diagnóstico e nunca desfazem a operação de negócio confirmada.
 *  - Erros transitórios de banco/rede (ex.: P1001, P1002, P1008, P1017, P2024, P2034,
 *    ECONNRESET, ETIMEDOUT) recebem novas tentativas controladas (máx. 3 tentativas totais,
 *    sem loops infinitos).
 *  - Erros permanentes ou de validação (4xx) não são reexecutados desnecessariamente.
 */

const CODIGOS_TRANSITORIOS = new Set([
  'P1001', // Can't reach database server
  'P1002', // Database server timed out
  'P1008', // Operations timed out
  'P1017', // Server has closed the connection
  'P2024', // Timed out fetching a new connection from the connection pool
  'P2034', // Transaction failed due to a write conflict or a deadlock
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EAI_AGAIN',
]);

const PADRAO_MENSAGEM_TRANSITORIA =
  /can't reach database|connection pool|timed out|timeout|deadlock|unable to start a transaction|server has closed the connection|econnreset/i;

function ehErroTransitorioNotificacao(erro) {
  if (!erro) return false;
  if (erro.transient === true) return true;
  if (typeof erro.statusCode === 'number' && erro.statusCode >= 400 && erro.statusCode < 500) {
    return false;
  }
  if (erro.code && CODIGOS_TRANSITORIOS.has(String(erro.code).toUpperCase())) {
    return true;
  }
  const msg = typeof erro.message === 'string' ? erro.message : '';
  return PADRAO_MENSAGEM_TRANSITORIA.test(msg);
}

function aguardarMs(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (typeof t.unref === 'function') t.unref();
  });
}

/**
 * Executa o envio/persistência de uma notificação de forma isolada e resiliente.
 *
 * @param {string} origem Nome do serviço emissor
 * @param {string} contexto Descrição objetiva da operação
 * @param {() => Promise<any>} fn Função assíncrona de criação/atualização
 * @param {{ maxTentativas?: number, atrasoBaseMs?: number }} [opcoes]
 * @returns {Promise<boolean>}
 */
async function despacharNotificacaoSemFalhar(origem, contexto, fn, opcoes = {}) {
  const maxTentativas = Math.min(
    5,
    Math.max(1, Number.isInteger(opcoes.maxTentativas) ? opcoes.maxTentativas : 3)
  );
  const atrasoBaseMs =
    typeof opcoes.atrasoBaseMs === 'number' && opcoes.atrasoBaseMs >= 0
      ? opcoes.atrasoBaseMs
      : process.env.NODE_ENV === 'test'
        ? 10
        : 120;

  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      await fn();
      return true;
    } catch (erro) {
      ultimoErro = erro;
      const transitorio = ehErroTransitorioNotificacao(erro);
      const podeTentarNovamente = transitorio && tentativa < maxTentativas;

      if (!podeTentarNovamente) {
        break;
      }

      const esperaMs = atrasoBaseMs * Math.pow(2, tentativa - 1);
      await aguardarMs(esperaMs);
    }
  }

  const codigoInfo = ultimoErro?.code ? ` [code=${ultimoErro.code}]` : '';
  console.error(
    `[${origem}] Falha ao enviar notificacao (${contexto})${codigoInfo}:`,
    ultimoErro?.message || 'Erro desconhecido'
  );
  return false;
}

module.exports = {
  despacharNotificacaoSemFalhar,
  ehErroTransitorioNotificacao,
};
