const authRepository = require('../auth/auth.repository');
const corridasRepository = require('../corridas/corridas.repository');
const AppError = require('../utils/AppError');

/**
 * UsuariosService — Consulta de dados do usuário e suas corridas.
 *
 * Responsabilidade: retornar apenas dados do próprio usuário autenticado.
 * A filtragem por usuarioId ocorre aqui — nunca no frontend.
 */
class UsuariosService {
  /**
   * Retorna dados do usuário sem senha.
   * @param {string} id
   * @returns {object}
   */
  buscarPorId(id) {
    const user = authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Usuário não encontrado.', 404);
    // Nunca retornar senha
    const { senha, ...dadosSeguros } = user;
    return dadosSeguros;
  }

  /**
   * Lista corridas do usuário autenticado.
   * @param {string} usuarioId
   * @returns {Corrida[]}
   */
  listarCorridas(usuarioId) {
    return corridasRepository.findByUsuarioId(usuarioId);
  }
}

module.exports = new UsuariosService();
