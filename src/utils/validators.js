/**
 * validators.js — Funções de validação centralizadas
 */

/**
 * Calcula um dígito verificador do CPF usando o algoritmo da Receita Federal.
 * @param {string} parcial - Primeiros N dígitos do CPF (sem formatação)
 * @param {number} pesoInicial - Peso inicial (N+1)
 * @returns {number} Dígito verificador esperado (0-9)
 */
function calcularDigitoCPF(parcial, pesoInicial) {
  let soma = 0;
  for (let i = 0; i < parcial.length; i++) {
    soma += parseInt(parcial[i], 10) * (pesoInicial - i);
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const validarCPF = (cpf) => {
  if (!cpf) return false;
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;

  // Rejeita CPFs com todos os dígitos iguais (ex.: 111.111.111-11)
  if (/^(\d)\1+$/.test(limpo)) return false;

  // Valida o primeiro dígito verificador (posição 9)
  const primeiroDigito = calcularDigitoCPF(limpo.slice(0, 9), 10);
  if (primeiroDigito !== parseInt(limpo[9], 10)) return false;

  // Valida o segundo dígito verificador (posição 10)
  const segundoDigito = calcularDigitoCPF(limpo.slice(0, 10), 11);
  if (segundoDigito !== parseInt(limpo[10], 10)) return false;

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

const validarCNH = (cnh) => {
  if (!cnh) return false;
  const limpo = cnh.replace(/\D/g, '');
  if (limpo.length !== 11) return false;

  if (/^(\d)\1+$/.test(limpo)) return false;

  // A validação dos dígitos verificadores da CNH não está implementada.
  // O algoritmo varia por estado e requer integração com o DETRAN para verificação confiável.

  return true;
};

const normalizarCNH = (cnh) => {
  if (!cnh) return '';
  return cnh.replace(/\D/g, '');
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

const validarSenha = (senha, nomeUsuario = '') => {
  if (!senha || senha.length < 8) return 'A senha deve possuir no mínimo 8 caracteres.';
  if (!/\d/.test(senha)) return 'A senha deve possuir pelo menos um número.';
  if (!/[!@#$%&*?]/.test(senha)) return 'A senha deve possuir pelo menos um caractere especial.';
  
  if (/^(.)\1+$/.test(senha)) return 'Evite sequências ou repetições, como 11111111.';
  
  const sequencias = ['123456', '987654', 'abcdef', 'qwerty', 'asdfgh'];
  for (let seq of sequencias) {
    if (senha.toLowerCase().includes(seq)) return 'Evite sequências ou repetições, como 123456789.';
  }

  if (nomeUsuario) {
    const senhaNorm = senha.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const partesNome = nomeUsuario
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .split(' ')
      .filter(p => p.length > 2);
      
    for (let parte of partesNome) {
      if (senhaNorm.includes(parte)) return 'A senha não pode conter seu nome ou sobrenome.';
    }
  }

  return null;
};

module.exports = {
  validarCPF,
  validarCNH,
  validarEmail,
  validarCelular,
  validarCEP,
  validarSenha,
  normalizarCPF,
  normalizarCNH,
  normalizarEmail,
  normalizarCelular,
};
