'use strict';
/**
 * corridas.repository.js — Repositório de corridas com PostgreSQL.
 *
 * Preserva as assinaturas originais:
 *   findAll()
 *   findById(id)
 *   findByUsuarioId(usuarioId)
 *   findByMotoristaId(motoristaId)
 *   findByMotoristaIdAndPeriodo(motoristaId, mes, ano)
 *   findByUsuarioIdAndStatus(usuarioId, status)
 *   findByMotoristaIdAndStatus(motoristaId, status)
 *   findByVeiculo(veiculoId)
 *   create(dados)
 *   updateStatus(id, status)
 *   delete(id)
 *
 * IMPORTANTE:
 *   - As corridas possuem um endereço de origem e um de destino (snapshot),
 *     ambos criados no momento da inserção.
 *   - rotasAlternativas (array) é armazenado em corrida_rotas.
 *   - O Repository reconstrói { ...corrida, rotasAlternativas: [...] }
 *     para manter o contrato que o Service/frontend espera.
 *
 * Mapeamento: snake_case (banco) → camelCase (aplicação)
 */

const Corrida = require('./Corrida');
const { query, getClient } = require('../database/connection');

// ---------- Helpers de mapeamento ----------

function rowParaDominio(row) {
  if (!row) return null;
  return {
    id:           row.id,
    usuarioId:    row.usuario_id,
    motoristaId:  row.motorista_id   || null,
    veiculoId:    row.veiculo_id     || null,

    // Endereços snapshot (ids das FKs)
    origemEnderecoId:  row.origem_endereco_id,
    destinoEnderecoId: row.destino_endereco_id,

    // Nomes de exibição
    origemNome:   row.origem_nome,
    destinoNome:  row.destino_nome,

    // Coordenadas
    origemLat:    row.origem_lat  ? parseFloat(row.origem_lat)  : null,
    origemLng:    row.origem_lng  ? parseFloat(row.origem_lng)  : null,
    destinoLat:   row.destino_lat ? parseFloat(row.destino_lat) : null,
    destinoLng:   row.destino_lng ? parseFloat(row.destino_lng) : null,

    // Rota selecionada
    rotaCaminho:       row.rota_caminho  || [],
    polyline:          row.polyline      || null,

    // Rotas alternativas — preenchidas por _buscarRotasAlternativas
    rotasAlternativas: [],

    // Métricas
    distanciaKm: row.distancia_km  ? parseFloat(row.distancia_km)  : 0,
    duracaoMin:  row.duracao_min   ? parseInt(row.duracao_min, 10)  : null,

    // Financeiro
    valor:        row.valor ? parseFloat(row.valor) : 0,

    // Temporal
    dataHorario:  row.data_horario,
    status:       row.status,
    criadaEm:     row.criada_em,
    atualizadaEm: row.atualizada_em,

    // Endereços estruturados (podem vir de JOINs)
    origemEndereco:  row.origem_end  || null,
    destinoEndereco: row.destino_end || null,
  };
}

/**
 * Converte row de corrida_rotas para objeto camelCase.
 */
function rotaRowParaDominio(row) {
  if (!row) return null;
  return {
    id:               row.id,
    corridaId:        row.corrida_id,
    ordem:            row.ordem,
    distanciaKm:      row.distancia_km    ? parseFloat(row.distancia_km)  : 0,
    distanciaMetros:  row.distancia_metros,
    duracaoMin:       row.duracao_min     ? parseInt(row.duracao_min, 10) : null,
    duracaoSegundos:  row.duracao_segundos ? parseInt(row.duracao_segundos, 10) : null,
    polyline:         row.polyline,
    selecionada:      row.selecionada,
    criadaEm:         row.criada_em,
  };
}

/**
 * Converte um objeto de rota alternativa (formato da aplicação) para parâmetros do banco.
 * Suporta o formato retornado pela Google Routes API / GrafoService.
 */
function rotaAlternativaParaBanco(rota, corridaId, ordem, selecionada = false) {
  // Suporta diferentes formatos de entrada
  const distanciaMetros = rota.distanciaMetros || rota.distanceMeters || 0;
  const distanciaKm     = rota.distanciaKm
    || (distanciaMetros > 0 ? parseFloat((distanciaMetros / 1000).toFixed(3)) : 0);
  const duracaoSegundos = rota.duracaoSegundos || rota.durationSeconds
    || (rota.duracaoMin ? rota.duracaoMin * 60 : null);
  const duracaoMin      = rota.duracaoMin
    || (duracaoSegundos ? Math.round(duracaoSegundos / 60) : null);
  const polyline        = rota.polyline || rota.encodedPolyline || '';

  return {
    corridaId, ordem, distanciaKm, distanciaMetros, duracaoMin, duracaoSegundos,
    polyline, selecionada,
  };
}

