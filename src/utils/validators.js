/**
 * validators.js — Funções de validação centralizadas
 */

const validarCPF = (cpf) => {
  if (!cpf) return false;
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  
  // Evita CPFs repetidos
  if (/^(\d)\1+$/.test(limpo)) return false;

  let soma = 0;
  let resto;

  for (let i = 1; i <= 9; i++) {
    soma = soma + parseInt(limpo.substring(i - 1, i)) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.substring(9, 10))) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) {
    soma = soma + parseInt(limpo.substring(i - 1, i)) * (12 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(limpo.substring(10, 11))) return false;

  return true;
};

const validarEmail = (email) => {
  if (!email) return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const normalizarCPF = (cpf) => {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '');
};

const normalizarEmail = (email) => {
  if (!email) return '';
  return email.trim().toLowerCase();
};

const normalizarCelular = (celular) => {
  if (!celular) return '';
  return celular.replace(/\D/g, '');
};

const validarCelular = (celular) => {
  const normalizado = normalizarCelular(celular);
  // Celular no Brasil normalmente tem 10 ou 11 dígitos com o DDD
  return normalizado.length >= 10 && normalizado.length <= 11;
};

const validarCEP = (cep) => {
  if (!cep) return false;
  const limpo = cep.replace(/\D/g, '');
  return limpo.length === 8;
};

module.exports = {
  validarCPF,
  validarEmail,
  validarCelular,
  validarCEP,
  normalizarCPF,
  normalizarEmail,
  normalizarCelular,
};
