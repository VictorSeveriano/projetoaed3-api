'use strict';
/**
 * corridas.validador.js — Regras de validação de payload e cálculo tarifário de corridas.
 *
 * Responsabilidades:
 *   - Tabela de tarifas por km segundo classe e faixa de horário no fuso do negócio
 *   - Determinação da faixa horária (manhã, tarde, noite) em America/Sao_Paulo
 *   - Cálculo validado do valor da corrida
 *   - Validação e normalização estrita do payload de criação de corrida
 */

const AppError = require('../utils/AppError');
const {
  CLASSES_VALIDAS,
  FORMAS_PAGAMENTO_VALIDAS,
  BUSINESS_TIMEZONE,
} = require('../utils/constants');
const {
  ausente,
  exigirTexto,
  exigirNumeroPositivo,
  numeroPositivoOpcional,
  latitudeOpcional,
  longitudeOpcional,
  enumOpcional,
  lerDataHorario,
  horaNoFusoDoNegocio,
} = require('../utils/inputValidators');

const NOME_LOCAL_MAX = 255; // varchar(255) em corridas.origem_nome / destino_nome

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Tarifa base por km por classe de veículo (R$/km) dependendo da faixa de horário.
 * Faixas definidas no fuso do negócio (America/Sao_Paulo):
 * 05:00–12:59 → manha
 * 13:00–18:59 → tarde
 * 19:00–04:59 → noite
 */
const TARIFAS_KM = Object.freeze({
  BASICO:  { manha: 1.50, tarde: 2.00, noite: 2.50 },
  NORMAL:  { manha: 2.00, tarde: 2.50, noite: 3.00 },
  PREMIUM: { manha: 2.50, tarde: 3.00, noite: 3.50 },
  default: { manha: 2.00, tarde: 2.50, noite: 3.00 },
});

/**
 * Determina a faixa tarifária de um instante no fuso do negócio (America/Sao_Paulo).
 * @param {string|Date} dataHorario
 * @returns {'manha'|'tarde'|'noite'}
 */
function determinarFaixaHorario(dataHorario) {
  let instante;
  if (dataHorario instanceof Date) {
    if (Number.isNaN(dataHorario.getTime())) {
      throw new Error('dataHorario invalido para calculo de faixa horaria');
    }
    instante = dataHorario;
  } else {
    instante = lerDataHorario(dataHorario);
  }

  const hora = horaNoFusoDoNegocio(instante, BUSINESS_TIMEZONE);
  if (Number.isNaN(hora) || hora < 0 || hora > 23) {
    throw new Error('Hora invalida extraida de dataHorario: ' + dataHorario);
  }

  if (hora >= 5 && hora < 13) return 'manha'; // 05:00 até 12:59
  if (hora >= 13 && hora < 19) return 'tarde'; // 13:00 até 18:59
  return 'noite'; // 19:00 até 04:59
}

/**
 * Calcula o valor da corrida usando a regra: distanciaKm * tarifa por km da classe e horário.
 * @throws {AppError} se qualquer entrada for inválida
 */
function calcularValorCorrida({ distanciaKm, classe, dataHorario }) {
  const distancia = exigirNumeroPositivo(distanciaKm, 'distanciaKm');

  if (!classe || typeof classe !== 'string') {
    throw new AppError('classe invalida: deve ser BASICO, NORMAL ou PREMIUM. Recebido: ' + classe, 400);
  }
  const classeNorm = classe.toUpperCase();
  if (!CLASSES_VALIDAS.includes(classeNorm)) {
    throw new AppError(
      'classe invalida: deve ser BASICO, NORMAL ou PREMIUM. Recebido: ' + classe,
      400
    );
  }

  if (ausente(dataHorario) || dataHorario === '') {
    throw new AppError('dataHorario e obrigatorio para calcular o valor da corrida.', 400);
  }

  const faixa = determinarFaixaHorario(dataHorario);
  const tarifasClasse = TARIFAS_KM[classeNorm];
  const tarifa = tarifasClasse[faixa];

  if (!tarifa || !Number.isFinite(tarifa) || tarifa <= 0) {
    throw new AppError(
      'Tarifa nao encontrada para classe ' + classeNorm + ' na faixa ' + faixa,
      500
    );
  }

  const bruto = distancia * tarifa;
  if (!Number.isFinite(bruto)) {
    throw new AppError('distanciaKm invalido: valor fora do intervalo suportado.', 400);
  }

  const valor = parseFloat(bruto.toFixed(2));
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new AppError(
      'Valor calculado invalido: ' + valor + ' para distancia=' + distancia + ' classe=' + classeNorm,
      500
    );
  }

  return valor;
}

