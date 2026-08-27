const authRepository = require('./auth.repository');
const AppError = require('../utils/AppError');

/**
 * AuthService — Regras de negocio relacionadas a autenticacao.
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

    // Simula emissao de token de sessao
    // Em producao: JWT com bcrypt
    const token = 'session-admin-token';

    return {
      token,
      usuario: {
        id: user.id,
        nome: user.nome,
        usuario: user.usuario,
      },
    };
  }
}

module.exports = new AuthService();
