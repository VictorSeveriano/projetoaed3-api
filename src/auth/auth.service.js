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
const notificacoesService = require('../notificacoes/notificacoes.service');
const AppError = require('../utils/AppError');
const bcrypt = require('bcryptjs');
const {
  validarCPF, validarCNH, validarEmail, validarCelular, validarCEP, validarSenha,
  normalizarCPF, normalizarCNH, normalizarEmail, normalizarCelular,
} = require('../utils/validators');
const { ADMIN_ID } = require('../utils/constants');

class AuthService {
  async login(usuario, senha) {
    if (!usuario || !senha) {
      throw new AppError('Usuario e senha sao obrigatorios.', 400);
    }
    const user = await authRepository.encontrarPorUsuario(usuario);
    if (!user) {
      throw new AppError('Credenciais invalidas.', 401);
    }

    const senhaEmHash = /^\$2[aby]\$\d{2}\$/.test(user.senha);
    const senhaValida = senhaEmHash
      ? await bcrypt.compare(senha, user.senha)
      : user.senha === senha;
    if (!senhaValida) {
      throw new AppError('Credenciais invalidas.', 401);
    }

    if (!senhaEmHash) {
      const senhaHash = await bcrypt.hash(senha, 10);
      await authRepository.atualizarSenha(user.id, senhaHash);
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

  async verificarDisponibilidadeCadastro({ cpf, email, perfil, cnh }) {
    if (!['USUARIO', 'MOTORISTA'].includes(perfil)) {
      throw new AppError('perfil deve ser USUARIO ou MOTORISTA.', 400);
    }

    const cpfNorm = normalizarCPF(cpf);
    const emailNorm = normalizarEmail(email);
    if (!validarCPF(cpfNorm)) throw new AppError('CPF inválido.', 400);
    if (!validarEmail(emailNorm)) throw new AppError('E-mail inválido.', 400);

    const [cpfDuplicado, emailDuplicado] = await Promise.all([
      authRepository.existsByCpf(cpfNorm),
      authRepository.existsByEmail(emailNorm),
    ]);
    const duplicados = { cpf: cpfDuplicado, email: emailDuplicado };

    if (perfil === 'MOTORISTA') {
      const cnhNorm = normalizarCNH(cnh);
      if (!validarCNH(cnhNorm)) throw new AppError('CNH inválida.', 400);
      const motoristasRepository = require('../motoristas/motoristas.repository');
      duplicados.cnh = await motoristasRepository.existsByCnh(cnhNorm);
    }

    return { duplicados };
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

  async executarCadastro(dados, perfisPermitidos) {
    const { nome, cpf, celular, email, senha, perfil, endereco, cnh } = dados;

    if (!perfisPermitidos.includes(perfil)) {
      throw new AppError(`perfil deve ser ${perfisPermitidos.join(', ')}.`, 400);
    }
    if (!nome || !cpf || !celular || !email || !senha) {
      throw new AppError('Nome, CPF, celular, e-mail e senha são obrigatórios.', 400);
    }
    
    if (perfil !== 'ADMINISTRADOR') {
      if (!endereco || !endereco.rua || !endereco.bairro || !endereco.cidade || !endereco.estado || !endereco.numero || !endereco.cep) {
        throw new AppError('Endereço completo é obrigatório (rua, bairro, cidade, estado, número, cep).', 400);
      }
    }

    if (perfil === 'MOTORISTA' && !cnh) {
      throw new AppError('CNH é obrigatória para motoristas.', 400);
    }

    const cpfNorm     = normalizarCPF(cpf);
    const celularNorm = normalizarCelular(celular);
    const emailNorm   = normalizarEmail(email);
    let cnhNorm = null;
    
    if (perfil === 'MOTORISTA') {
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
    if (perfil !== 'ADMINISTRADOR' && !validarCEP(endereco.cep)) throw new AppError('CEP inválido.', 400);

    const senhaError = validarSenha(senha, nome);
    if (senhaError) throw new AppError(senhaError, 400);

    if (await authRepository.existsByCpf(cpfNorm))    throw new AppError('CPF já cadastrado no sistema.', 409);
    if (await authRepository.existsByEmail(emailNorm)) throw new AppError('E-mail já cadastrado no sistema.', 409);

    const usuario = await this._gerarLogin(nome);

    let novoUsuario;
    try {
      const salt = await bcrypt.genSalt(10);
      const senhaHash = await bcrypt.hash(senha, salt);
      
      novoUsuario = await authRepository.create({
        nome, cpf: cpfNorm, celular: celularNorm, email: emailNorm,
        usuario, senha: senhaHash, perfil, endereco,
      });
    } catch (error) {
      if (error.code !== 'P2002') throw error;

      const alvo = Array.isArray(error.meta?.target)
        ? error.meta.target.join(' ').toLowerCase()
        : String(error.meta?.target || '').toLowerCase();
      if (alvo.includes('cpf')) throw new AppError('CPF já cadastrado no sistema.', 409);
      if (alvo.includes('email')) throw new AppError('E-mail já cadastrado no sistema.', 409);
      throw new AppError('Já existe um cadastro com esses dados.', 409);
    }

    if (perfil === 'MOTORISTA') {
      const motoristasService = require('../motoristas/motoristas.service');
      await motoristasService.solicitar(novoUsuario.id, cnhNorm);
    }

    return novoUsuario;
  }

  /**
   * Cria nova conta pública (USUARIO ou MOTORISTA).
   * Nunca cria ADMINISTRADOR pelo fluxo público.
   * @param {object} dados - { nome, cpf, celular, email, senha, perfil, endereco, cnh }
   * @returns {Promise<{ token, usuario }>}
   */
  async cadastrar(dados) {
    const novoUsuario = await this.executarCadastro(dados, ['USUARIO', 'MOTORISTA']);
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
