'use strict';
/**
 * inputValidators.js — Validadores reutilizáveis de entrada da API.
 *
 * Todos lançam AppError 400 em caso de valor inválido e retornam o valor NORMALIZADO.
 * Nenhum deles usa Number() "cego": booleanos, arrays, objetos, strings vazias, NaN e
 * infinitos são rejeitados explicitamente.
 */

const AppError = require('./AppError');
const { BUSINESS_TIMEZONE } = require('./constants');

const NUMERIC_STRING = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;

const ausente = (v) => v === undefined || v === null;

/**
 * Converte number | string numérica em number finito. Retorna undefined se não for numérico.
 */
function lerNumero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor === 'string') {
    const s = valor.trim();
    if (s === '' || !NUMERIC_STRING.test(s)) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** String obrigatória, não vazia após trim, com limite opcional (ex.: tamanho da coluna). */
function exigirTexto(valor, campo, { max } = {}) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new AppError(`${campo} e obrigatorio e deve ser um texto nao vazio.`, 400);
  }
  const texto = valor.trim();
  if (max && texto.length > max) {
    throw new AppError(`${campo} excede o tamanho maximo de ${max} caracteres.`, 400);
  }
  return texto;
}

/** Número finito e positivo (> 0). Opcionalmente exige inteiro. */
function exigirNumeroPositivo(valor, campo, { inteiro = false } = {}) {
  const n = lerNumero(valor);
  if (n === undefined || n <= 0) {
    throw new AppError(`${campo} invalido: deve ser um numero finito positivo.`, 400);
  }
  if (inteiro && !Number.isInteger(n)) {
    throw new AppError(`${campo} invalido: deve ser um numero inteiro.`, 400);
  }
  return n;
}

/** Campo numérico opcional: ausente/null → null; informado → validado (nunca "|| null"). */
function numeroPositivoOpcional(valor, campo, opcoes) {
  if (ausente(valor)) return null;
  return exigirNumeroPositivo(valor, campo, opcoes);
}

/** Coordenada opcional: ausente/null → null; informada → número finito dentro de [min, max]. Zero é válido. */
function coordenadaOpcional(valor, campo, min, max) {
  if (ausente(valor)) return null;
  const n = lerNumero(valor);
  if (n === undefined || n < min || n > max) {
    throw new AppError(`${campo} invalida: deve ser um numero entre ${min} e ${max}.`, 400);
  }
  return n;
}

const latitudeOpcional = (v, campo) => coordenadaOpcional(v, campo, -90, 90);
const longitudeOpcional = (v, campo) => coordenadaOpcional(v, campo, -180, 180);

/**
 * Enum de string (case-insensitive, normalizado para maiúsculas). Ausente/null → `padrao`.
 * Se informado, precisa ser string pertencente a `permitidos` (string vazia é rejeitada).
 */
function enumOpcional(valor, campo, permitidos, padrao) {
  if (ausente(valor)) return padrao;
  if (typeof valor !== 'string') {
    throw new AppError(`${campo} invalido. Use ${permitidos.join(', ')}.`, 400);
  }
  const norm = valor.trim().toUpperCase();
  if (!permitidos.includes(norm)) {
    throw new AppError(`${campo} invalido. Use ${permitidos.join(', ')}.`, 400);
  }
  return norm;
}

/** Porte do veículo: obrigatório, string, um dos permitidos (case-insensitive). Retorna a grafia canônica. */
function exigirPorte(valor, permitidos) {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new AppError(`Porte e obrigatorio. Use ${permitidos.join(', ')}.`, 400);
  }
  const canonico = permitidos.find((p) => p.toLowerCase() === valor.trim().toLowerCase());
  if (!canonico) {
    throw new AppError(`Porte invalido. Use ${permitidos.join(', ')}.`, 400);
  }
  return canonico;
}

// ---------- Data e hora ----------

const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;

/** Deslocamento (ms) do fuso em relação ao UTC em determinado instante. */
function offsetDoFuso(timeZone, instanteMs) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instanteMs));
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUtc - Math.floor(instanteMs / 1000) * 1000;
}

/** Converte um horário de parede (sem offset) do fuso informado no instante UTC correspondente. */
function horarioDeParedeParaInstante(timeZone, utcComoParede) {
  let instante = utcComoParede - offsetDoFuso(timeZone, utcComoParede);
  // segunda passada para fronteiras de mudança de offset
  instante = utcComoParede - offsetDoFuso(timeZone, instante);
  return instante;
}

/**
 * Interpreta `dataHorario` (string ISO-8601 com data e hora) e retorna o instante.
 *  - Com "Z" ou offset (+/-HH:MM): o instante é exatamente o informado (contrato do frontend: toISOString()).
 *  - Sem offset: é interpretado como horário de parede do fuso do negócio (America/Sao_Paulo).
 * Rejeita não-strings, datas só com dia, e datas inexistentes (ex.: 30/02, 25h).
 * Política de passado: agendamentos no passado NÃO são rejeitados pelo backend (comportamento preservado).
 * @returns {Date}
 */
function lerDataHorario(valor, campo = 'dataHorario') {
  const invalido = () => new AppError(`${campo} invalido: informe data e hora no formato ISO 8601.`, 400);
  if (typeof valor !== 'string') throw invalido();
  const m = ISO_DATETIME.exec(valor.trim());
  if (!m) throw invalido();

  const [, ano, mes, dia, hora, minuto, segundo = '0', fracao = '0', zona] = m;
  const [A, M, D, H, Mi, S] = [ano, mes, dia, hora, minuto, segundo].map(Number);
  const ms = Number(fracao.padEnd(3, '0').slice(0, 3));

  const check = new Date(Date.UTC(A, M - 1, D, H, Mi, S, ms));
  if (
    check.getUTCFullYear() !== A || check.getUTCMonth() !== M - 1 || check.getUTCDate() !== D ||
    H > 23 || Mi > 59 || S > 59
  ) throw invalido();

  const paredeUtc = check.getTime();
  let instante;
  if (!zona) {
    instante = horarioDeParedeParaInstante(BUSINESS_TIMEZONE, paredeUtc);
  } else if (zona.toUpperCase() === 'Z') {
    instante = paredeUtc;
  } else {
    const sinal = zona[0] === '-' ? -1 : 1;
    const digitos = zona.slice(1).replace(':', '');
    const oh = Number(digitos.slice(0, 2));
    const om = Number(digitos.slice(2) || '0');
    if (oh > 23 || om > 59) throw invalido();
    instante = paredeUtc - sinal * (oh * 60 + om) * 60000;
  }

  const data = new Date(instante);
  if (Number.isNaN(data.getTime())) throw invalido();
  return data;
}

/** Hora cheia (0-23) do instante no fuso do negócio. */
function horaNoFusoDoNegocio(instante, timeZone = BUSINESS_TIMEZONE) {
  const texto = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(instante);
  return parseInt(texto, 10);
}

module.exports = {
  ausente,
  lerNumero,
  exigirTexto,
  exigirNumeroPositivo,
  numeroPositivoOpcional,
  latitudeOpcional,
  longitudeOpcional,
  enumOpcional,
  exigirPorte,
  lerDataHorario,
  horaNoFusoDoNegocio,
};
