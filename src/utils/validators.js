/**
 * validators.js — Funções de validação centralizadas
 */

const validarCPF = (cpf) => {
  if (!cpf) return false;
  const limpo = cpf.replace(/\D/g, '');
  if (limpo.length !== 11) return false;
  
  // Evita CPFs repetidos
  if (/^(\d)\1+$/.test(limpo)) return false;

  /* // VERIFICACAO DE CPF EXISTENTE COMENTADA
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
  */

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

  /* // VERIFICACAO DE CNH EXISTENTE COMENTADA
  let soma = 0;
  let d1 = 0;
  let d2 = 0;
  let mult = 9;

  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i)) * mult;
    mult--;
  }
  
  let resto = soma % 11;
  if (resto === 10) d1 = 0;
  else d1 = resto;

  soma = 0;
  mult = 1;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(limpo.charAt(i)) * mult;
    mult++;
  }

  resto = soma % 11;
  if (resto === 10) d2 = 0;
  else d2 = resto;

  if (d1 !== parseInt(limpo.charAt(9)) || d2 !== parseInt(limpo.charAt(10))) {
    return false;
  }
  */

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
