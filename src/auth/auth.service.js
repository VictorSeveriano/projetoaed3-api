const authRepository = require('./auth.repository');
const AppError = require('../utils/AppError');

/**
 * AuthService — Regras de negócio relacionadas à autenticação.
 *
 * NOTA: Login simulado sem JWT por enquanto.
 * Estrutura preparada para adicionar JWT e bcrypt futuramente.
 *
 * Retorna `perfil` no objeto usuario para que o frontend possa
 * montar a navegação correta sem consultar endpoint adicional.
 * Nunca retorna senha.
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

    // Simula emissão de token de sessão
    // Em produção: JWT com bcrypt e payload contendo id + perfil
    const token = `session-token-${user.id}`;

    // Nunca expor senha na resposta
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
}

module.exports = new AuthService();
