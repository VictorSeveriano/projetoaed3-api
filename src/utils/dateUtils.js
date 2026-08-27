/**
 * Utilitarios para manipulacao de datas.
 */

const parseDate = (dateStr) => new Date(dateStr);

const isValidDate = (dateStr) => {
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

const datesOverlap = (inicio1, fim1, inicio2, fim2) => {
  return parseDate(inicio1) <= parseDate(fim2) && parseDate(fim1) >= parseDate(inicio2);
};

const isEndAfterStart = (dataInicio, dataFim) => {
  return parseDate(dataFim) > parseDate(dataInicio);
};

module.exports = { parseDate, isValidDate, datesOverlap, isEndAfterStart };
