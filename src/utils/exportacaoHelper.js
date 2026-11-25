'use strict';
/**
 * exportacaoHelper.js — Utilitários compartilhados de formatação, escapamento CSV (UTF-8 + BOM)
 * e carimbo temporal no fuso de negócio (`America/Sao_Paulo`) para relatórios exportáveis.
 */

const AppError = require('./AppError');
const { BUSINESS_TIMEZONE } = require('./constants');

const FORMATOS_EXPORTACAO_VALIDOS = Object.freeze(['csv', 'pdf']);

function validarFormatoExportacao(formatoBruto) {
  const formato = formatoBruto ? String(formatoBruto).trim().toLowerCase() : 'csv';
  if (!FORMATOS_EXPORTACAO_VALIDOS.includes(formato)) {
    throw new AppError(`Formato de exportação inválido: '${formatoBruto}'. Use csv ou pdf.`, 400);
  }
  return formato;
}

function formatarDataHoraBr(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatarDataCurtaBr(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatarMoedaBr(valor) {
  const num = Number(valor || 0);
  return `R$ ${num.toFixed(2).replace('.', ',')}`;
}

function formatarCpfMascarado(cpf) {
  if (!cpf) return '—';
  const d = String(cpf).replace(/\D/g, '');
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function formatarCelularBr(celular) {
  if (!celular) return '—';
  const d = String(celular).replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return celular;
}

function escaparCelulaCsv(valor, delimitador = ';') {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (/^[=+@]/.test(texto)) {
    texto = `'${texto}`;
  }

  if (
    texto.includes(delimitador) ||
    texto.includes('"') ||
    texto.includes(',') ||
    texto.includes('\n')
  ) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

function montarCsvComBom(linhasMatrizes, delimitador = ';') {
  const linhasFormatadas = linhasMatrizes.map((linha) => {
    if (!Array.isArray(linha) || linha.length === 0) return '';
    return linha.map((celula) => escaparCelulaCsv(celula, delimitador)).join(delimitador);
  });
  return '\uFEFF' + linhasFormatadas.join('\r\n') + '\r\n';
}

function gerarCarimboArquivo(agora = new Date()) {
  return agora
    .toLocaleString('sv-SE', { timeZone: BUSINESS_TIMEZONE })
    .replace(/[: ]/g, '-')
    .slice(0, 16);
}

function enviarArquivoExportado(res, { buffer, contentType, filename }) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(buffer);
}

module.exports = {
  FORMATOS_EXPORTACAO_VALIDOS,
  validarFormatoExportacao,
  formatarDataHoraBr,
  formatarDataCurtaBr,
  formatarMoedaBr,
  formatarCpfMascarado,
  formatarCelularBr,
  escaparCelulaCsv,
  montarCsvComBom,
  gerarCarimboArquivo,
  enviarArquivoExportado,
};
