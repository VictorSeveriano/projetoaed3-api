'use strict';
/**
 * veiculos.repository.js — Repositório de veículos com PostgreSQL.
 *
 * Preserva as assinaturas originais:
 *   findAll()
 *   findById(id)
 *   findDisponiveis()
 *   findByStatus(status)
 *   findByMotoristaId(motoristaId)
 *   findByStatusAprovacao(statusAprovacao)
 *   updateStatusAprovacao(id, statusAprovacao, classe)
 *   updateStatus(id, status)
 *   updateClasse(id, classe)
 *   create(dados)
 *
 * DECISÃO DE DESIGN:
 *   motoristaId → veiculos.motorista_id → usuarios.id
 *   O veículo referencia o usuarioId do motorista (não o id de motoristas).
 *   Isso preserva a decisão original do projeto.
 *
 * Mapeamento: snake_case (banco) → camelCase (aplicação)
 *   motorista_id               → motoristaId
 *   status_aprovacao           → statusAprovacao
 *   quantidade_passageiros     → quantidadePassageiros
 *   possui_ar_condicionado     → possuiArCondicionado
 *   possui_extintor            → possuiExtintor
 *   possui_cinto_seguranca     → possuiCintoSeguranca
 *   documentacao_regularizada  → documentacaoRegularizada
 *   tarifa_base                → tarifaBase
 *   criado_em                  → criadoEm
 *   atualizado_em              → atualizadoEm
 */

const { query } = require('../database/connection');

// ---------- Helper de mapeamento ----------

function rowParaDominio(row) {
  if (!row) return null;
  return {
    id:                       row.id,
    marca:                    row.marca,
    modelo:                   row.modelo,
    ano:                      row.ano,
    placa:                    row.placa,
    cor:                      row.cor,
    porte:                    row.porte,
    classe:                   row.classe,
    quilometragem:            row.quilometragem    ? parseFloat(row.quilometragem)  : 0,
    quantidadePassageiros:    row.quantidade_passageiros,
    possuiArCondicionado:     row.possui_ar_condicionado,
    possuiExtintor:           row.possui_extintor,
    possuiCintoSeguranca:     row.possui_cinto_seguranca,
    documentacaoRegularizada: row.documentacao_regularizada,
    statusAprovacao:          row.status_aprovacao,
    status:                   row.status,
    tarifaBase:               row.tarifa_base ? parseFloat(row.tarifa_base) : null,
    motoristaId:              row.motorista_id,
    criadoEm:                 row.criado_em,
    atualizadoEm:             row.atualizado_em,
  };
}

// ---------- VeiculosRepository ----------

class VeiculosRepository {
  /**
   * Lista todos os veículos.
   * @returns {Promise<object[]>}
   */
  async findAll() {
    const res = await query(
      'SELECT * FROM veiculos ORDER BY criado_em ASC'
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Busca veículo pelo id.
   * @param {string} id - UUID
   * @returns {Promise<object|null>}
   */
  async findById(id) {
    const res = await query(
      'SELECT * FROM veiculos WHERE id = $1 LIMIT 1',
      [id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Lista veículos disponíveis (APROVADO + DISPONIVEL).
   * @returns {Promise<object[]>}
   */
  async findDisponiveis() {
    const res = await query(
      `SELECT * FROM veiculos
       WHERE  status_aprovacao = 'APROVADO' AND status = 'DISPONIVEL'
       ORDER BY criado_em ASC`
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Lista veículos por status operacional.
   * @param {string} status - DISPONIVEL | EM_CORRIDA | INDISPONIVEL
   * @returns {Promise<object[]>}
   */
  async findByStatus(status) {
    const res = await query(
      'SELECT * FROM veiculos WHERE status = $1 ORDER BY criado_em ASC',
      [status]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Retorna o veículo do motorista (pelo usuarioId do motorista).
   * @param {string} motoristaId - usuarioId do motorista
   * @returns {Promise<object|null>}
   */
  async findByMotoristaId(motoristaId) {
    const res = await query(
      'SELECT * FROM veiculos WHERE motorista_id = $1 LIMIT 1',
      [motoristaId]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Lista veículos por status de aprovação.
   * @param {string} statusAprovacao - PENDENTE | APROVADO | REJEITADO
   * @returns {Promise<object[]>}
   */
  async findByStatusAprovacao(statusAprovacao) {
    const res = await query(
      'SELECT * FROM veiculos WHERE status_aprovacao = $1 ORDER BY criado_em ASC',
      [statusAprovacao]
    );
    return res.rows.map(rowParaDominio);
  }

  /**
   * Atualiza statusAprovacao (e opcionalmente status e classe).
   * Quando aprovado: status passa a DISPONIVEL automaticamente.
   * @param {string} id
   * @param {string} statusAprovacao
   * @param {string|null} classe
   * @returns {Promise<object|null>}
   */
  async updateStatusAprovacao(id, statusAprovacao, classe = null) {
    // Quando aprovado, muda status para DISPONIVEL
    const novoStatus = statusAprovacao === 'APROVADO' ? 'DISPONIVEL' : undefined;

    const campos = ['status_aprovacao = $1', 'atualizado_em = NOW()'];
    const valores = [statusAprovacao];
    let idx = 2;

    if (novoStatus) {
      campos.push(`status = $${idx++}`);
      valores.push(novoStatus);
    }
    if (classe) {
      campos.push(`classe = $${idx++}`);
      valores.push(classe);
    }

    valores.push(id);
    const res = await query(
      `UPDATE veiculos SET ${campos.join(', ')} WHERE id = $${idx} RETURNING *`,
      valores
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Atualiza status operacional do veículo.
   * @param {string} id
   * @param {string} status - DISPONIVEL | EM_CORRIDA | INDISPONIVEL
   * @returns {Promise<object|null>}
   */
  async updateStatus(id, status) {
    const res = await query(
      'UPDATE veiculos SET status=$1, atualizado_em=NOW() WHERE id=$2 RETURNING *',
      [status, id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Atualiza a classe do veículo.
   * @param {string} id
   * @param {string} classe - BASICO | NORMAL | PREMIUM
   * @returns {Promise<object|null>}
   */
  async updateClasse(id, classe) {
    const res = await query(
      'UPDATE veiculos SET classe=$1, atualizado_em=NOW() WHERE id=$2 RETURNING *',
      [classe, id]
    );
    return rowParaDominio(res.rows[0] || null);
  }

  /**
   * Cria novo veículo com statusAprovacao=PENDENTE e status=INDISPONIVEL.
   * @param {object} dados
   * @returns {Promise<object>}
   */
  async create(dados) {
    const res = await query(
      `INSERT INTO veiculos
         (marca, modelo, ano, placa, cor, porte, classe,
          quilometragem, quantidade_passageiros,
          possui_ar_condicionado, possui_extintor, possui_cinto_seguranca,
          documentacao_regularizada, status_aprovacao, status,
          tarifa_base, motorista_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'PENDENTE','INDISPONIVEL',$14,$15)
       RETURNING *`,
      [
        dados.marca,
        dados.modelo,
        dados.ano,
        dados.placa,
        dados.cor   || null,
        dados.porte,
        dados.classe,
        dados.quilometragem        || 0,
        dados.quantidadePassageiros || 4,
        dados.possuiArCondicionado  || false,
        dados.possuiExtintor        || false,
        dados.possuiCintoSeguranca  || false,
        dados.documentacaoRegularizada || false,
        dados.tarifaBase            || null,
        dados.motoristaId,
      ]
    );
    return rowParaDominio(res.rows[0]);
  }
}

module.exports = new VeiculosRepository();
