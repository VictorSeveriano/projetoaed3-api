'use strict';

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

module.exports = {
  paraNumeroOuNull,
  enderecoParaPrisma,
  formatarEndereco,
};

