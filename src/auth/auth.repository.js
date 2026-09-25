'use strict';
/**
 * auth.repository.js — Repositório de usuários com PostgreSQL.
 *
 * Preserva exatamente as mesmas assinaturas da implementação em memória:
 *   findAll()
 *   encontrarPorUsuario(usuario)
 *   encontrarPorId(id)
 *   existsByCpf(cpf)
 *   existsByEmail(email)
 *   create(dados)
 *   update(id, dados)
 *
 * O Service não sabe se os dados vêm de Array ou PostgreSQL.
 *
 * Mapeamento: snake_case (banco) → camelCase (aplicação)
 *   usuario_id   → usuarioId
 *   criado_em    → criadoEm
 *   atualizado_em → atualizadoEm
 *   endereco_id  → enderecoId (interno — o campo "endereco" é expandido pelo Service)
 *
 * SEGURANÇA: a senha NUNCA é retornada nas listagens públicas.
 * Apenas encontrarPorUsuario() e encontrarPorId() retornam a senha,
 * pois o AuthService precisa comparar credenciais.
 */

const { query, getClient } = require('../database/connection');

// ---------- Helpers de mapeamento ----------

/**
 * Converte row do banco em objeto camelCase do domínio.
 * Inclui senha (uso interno: login/cadastro).
 */
function rowParaDominio(row) {
  if (!row) return null;
  return {
    id:           row.id,
    nome:         row.nome,
    cpf:          row.cpf,
    celular:      row.celular,
    email:        row.email,
    usuario:      row.usuario,
    senha:        row.senha,       // necessário para AuthService.login()
    perfil:       row.perfil,
    enderecoId:   row.endereco_id || null,
    // O campo "endereco" (objeto estruturado) é montado pelo Service quando necessário
    // via _buscarEndereco(enderecoId). Aqui retornamos apenas o id da FK.
    endereco:     row.endereco     || null, // preenchido por JOINs quando disponível
    criadoEm:     row.criado_em,
    atualizadoEm: row.atualizado_em,
  };
}

/**
 * Converte row do banco em objeto sem senha (uso público/listas).
 */
function rowParaDominioSemSenha(row) {
  const obj = rowParaDominio(row);
  if (!obj) return null;
  const { senha, ...resto } = obj;
  return resto;
}

// ---------- Helpers de endereço ----------

/**
 * Converte objeto endereco (camelCase da aplicação) para colunas do banco.
 * A aplicação usa: rua, bairro, cidade, estado, numero, cep, complemento, pais, latitude, longitude
 * O banco usa   : logradouro, bairro, cidade, estado, numero, cep, complemento, pais, latitude, longitude
 */
function enderecoParaBanco(endereco) {
  if (!endereco) return null;
  return {
    logradouro:  endereco.rua        || endereco.logradouro || null,
    numero:      endereco.numero      || null,
    complemento: endereco.complemento || null,
    bairro:      endereco.bairro      || null,
    cidade:      endereco.cidade      || null,
    estado:      endereco.estado      || null,
    uf:          endereco.uf          || null,
    cep:         endereco.cep         ? endereco.cep.replace(/\D/g, '') : null,
    pais:        endereco.pais        || 'Brasil',
    latitude:    endereco.latitude    || null,
    longitude:   endereco.longitude   || null,
  };
}

/**
 * Converte row de endereço (banco) para objeto camelCase da aplicação.
 * O campo "rua" preserva o contrato do frontend (que envia/espera "rua").
 */
function enderecoRowParaDominio(row) {
  if (!row) return null;
  return {
    id:          row.id,
    rua:         row.logradouro  || null,  // mapeamento logradouro → rua
    logradouro:  row.logradouro  || null,
    numero:      row.numero      || null,
    complemento: row.complemento || null,
    bairro:      row.bairro      || null,
    cidade:      row.cidade      || null,
    estado:      row.estado      || null,
    uf:          row.uf          || null,
    cep:         row.cep         || null,
    pais:        row.pais        || 'Brasil',
    latitude:    row.latitude    ? parseFloat(row.latitude)  : null,
    longitude:   row.longitude   ? parseFloat(row.longitude) : null,
  };
}

// ---------- AuthRepository ----------

class AuthRepository {
  /**
   * Lista todos os usuários (sem senha).
   * @returns {Promise<object[]>}
   */
  async findAll() {
    const res = await query(`
      SELECT u.*, e.logradouro, e.numero, e.complemento, e.bairro,
             e.cidade, e.estado, e.uf, e.cep, e.pais, e.latitude, e.longitude,
             e.id AS eid
      FROM   usuarios u
      LEFT JOIN enderecos e ON e.id = u.endereco_id
      ORDER BY u.criado_em ASC
    `);
    return res.rows.map((row) => {
      const u = rowParaDominioSemSenha(row);
      u.endereco = row.eid ? enderecoRowParaDominio({ ...row, id: row.eid }) : null;
      return u;
    });
  }

