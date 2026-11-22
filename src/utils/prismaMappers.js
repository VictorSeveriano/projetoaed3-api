'use strict';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verifica se uma string possui formato UUID válido antes de cast `::uuid` no PostgreSQL. */
function ehUuid(valor) {
  return typeof valor === 'string' && UUID_REGEX.test(valor);
}

/**
 * Converte Prisma Decimal (ou valor numérico/string) para number JS,
 * preservando 0 e retornando null para null/undefined.
 */
function paraNumeroOuNull(valor) {
  if (valor == null) return null;
  return typeof valor.toNumber === 'function' ? valor.toNumber() : Number(valor);
}

/**
 * Converte objeto de endereço da aplicação ({ rua, estado, ... })
 * para o formato do modelo Endereco no Prisma ({ logradouro, uf, ... }).
 */
function enderecoParaPrisma(endereco, lat, lng) {
  return {
    logradouro:  endereco?.rua        || endereco?.logradouro || null,
    numero:      endereco?.numero      || null,
    complemento: endereco?.complemento || null,
    bairro:      endereco?.bairro      || null,
    cidade:      endereco?.cidade      || null,
    estado:      endereco?.estado      || null,
    uf:          endereco?.uf          || null,
    cep:         endereco?.cep         ? endereco.cep.replace(/\D/g, '') : null,
    pais:        endereco?.pais        || 'Brasil',
    latitude:    lat !== undefined ? (lat ?? null) : (endereco?.latitude ?? null),
    longitude:   lng !== undefined ? (lng ?? null) : (endereco?.longitude ?? null),
  };
}

/**
 * Converte registro Endereco do Prisma para o formato de domínio da aplicação.
 */
function formatarEndereco(endereco) {
  if (!endereco) return null;
  return {
    ...endereco,
    rua: endereco.logradouro,
    latitude: paraNumeroOuNull(endereco.latitude),
    longitude: paraNumeroOuNull(endereco.longitude),
  };
}

/**
 * Converte colunas prefixadas (e_*) retornadas por consulta SQL JOIN para o mesmo
 * formato produzido por `formatarEndereco`.
 */
function formatarEnderecoSql(row) {
  if (!row || !row.e_id) return null;
  return formatarEndereco({
    id:           row.e_id,
    logradouro:   row.e_logradouro,
    numero:       row.e_numero,
    complemento:  row.e_complemento,
    bairro:       row.e_bairro,
    cidade:       row.e_cidade,
    estado:       row.e_estado,
    uf:           row.e_uf,
    cep:          row.e_cep,
    pais:         row.e_pais,
    latitude:     row.e_latitude,
    longitude:    row.e_longitude,
    criadoEm:     row.e_criado_em,
    atualizadoEm: row.e_atualizado_em,
  });
}

module.exports = {
  ehUuid,
  paraNumeroOuNull,
  enderecoParaPrisma,
  formatarEndereco,
  formatarEnderecoSql,
};
