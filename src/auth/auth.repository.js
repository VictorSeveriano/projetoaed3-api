const usuarios = require('../data/usuarios.data');

/**
 * AuthRepository — Camada de acesso a dados de usuarios.
 * Abstrai o acesso ao armazenamento, facilitando futura migracao para banco de dados.
 */
class AuthRepository {
  findAll() {
    return [...usuarios];
  }

  encontrarPorUsuario(usuario) {
    return usuarios.find((u) => u.usuario === usuario) || null;
  }

  encontrarPorId(id) {
    return usuarios.find((u) => u.id === id) || null;
  }

  existsByCpf(cpf) {
    return usuarios.some((u) => u.cpf === cpf);
  }

  existsByEmail(email) {
    return usuarios.some((u) => u.email === email);
  }

  /**
   * Cria novo usuário (cadastro público).
   * Em banco: INSERT INTO usuarios ...
   * @param {object} dados
   * @returns {object}
   */
  create(dados) {
    const novo = {
      id: String(usuarios.length + 1),
      nome: dados.nome,
      cpf: dados.cpf,
      celular: dados.celular,
      email: dados.email,
      usuario: dados.usuario,
      senha: dados.senha,
      perfil: dados.perfil,
      endereco: dados.endereco,
      criadoEm: new Date().toISOString(),
    };
    usuarios.push(novo);
    return novo;
  }

  /**
   * Atualiza dados de um usuário existente.
   * @param {string} id
   * @param {object} dados
   * @returns {object|null}
   */
  update(id, dados) {
    const index = usuarios.findIndex((u) => u.id === id);
    if (index === -1) return null;
    
    // Atualiza apenas campos permitidos recebidos
    if (dados.nome !== undefined) usuarios[index].nome = dados.nome;
    if (dados.usuario !== undefined) usuarios[index].usuario = dados.usuario;
    if (dados.cpf !== undefined) usuarios[index].cpf = dados.cpf;
    if (dados.celular !== undefined) usuarios[index].celular = dados.celular;
    if (dados.email !== undefined) usuarios[index].email = dados.email;
    if (dados.endereco !== undefined) usuarios[index].endereco = dados.endereco;
    
    // NOTA: a edicao do perfil foi intencionalmente deixada de fora (secao 15)
    
    return usuarios[index];
  }
}

module.exports = new AuthRepository();
