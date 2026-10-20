'use strict';
/**
 * env.js — Validação das variáveis de ambiente obrigatórias na inicialização.
 * Lança um erro listando apenas os NOMES das variáveis ausentes (nunca valores).
 */

const VARIAVEIS_OBRIGATORIAS = ['JWT_SECRET', 'DATABASE_URL'];

function validarVariaveisDeAmbiente(env = process.env) {
  const ausentes = VARIAVEIS_OBRIGATORIAS.filter((nome) => {
    const valor = env[nome];
    return typeof valor !== 'string' || valor.trim() === '';
  });

  if (ausentes.length > 0) {
    throw new Error(`Variaveis de ambiente obrigatorias ausentes ou vazias: ${ausentes.join(', ')}.`);
  }
}

module.exports = { validarVariaveisDeAmbiente, VARIAVEIS_OBRIGATORIAS };