/**
 * Busca as rotas alternativas de uma corrida.
 * @param {string} corridaId
 * @returns {Promise<object[]>}
 */
async function _buscarRotasAlternativas(corridaId) {
  const res = await query(
    'SELECT * FROM corrida_rotas WHERE corrida_id = $1 ORDER BY ordem ASC',
    [corridaId]
  );
  return res.rows.map(rotaRowParaDominio);
}

/**
 * Insere rotas alternativas para uma corrida dentro de uma transação.
 * @param {object} client - cliente pg com transação aberta
 * @param {string} corridaId
 * @param {Array}  rotasAlternativas
 * @param {number} [rotaSelecionadaIdx=0] - índice da rota selecionada no array
 */
async function _inserirRotasAlternativas(client, corridaId, rotasAlternativas, rotaSelecionadaIdx = 0) {
  if (!rotasAlternativas || rotasAlternativas.length === 0) return;

  for (let i = 0; i < rotasAlternativas.length; i++) {
    const rota = rotasAlternativas[i];
    const rb = rotaAlternativaParaBanco(rota, corridaId, i, i === rotaSelecionadaIdx);

    if (!rb.polyline) continue; // pula rotas sem polyline

    await client.query(
      `INSERT INTO corrida_rotas
         (corrida_id, ordem, distancia_km, distancia_metros,
          duracao_min, duracao_segundos, polyline, selecionada)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        rb.corridaId, rb.ordem, rb.distanciaKm, rb.distanciaMetros,
        rb.duracaoMin, rb.duracaoSegundos, rb.polyline, rb.selecionada,
      ]
    );
  }
}

/**
 * Cria endereço snapshot na tabela enderecos dentro de uma transação.
 * @param {object} client
 * @param {object} enderecoObj - objeto de endereço da aplicação (rua, bairro, ...)
 * @param {number} [lat]
 * @param {number} [lng]
 * @returns {Promise<string>} id do endereço criado
 */
async function _criarEnderecoSnapshot(client, enderecoObj, lat = null, lng = null) {
  const logradouro  = enderecoObj?.rua || enderecoObj?.logradouro || null;
  const numero      = enderecoObj?.numero      || null;
  const complemento = enderecoObj?.complemento || null;
  const bairro      = enderecoObj?.bairro      || null;
  const cidade      = enderecoObj?.cidade      || null;
  const estado      = enderecoObj?.estado      || null;
  const uf          = enderecoObj?.uf          || null;
  const cep         = enderecoObj?.cep ? enderecoObj.cep.replace(/\D/g, '') : null;
  const pais        = enderecoObj?.pais || 'Brasil';
  const latitude    = lat  || enderecoObj?.latitude  || null;
  const longitude   = lng  || enderecoObj?.longitude || null;

  const res = await client.query(
    `INSERT INTO enderecos
       (logradouro, numero, complemento, bairro, cidade, estado, uf, cep, pais, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [logradouro, numero, complemento, bairro, cidade, estado, uf, cep, pais, latitude, longitude]
  );
  return res.rows[0].id;
}

// ---------- CorridasRepository ----------

class CorridasRepository {
  /**
   * Lista todas as corridas com rotas alternativas.
   * @returns {Promise<Corrida[]>}
   */
  async findAll() {
    const res = await query(
      'SELECT * FROM corridas ORDER BY criada_em DESC'
    );
    const corridas = await Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
    return corridas;
  }

  /**
   * Busca corrida pelo id.
   * @param {string} id
   * @returns {Promise<Corrida|undefined>}
   */
  async findById(id) {
    const res = await query(
      'SELECT * FROM corridas WHERE id = $1 LIMIT 1',
      [id]
    );
    if (!res.rows.length) return undefined;
    const c = rowParaDominio(res.rows[0]);
    c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
    return new Corrida(c);
  }

  /**
   * Filtra corridas por usuário.
   * @param {string} usuarioId
   * @returns {Promise<Corrida[]>}
   */
  async findByUsuarioId(usuarioId) {
    const res = await query(
      'SELECT * FROM corridas WHERE usuario_id = $1 ORDER BY criada_em DESC',
      [usuarioId]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Filtra corridas por motorista.
   * @param {string} motoristaId
   * @returns {Promise<Corrida[]>}
   */
  async findByMotoristaId(motoristaId) {
    const res = await query(
      'SELECT * FROM corridas WHERE motorista_id = $1 ORDER BY criada_em DESC',
      [motoristaId]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Corridas do motorista filtradas por mês e ano.
   * @param {string} motoristaId
   * @param {number} mes  - 1..12
   * @param {number} ano
   * @returns {Promise<Corrida[]>}
   */
  async findByMotoristaIdAndPeriodo(motoristaId, mes, ano) {
    const res = await query(
      `SELECT * FROM corridas
       WHERE  motorista_id = $1
         AND  EXTRACT(MONTH FROM data_horario) = $2
         AND  EXTRACT(YEAR  FROM data_horario) = $3
       ORDER BY data_horario DESC`,
      [motoristaId, mes, ano]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Corridas do usuário filtradas por status.
   * @param {string} usuarioId
   * @param {string} status
   * @returns {Promise<Corrida[]>}
   */
  async findByUsuarioIdAndStatus(usuarioId, status) {
    const res = await query(
      `SELECT * FROM corridas
       WHERE usuario_id = $1 AND status = $2
       ORDER BY criada_em DESC`,
      [usuarioId, status]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Corridas do motorista filtradas por status.
   * @param {string} motoristaId
   * @param {string} status
   * @returns {Promise<Corrida[]>}
   */
  async findByMotoristaIdAndStatus(motoristaId, status) {
    const res = await query(
      `SELECT * FROM corridas
       WHERE motorista_id = $1 AND status = $2
       ORDER BY criada_em DESC`,
      [motoristaId, status]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Filtra corridas por veículo.
   * @param {string} veiculoId
   * @returns {Promise<Corrida[]>}
   */
  async findByVeiculo(veiculoId) {
    const res = await query(
      'SELECT * FROM corridas WHERE veiculo_id = $1 ORDER BY criada_em DESC',
      [veiculoId]
    );
    return Promise.all(
      res.rows.map(async (row) => {
        const c = rowParaDominio(row);
        c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
        return new Corrida(c);
      })
    );
  }

  /**
   * Cria nova corrida com endereços snapshot e rotas alternativas.
   *
   * Usa transação para garantir consistência entre:
   *   enderecos (origem) + enderecos (destino) + corridas + corrida_rotas
   *
   * @param {object} dados
   * @returns {Promise<Corrida>}
   */
  async create(dados) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 1. Cria endereço de origem (snapshot)
      const origemEnderecoId = await _criarEnderecoSnapshot(
        client,
        dados.origemEndereco || {},
        dados.origemLat,
        dados.origemLng
      );

      // 2. Cria endereço de destino (snapshot)
      const destinoEnderecoId = await _criarEnderecoSnapshot(
        client,
        dados.destinoEndereco || {},
        dados.destinoLat,
        dados.destinoLng
      );

      // 3. Insere a corrida
      const rotaCaminho = Array.isArray(dados.rotaCaminho) ? dados.rotaCaminho : [];

      const resC = await client.query(
        `INSERT INTO corridas
           (usuario_id, motorista_id, veiculo_id,
            origem_endereco_id, destino_endereco_id,
            origem_nome, destino_nome,
            origem_lat, origem_lng, destino_lat, destino_lng,
            rota_caminho, polyline,
            distancia_km, duracao_min,
            valor, data_horario, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
         RETURNING *`,
        [
          dados.usuarioId,
          dados.motoristaId  || null,
          dados.veiculoId    || null,
          origemEnderecoId,
          destinoEnderecoId,
          dados.origemNome,
          dados.destinoNome,
          dados.origemLat    || null,
          dados.origemLng    || null,
          dados.destinoLat   || null,
          dados.destinoLng   || null,
          JSON.stringify(rotaCaminho),
          dados.polyline     || null,
          dados.distanciaKm,
          dados.duracaoMin   || null,
          dados.valor        || 0,
          dados.dataHorario  || new Date().toISOString(),
          dados.status       || 'SOLICITADA',
        ]
      );

      const corridaId = resC.rows[0].id;

      // 4. Insere rotas alternativas (se houver)
      await _inserirRotasAlternativas(
        client,
        corridaId,
        dados.rotasAlternativas || [],
        0 // primeira rota como selecionada por padrão
      );

      await client.query('COMMIT');

      // Reconstrói a corrida com rotasAlternativas
      const c = rowParaDominio(resC.rows[0]);
      c.origemEnderecoId  = origemEnderecoId;
      c.destinoEnderecoId = destinoEnderecoId;
      c.rotasAlternativas = await _buscarRotasAlternativas(corridaId);
      return new Corrida(c);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atualiza o status de uma corrida.
   * @param {string} id
   * @param {string} status
   * @returns {Promise<Corrida|undefined>}
   */
  async updateStatus(id, status) {
    const res = await query(
      `UPDATE corridas SET status=$1, atualizada_em=NOW() WHERE id=$2 RETURNING *`,
      [status, id]
    );
    if (!res.rows.length) return undefined;
    const c = rowParaDominio(res.rows[0]);
    c.rotasAlternativas = await _buscarRotasAlternativas(c.id);
    return new Corrida(c);
  }

  /**
   * Remove uma corrida (e suas rotas via CASCADE).
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    const res = await query(
      'DELETE FROM corridas WHERE id=$1 RETURNING id',
      [id]
    );
    return res.rows.length > 0;
  }
}

module.exports = new CorridasRepository();
