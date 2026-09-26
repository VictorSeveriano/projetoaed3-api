'use strict';
/**
 * auth.service.js — Regras de negócio relacionadas à autenticação.
 *
 * NOTA: Login simulado sem JWT por enquanto.
 * Estrutura preparada para adicionar JWT e bcrypt futuramente.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 */

const authRepository = require('./auth.repository');
const motoristasService = require('../motoristas/motoristas.service');
const AppError = require('../utils/AppError');
const {
  validarCPF, validarEmail, validarCelular, validarCEP, validarSenha,
  normalizarCPF, normalizarEmail, normalizarCelular,
} = require('../utils/validators');

class AuthService {
  async login(usuario, senha) {
    if (!usuario || !senha) {
      throw new AppError('Usuario e senha sao obrigatorios.', 400);
    }
    const user = await authRepository.encontrarPorUsuario(usuario);
    if (!user || user.senha !== senha) {
      throw new AppError('Credenciais invalidas.', 401);
    }
    const token = `session-token-${user.id}`;
    return {
      token,
      usuario: {
        id:      user.id,
        nome:    user.nome,
        usuario: user.usuario,
        perfil:  user.perfil,
      },
    };
  }

  /**
   * Gera um login determinístico único baseado no nome.
   * Mantém a mesma lógica original — agora async para verificar unicidade no banco.
   * @param {string} nome
   * @returns {Promise<string>}
   */
  async _gerarLogin(nome) {
    if (!nome) return 'usuario';
    const partes = nome
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(' ')
      .filter((p) => p.length > 0);

    if (partes.length === 0) return 'usuario';

    const pNome = partes[0];
    const uNome = partes.length > 1 ? partes[partes.length - 1] : '';

    const tentativas = [
      () => pNome + uNome,
      () => pNome + (partes.length > 2 ? partes[1] : '') + uNome,
      () => pNome + partes.slice(1).join(''),
      () => pNome + (uNome ? uNome[0] : ''),
      () => pNome + (partes.length > 2 ? partes[1][0] : '') + (uNome ? uNome[0] : ''),
    ];

    for (let t of tentativas) {
      const tentativaLogin = t();
      if (!(await authRepository.encontrarPorUsuario(tentativaLogin))) {
        return tentativaLogin;
      }
    }

    // Fallback sequencial
    let idx = 1;
    while (true) {
      const tentativa = pNome + uNome + idx;
      if (!(await authRepository.encontrarPorUsuario(tentativa))) {
        return tentativa;
      }
      idx++;
    }
  }

  /**
   * Cria nova conta pública (USUARIO ou MOTORISTA).
   * Nunca cria ADMINISTRADOR pelo fluxo público.
   * @param {object} dados - { nome, cpf, celular, email, senha, perfil, endereco, cnh }
   * @returns {Promise<{ token, usuario }>}
   */
  async cadastrar(dados) {
    const { nome, cpf, celular, email, senha, perfil, endereco, cnh } = dados;

    const perfilValidos = ['USUARIO', 'MOTORISTA'];
    if (!perfilValidos.includes(perfil)) {
      throw new AppError('perfil deve ser USUARIO ou MOTORISTA.', 400);
    }
    if (!nome || !cpf || !celular || !email || !senha) {
      throw new AppError('Nome, CPF, celular, e-mail e senha são obrigatórios.', 400);
    }
    if (!endereco || !endereco.rua || !endereco.bairro || !endereco.cidade || !endereco.estado || !endereco.numero || !endereco.cep) {
      throw new AppError('Endereço completo é obrigatório (rua, bairro, cidade, estado, número, cep).', 400);
    }
    if (perfil === 'MOTORISTA' && !cnh) {
      throw new AppError('CNH é obrigatória para motoristas.', 400);
    }

    const cpfNorm     = normalizarCPF(cpf);
    const celularNorm = normalizarCelular(celular);
    const emailNorm   = normalizarEmail(email);
    let cnhNorm = null;
    
    if (perfil === 'MOTORISTA') {
      const { normalizarCNH, validarCNH } = require('../utils/validators');
      cnhNorm = normalizarCNH(cnh);
      if (!validarCNH(cnhNorm)) throw new AppError('CNH inválida.', 400);
      const motoristasRepository = require('../motoristas/motoristas.repository');
      if (await motoristasRepository.existsByCnh(cnhNorm)) {
        throw new AppError('CNH já cadastrada no sistema.', 409);
      }
    }

    if (!validarCPF(cpfNorm))        throw new AppError('CPF inválido.', 400);
    if (!validarCelular(celularNorm)) throw new AppError('Celular inválido.', 400);
    if (!validarEmail(emailNorm))     throw new AppError('E-mail inválido.', 400);
    if (!validarCEP(endereco.cep))    throw new AppError('CEP inválido.', 400);

    const senhaError = validarSenha(senha, nome);
    if (senhaError) throw new AppError(senhaError, 400);

    if (await authRepository.existsByCpf(cpfNorm))    throw new AppError('CPF já cadastrado no sistema.', 409);
    if (await authRepository.existsByEmail(emailNorm)) throw new AppError('E-mail já cadastrado no sistema.', 409);

    const usuario = await this._gerarLogin(nome);

    const novoUsuario = await authRepository.create({
      nome, cpf: cpfNorm, celular: celularNorm, email: emailNorm,
      usuario, senha, perfil, endereco,
    });

    if (perfil === 'MOTORISTA') {
      await motoristasService.solicitar(novoUsuario.id, cnhNorm);
    }

    const token = `session-token-${novoUsuario.id}`;
    return {
      token,
      usuario: {
        id:       novoUsuario.id,
        nome:     novoUsuario.nome,
        usuario:  novoUsuario.usuario,
        perfil:   novoUsuario.perfil,
        email:    novoUsuario.email,
        celular:  novoUsuario.celular,
      },
    };
  }
}

module.exports = new AuthService();