  /**
   * Busca usuário pelo login (campo usuario) — inclui senha para autenticação.
   * @param {string} usuario
   * @returns {Promise<object|null>}
   */
  async encontrarPorUsuario(usuario) {
    const res = await query(
      `SELECT u.*, e.logradouro, e.numero, e.complemento, e.bairro,
              e.cidade, e.estado, e.uf, e.cep, e.pais, e.latitude, e.longitude,
              e.id AS eid
       FROM   usuarios u
       LEFT JOIN enderecos e ON e.id = u.endereco_id
       WHERE  u.usuario = $1
       LIMIT  1`,
      [usuario]
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    const u = rowParaDominio(row);
    u.endereco = row.eid ? enderecoRowParaDominio({ ...row, id: row.eid }) : null;
    return u;
  }

  /**
   * Busca usuário pelo id — inclui senha (uso interno do Service).
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async encontrarPorId(id) {
    const res = await query(
      `SELECT u.*, e.logradouro, e.numero, e.complemento, e.bairro,
              e.cidade, e.estado, e.uf, e.cep, e.pais, e.latitude, e.longitude,
              e.id AS eid
       FROM   usuarios u
       LEFT JOIN enderecos e ON e.id = u.endereco_id
       WHERE  u.id = $1
       LIMIT  1`,
      [id]
    );
    if (!res.rows.length) return null;
    const row = res.rows[0];
    const u = rowParaDominio(row);
    u.endereco = row.eid ? enderecoRowParaDominio({ ...row, id: row.eid }) : null;
    return u;
  }

  /**
   * Verifica existência por CPF (normalizado, apenas dígitos).
   * @param {string} cpf
   * @returns {Promise<boolean>}
   */
  async existsByCpf(cpf) {
    const res = await query(
      'SELECT 1 FROM usuarios WHERE cpf = $1 LIMIT 1',
      [cpf]
    );
    return res.rows.length > 0;
  }

  /**
   * Verifica existência por e-mail (normalizado).
   * @param {string} email
   * @returns {Promise<boolean>}
   */
  async existsByEmail(email) {
    const res = await query(
      'SELECT 1 FROM usuarios WHERE email = $1 LIMIT 1',
      [email]
    );
    return res.rows.length > 0;
  }

  /**
   * Cria novo usuário.
   * Se dados.endereco estiver presente, persiste endereço e cria FK.
   *
   * @param {object} dados - { nome, cpf, celular, email, usuario, senha, perfil, endereco? }
   * @returns {Promise<object>}
   */
  async create(dados) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      let enderecoId = null;

      // Persiste endereço se fornecido
      if (dados.endereco) {
        const end = enderecoParaBanco(dados.endereco);
        const resEnd = await client.query(
          `INSERT INTO enderecos
             (logradouro, numero, complemento, bairro, cidade, estado, uf, cep, pais, latitude, longitude)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            end.logradouro, end.numero, end.complemento, end.bairro,
            end.cidade, end.estado, end.uf, end.cep, end.pais,
            end.latitude, end.longitude,
          ]
        );
        enderecoId = resEnd.rows[0].id;
      }

      const resUser = await client.query(
        `INSERT INTO usuarios (nome, cpf, celular, email, usuario, senha, perfil, endereco_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          dados.nome, dados.cpf, dados.celular, dados.email,
          dados.usuario, dados.senha, dados.perfil, enderecoId,
        ]
      );

      await client.query('COMMIT');

      const novoUsuario = rowParaDominio(resUser.rows[0]);
      novoUsuario.endereco = dados.endereco || null;
      return novoUsuario;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Atualiza dados do usuário.
   * Se dados.endereco for fornecido, atualiza/cria o endereço vinculado.
   *
   * @param {string} id
   * @param {object} dados - campos opcionais: nome, usuario, cpf, celular, email, endereco
   * @returns {Promise<object|null>}
   */
  async update(id, dados) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Busca o usuário atual para obter endereco_id existente
      const resAtual = await client.query(
        'SELECT * FROM usuarios WHERE id = $1 LIMIT 1', [id]
      );
      if (!resAtual.rows.length) {
        await client.query('ROLLBACK');
        return null;
      }
      const atual = resAtual.rows[0];

      // Atualiza endereço se fornecido
      if (dados.endereco) {
        const end = enderecoParaBanco(dados.endereco);
        if (atual.endereco_id) {
          // Atualiza endereço existente
          await client.query(
            `UPDATE enderecos
             SET logradouro=$1,numero=$2,complemento=$3,bairro=$4,cidade=$5,
                 estado=$6,uf=$7,cep=$8,pais=$9,latitude=$10,longitude=$11,
                 atualizado_em=NOW()
             WHERE id=$12`,
            [
              end.logradouro, end.numero, end.complemento, end.bairro,
              end.cidade, end.estado, end.uf, end.cep, end.pais,
              end.latitude, end.longitude, atual.endereco_id,
            ]
          );
        } else {
          // Cria novo endereço e vincula
          const resEnd = await client.query(
            `INSERT INTO enderecos
               (logradouro, numero, complemento, bairro, cidade, estado, uf, cep, pais, latitude, longitude)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [
              end.logradouro, end.numero, end.complemento, end.bairro,
              end.cidade, end.estado, end.uf, end.cep, end.pais,
              end.latitude, end.longitude,
            ]
          );
          await client.query(
            'UPDATE usuarios SET endereco_id=$1, atualizado_em=NOW() WHERE id=$2',
            [resEnd.rows[0].id, id]
          );
        }
      }

      // Campos permitidos para atualização
      const campos = [];
      const valores = [];
      let idx = 1;

      if (dados.nome     !== undefined) { campos.push(`nome=$${idx++}`);     valores.push(dados.nome);     }
      if (dados.usuario  !== undefined) { campos.push(`usuario=$${idx++}`);  valores.push(dados.usuario);  }
      if (dados.cpf      !== undefined) { campos.push(`cpf=$${idx++}`);      valores.push(dados.cpf);      }
      if (dados.celular  !== undefined) { campos.push(`celular=$${idx++}`);  valores.push(dados.celular);  }
      if (dados.email    !== undefined) { campos.push(`email=$${idx++}`);    valores.push(dados.email);    }
      campos.push(`atualizado_em=NOW()`);

      if (campos.length > 1) {
        valores.push(id);
        await client.query(
          `UPDATE usuarios SET ${campos.join(', ')} WHERE id=$${idx}`,
          valores
        );
      }

      await client.query('COMMIT');

      // Retorna o usuário atualizado
      return this.encontrarPorId(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = new AuthRepository();
