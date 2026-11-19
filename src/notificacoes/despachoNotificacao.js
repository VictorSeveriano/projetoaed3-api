'use strict';

/**
 * despachoNotificacao.js — Disparo resiliente de efeitos colaterais de notificação.
 *
 * Garante a política da aplicação: falhas em notificações após o commit da
 * operação principal são registradas em log com contexto e nunca desfazem a
 * operação de negócio confirmada.
 */
async function despacharNotificacaoSemFalhar(origem, contexto, fn) {
  try {
    await fn();
    return true;
  } catch (e) {
    console.error(`[${origem}] Falha ao enviar notificacao (${contexto}):`, e.message);
    return false;
  }
}

module.exports = { despacharNotificacaoSemFalhar };
