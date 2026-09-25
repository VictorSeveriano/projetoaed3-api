const authRepository = require('./auth.repository');
const AppError = require('../utils/AppError');

/**
 * AuthService — Regras de negócio relacionadas à autenticação.
 *
 * NOTA: Login simulado sem JWT por enquanto.
 * Estrutura preparada para adicionar JWT e bcrypt futuramente.
 */
class AuthService {
  login(usuario, senha) {
    if (!usuario || !senha) {
      throw new AppError('Usuario e senha sao obrigatorios.', 400);
    }
    const user = authRepository.encontrarPorUsuario(usuario);
    if (!user || user.senha !== senha) {
      throw new AppError('Credenciais invalidas.', 401);
    }
    const token = `session-token-${user.id}`;
    return {
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
        perfil: user.perfil,
      },
    };
  }

  /**
   * Cria nova conta pública (USUARIO ou MOTORISTA).
   * Nunca cria ADMINISTRADOR pelo fluxo público.
   * @param {object} dados - { nome, usuario, senha, perfil }
   * @returns {{ token, usuario }}
   */
  cadastrar(dados) {
    const { nome, usuario, senha, perfil } = dados;

    // Usuário já existe?
    const existente = authRepository.encontrarPorUsuario(usuario);
    if (existente) throw new AppError('Nome de usuário já está em uso.', 409);

    const perfilValidos = ['USUARIO', 'MOTORISTA'];
    if (!perfilValidos.includes(perfil)) {
      throw new AppError('perfil deve ser USUARIO ou MOTORISTA.', 400);
    }

    const novoUsuario = authRepository.create({ nome, usuario, senha, perfil });
    const token = `session-token-${novoUsuario.id}`;
    return {
      token,
      usuario: {
        id: novoUsuario.id,
        nome: novoUsuario.nome,
        usuario: novoUsuario.usuario,
        perfil: novoUsuario.perfil,
      },
    };
  }
}

module.exports = new AuthService();
