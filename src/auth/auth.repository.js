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

  /**
   * Cria novo usuário (cadastro público).
   * Em banco: INSERT INTO usuarios ...
   * @param {object} dados - { nome, usuario, senha, perfil }
   * @returns {object}
   */
  create(dados) {
    const novo = {
      id: String(usuarios.length + 1),
      nome: dados.nome,
      usuario: dados.usuario,
      senha: dados.senha,
      perfil: dados.perfil,
      criadoEm: new Date().toISOString(),
    };
    usuarios.push(novo);
    return novo;
  }
}

module.exports = new AuthRepository();
