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
   * Lista todos os usuários, suportando filtros e busca.
   * Usado na área administrativa.
   * @param {object} filtros
   * @returns {object[]}
   */
  listarTodos(filtros = {}) {
    let lista = authRepository.findAll();

    if (filtros.perfil) {
      lista = lista.filter((u) => u.perfil === filtros.perfil.toUpperCase());
    }
    
    if (filtros.search) {
      const termo = filtros.search.toLowerCase().trim();
      lista = lista.filter((u) => 
        (u.nome && u.nome.toLowerCase().includes(termo)) ||
        (u.usuario && u.usuario.toLowerCase().includes(termo))
      );
    }

    // Mapear para remover senha
    return lista.map((u) => {
      const { senha, ...dadosSeguros } = u;
      return dadosSeguros;
    });
  }

  /**
   * Atualiza dados permitidos de um usuário.
   * A alteração de perfil via este método é bloqueada por segurança.
   * @param {string} id
   * @param {object} dados
   * @returns {object}
   */
  atualizar(id, dados) {
    const user = authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Usuário não encontrado.', 404);

    if (dados.perfil && dados.perfil !== user.perfil) {
      throw new AppError('A alteração de perfil não é permitida por esta rota.', 403);
    }
    
    if (dados.usuario && dados.usuario !== user.usuario) {
      const existente = authRepository.encontrarPorUsuario(dados.usuario);
      if (existente && existente.id !== id) {
        throw new AppError('Este nome de usuário já está em uso.', 409);
      }
    }

    const updated = authRepository.update(id, dados);
    const { senha, ...dadosSeguros } = updated;
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