/**
 * Valida e normaliza o payload de criação de corrida.
 * Ignora campos de controle interno (`usuarioId`, `status`, `valor`, `motoristaId`, `veiculoId`).
 */
function validarDadosCriacaoCorrida(dados) {
  if (!ehObjetoSimples(dados)) {
    throw new AppError('Corpo da requisicao invalido.', 400);
  }

  const origemNome  = exigirTexto(dados.origemNome, 'origemNome', { max: NOME_LOCAL_MAX });
  const destinoNome = exigirTexto(dados.destinoNome, 'destinoNome', { max: NOME_LOCAL_MAX });

  if (/^localiza[cç][aã]o\s+atual\s*\(gps\)$/i.test(origemNome)) {
    throw new AppError(
      'O endereço de origem obtido pelo GPS deve ser convertido em um endereço legível antes de solicitar a corrida.',
      400
    );
  }
  if (/^localiza[cç][aã]o\s+atual\s*\(gps\)$/i.test(destinoNome)) {
    throw new AppError(
      'O endereço de destino obtido pelo GPS deve ser convertido em um endereço legível antes de solicitar a corrida.',
      400
    );
  }

  const distanciaKm = exigirNumeroPositivo(dados.distanciaKm, 'distanciaKm');
  const duracaoMin  = numeroPositivoOpcional(dados.duracaoMin, 'duracaoMin', { inteiro: true });

  const classe         = enumOpcional(dados.classe, 'Classe', CLASSES_VALIDAS, 'NORMAL');
  const formaPagamento = enumOpcional(dados.formaPagamento, 'Forma de pagamento', FORMAS_PAGAMENTO_VALIDAS, 'DINHEIRO');

  const dataHorario = ausente(dados.dataHorario) ? new Date() : lerDataHorario(dados.dataHorario);

  const origemLat  = latitudeOpcional(dados.origemLat, 'origemLat');
  const origemLng  = longitudeOpcional(dados.origemLng, 'origemLng');
  const destinoLat = latitudeOpcional(dados.destinoLat, 'destinoLat');
  const destinoLng = longitudeOpcional(dados.destinoLng, 'destinoLng');

  // Validação pareada: lat e lng de origem/destino devem ser fornecidos juntos
  if (origemLat !== null && origemLng === null) {
    throw new AppError('origemLat e origemLng devem ser informados juntos.', 400);
  }
  if (origemLng !== null && origemLat === null) {
    throw new AppError('origemLat e origemLng devem ser informados juntos.', 400);
  }
  if (destinoLat !== null && destinoLng === null) {
    throw new AppError('destinoLat e destinoLng devem ser informados juntos.', 400);
  }
  if (destinoLng !== null && destinoLat === null) {
    throw new AppError('destinoLat e destinoLng devem ser informados juntos.', 400);
  }

  let polyline = null;
  if (!ausente(dados.polyline)) {
    if (typeof dados.polyline !== 'string') throw new AppError('polyline invalida: deve ser um texto.', 400);
    polyline = dados.polyline;
  }

  let rotaCaminho = [origemNome, destinoNome];
  if (!ausente(dados.rotaCaminho)) {
    if (!Array.isArray(dados.rotaCaminho) || dados.rotaCaminho.some((p) => typeof p !== 'string')) {
      throw new AppError('rotaCaminho invalido: deve ser uma lista de textos.', 400);
    }
    rotaCaminho = dados.rotaCaminho;
  }

  let rotasAlternativas = [];
  if (!ausente(dados.rotasAlternativas)) {
    if (!Array.isArray(dados.rotasAlternativas) || dados.rotasAlternativas.some((r) => !ehObjetoSimples(r))) {
      throw new AppError('rotasAlternativas invalido: deve ser uma lista de objetos.', 400);
    }
    rotasAlternativas = dados.rotasAlternativas;
  }

  const enderecos = {};
  for (const campo of ['origemEndereco', 'destinoEndereco']) {
    if (ausente(dados[campo])) {
      enderecos[campo] = null;
    } else if (!ehObjetoSimples(dados[campo])) {
      throw new AppError(`${campo} invalido: deve ser um objeto.`, 400);
    } else {
      enderecos[campo] = dados[campo];
    }
  }

  return {
    origemNome, destinoNome, distanciaKm, duracaoMin, classe, formaPagamento, dataHorario,
    origemLat, origemLng, destinoLat, destinoLng,
    polyline, rotaCaminho, rotasAlternativas, ...enderecos,
  };
}

module.exports = {
  TARIFAS_KM,
  determinarFaixaHorario,
  calcularValorCorrida,
  validarDadosCriacaoCorrida,
};

