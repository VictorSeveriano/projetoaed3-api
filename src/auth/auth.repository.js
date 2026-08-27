const usuarios = require('../data/usuarios.data');

/**
 * AuthRepository — Camada de acesso a dados de usuarios.
 * Abstrai o acesso ao armazenamento, facilitando futura migracao para banco de dados.
 */
class AuthRepository {
  encontrarPorUsuario(usuario) {
    return usuarios.find((u) => u.usuario === usuario) || null;
  }

  encontrarPorId(id) {
    return usuarios.find((u) => u.id === id) || null;
  }
}

module.exports = new AuthRepository();
