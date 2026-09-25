const motoristasData = require('../data/motoristas.data');

/**
 * MotoristasRepository — Acesso aos dados de motoristas.
 *
 * Implementação em memória; para migrar ao banco substituir os métodos
 * por queries ORM/SQL mantendo as mesmas assinaturas.
 *
 * Motorista é uma entidade separada de Usuario:
 *   Motorista.usuarioId → Usuario.id (sem duplicar dados do usuário aqui)
 */
class MotoristasRepository {
  constructor() {
    this._motoristas = [...motoristasData];
    this._nextId = this._motoristas.length + 1;
  }

  /** @returns {object[]} */
  findAll() {
    return [...this._motoristas];
  }

  /**
   * @param {string} id - id do registro de motorista (ex: 'm1')
   * @returns {object|null}
   */
  findById(id) {
    return this._motoristas.find((m) => m.id === id) || null;
  }

  /**
   * Busca pelo usuarioId — acesso típico pelo usuário autenticado.
   * @param {string} usuarioId
   * @returns {object|null}
   */
  findByUsuarioId(usuarioId) {
    return this._motoristas.find((m) => m.usuarioId === usuarioId) || null;
  }

  /**
   * Filtra por statusCadastro (PENDENTE | APROVADO | REJEITADO).
   * @param {string} statusCadastro
   * @returns {object[]}
   */
  findByStatusCadastro(statusCadastro) {
    return this._motoristas.filter((m) => m.statusCadastro === statusCadastro);
  }

  /**
   * Filtra por statusPresenca (ONLINE | OFFLINE).
   * Relevante apenas para motoristas APROVADOS.
   * @param {string} statusPresenca
   * @returns {object[]}
   */
  findByStatusPresenca(statusPresenca) {
    return this._motoristas.filter(
      (m) => m.statusCadastro === 'APROVADO' && m.statusPresenca === statusPresenca
    );
  }

  /**
   * Cria novo registro de motorista.
   * @param {object} dados - { usuarioId, cnh }
   * @returns {object}
   */
  create(dados) {
    const novo = {
      id: 'm' + String(this._nextId++),
      usuarioId: dados.usuarioId,
      cnh: dados.cnh,
      statusCadastro: 'PENDENTE',
      statusPresenca: 'OFFLINE',
      criadoEm: new Date().toISOString(),
    };
    this._motoristas.push(novo);
    return novo;
  }

  /**
   * Atualiza statusCadastro do motorista.
   * @param {string} id
   * @param {string} statusCadastro
   * @returns {object|null}
   */
  updateStatusCadastro(id, statusCadastro) {
    const m = this.findById(id);
    if (!m) return null;
    m.statusCadastro = statusCadastro;
    return m;
  }

  /**
   * Atualiza statusPresenca do motorista.
   * @param {string} id
   * @param {string} statusPresenca
   * @returns {object|null}
   */
  updateStatusPresenca(id, statusPresenca) {
    const m = this.findById(id);
    if (!m) return null;
    m.statusPresenca = statusPresenca;
    return m;
  }
}

module.exports = new MotoristasRepository();
