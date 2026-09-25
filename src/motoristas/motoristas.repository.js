'use strict';
/**
 * motoristas.repository.js — Repositório de motoristas com PostgreSQL.
 *
 * Preserva as assinaturas originais:
 *   findAll()
 *   findById(id)
 *   findByUsuarioId(usuarioId)
 *   findByStatusCadastro(statusCadastro)
 *   findByStatusPresenca(statusPresenca)
 *   create(dados)
 *   updateStatusCadastro(id, statusCadastro)
 *   updateStatusPresenca(id, statusPresenca)
 *
 * Mapeamento: snake_case (banco) → camelCase (aplicação)
 *   usuario_id      → usuarioId
 *   status_cadastro → statusCadastro
 *   status_presenca → statusPresenca
 *   criado_em       → criadoEm
 *   atualizado_em   → atualizadoEm
 */

const { query } = require('../database/connection');

// ---------- Helper de mapeamento ----------

function rowParaDominio(row) {
  if (!row) return null;
  return {
    id:             row.id,
    usuarioId:      row.usuario_id,
    cnh:            row.cnh,
    statusCadastro: row.status_cadastro,
    statusPresenca: row.status_presenca,
    criadoEm:       row.criado_em,
    atualizadoEm:   row.atualizado_em,
  };
}

// ---------- MotoristasRepository ----------

class MotoristasRepository {
  /**
   * Lista todos os motoristas.
   * @returns {Promise<object[]>}
   */
  async findAll() {
    const res = await query(
      'SELECT * FROM motoristas ORDER BY criado_em ASC'
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Busca pelo id do registro de motorista.
   * @param {string} id - UUID do registro em motoristas
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const res = await query(
      'SELECT * FROM motoristas WHERE id = $1 LIMIT 1',
      [id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Busca pelo usuarioId — acesso típico pelo usuário autenticado.
   * @param {string} usuarioId
   * @returns {Promise<object|null>}
   */
  async findByUsuarioId(usuarioId) {
    const res = await query(
      'SELECT * FROM motoristas WHERE usuario_id = $1 LIMIT 1',
      [usuarioId]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Filtra por statusCadastro (PENDENTE | APROVADO | REJEITADO).
   * @param {string} statusCadastro
   * @returns {Promise<object[]>}
   */
  async findByStatusCadastro(statusCadastro) {
    const res = await query(
      'SELECT * FROM motoristas WHERE status_cadastro = $1 ORDER BY criado_em ASC',
      [statusCadastro]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Filtra por statusPresenca (ONLINE | OFFLINE).
   * Retorna apenas motoristas APROVADOS com a presença solicitada.
   * @param {string} statusPresenca
   * @returns {Promise<object[]>}
   */
  async findByStatusPresenca(statusPresenca) {
    const res = await query(
      `SELECT * FROM motoristas
       WHERE  status_cadastro = 'APROVADO'
         AND  status_presenca = $1
       ORDER BY criado_em ASC`,
      [statusPresenca]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Cria novo registro de motorista com statusCadastro=PENDENTE.
   * @param {object} dados - { usuarioId, cnh }
   * @returns {Promise<object>}
   */
  async create(dados) {
    const res = await query(
      `INSERT INTO motoristas (usuario_id, cnh, status_cadastro, status_presenca)
       VALUES ($1, $2, 'PENDENTE', 'OFFLINE')
       RETURNING *`,
      [dados.usuarioId, dados.cnh]
    );
    return rowParaDominio(res.rows[0]);
  }

  /**
   * Atualiza statusCadastro do motorista.
   * @param {string} id - UUID do registro de motorista
   * @param {string} statusCadastro
   * @returns {Promise<object|null>}
   */
  async updateStatusCadastro(id, statusCadastro) {
    const res = await query(
      `UPDATE motoristas
       SET status_cadastro = $1, atualizado_em = NOW()
       WHERE id = $2
       RETURNING *`,
      [statusCadastro, id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Atualiza statusPresenca do motorista.
   * @param {string} id - UUID do registro de motorista
   * @param {string} statusPresenca
   * @returns {Promise<object|null>}
   */
  async updateStatusPresenca(id, statusPresenca) {
    const res = await query(
      `UPDATE motoristas
       SET status_presenca = $1, atualizado_em = NOW()
       WHERE id = $2
       RETURNING *`,
      [statusPresenca, id]
    );
    return rowParaDominio(res.rows[0] || null);
  }
}

module.exports = new MotoristasRepository();
