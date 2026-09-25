'use strict';
/**
 * notificacoes.repository.js — Repositório de notificações com PostgreSQL.
 *
 * Preserva as assinaturas originais:
 *   findByDestinatario(destinatarioId)
 *   findNaoLidas(destinatarioId)
 *   create(dados)
 *   marcarLida(id)
 *   marcarTodasLidas(destinatarioId)
 *
 * Mapeamento: snake_case (banco) → camelCase (aplicação)
 *   destinatario_id → destinatarioId
 *   referencia_id   → referenciaId
 *   criada_em       → criadaEm
 */

const { query } = require('../database/connection');

// ---------- Helper de mapeamento ----------

function rowParaDominio(row) {
  if (!row) return null;
  return {
    id:              row.id,
    destinatarioId:  row.destinatario_id,
    tipo:            row.tipo,
    titulo:          row.titulo,
    mensagem:        row.mensagem,
    referenciaId:    row.referencia_id || null,
    lida:            row.lida,
    criadaEm:        row.criada_em,
  };
}

// ---------- NotificacoesRepository ----------

class NotificacoesRepository {
  /**
   * Notificações de um destinatário, mais recentes primeiro.
   * @param {string} destinatarioId
   * @returns {Promise<object[]>}
   */
  async findByDestinatario(destinatarioId) {
    const res = await query(
      `SELECT * FROM notificacoes
       WHERE  destinatario_id = $1
       ORDER BY criada_em DESC`,
      [destinatarioId]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Notificações não lidas de um destinatário.
   * @param {string} destinatarioId
   * @returns {Promise<object[]>}
   */
  async findNaoLidas(destinatarioId) {
    const res = await query(
      `SELECT * FROM notificacoes
       WHERE  destinatario_id = $1 AND lida = FALSE
       ORDER BY criada_em DESC`,
      [destinatarioId]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Cria nova notificação.
   * @param {object} dados - { destinatarioId, tipo, titulo, mensagem, referenciaId? }
   * @returns {Promise<object>}
   */
  async create(dados) {
    const res = await query(
      `INSERT INTO notificacoes (destinatario_id, tipo, titulo, mensagem, referencia_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        dados.destinatarioId,
        dados.tipo,
        dados.titulo,
        dados.mensagem,
        dados.referenciaId || null,
      ]
    );
    return rowParaDominio(res.rows[0]);
  }

  /**
   * Marca uma notificação como lida.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async marcarLida(id) {
    const res = await query(
      'UPDATE notificacoes SET lida=TRUE WHERE id=$1 RETURNING *',
      [id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Marca todas as notificações de um destinatário como lidas.
   * @param {string} destinatarioId
   * @returns {Promise<void>}
   */
  async marcarTodasLidas(destinatarioId) {
    await query(
      'UPDATE notificacoes SET lida=TRUE WHERE destinatario_id=$1',
      [destinatarioId]
    );
  }
}

module.exports = new NotificacoesRepository();
