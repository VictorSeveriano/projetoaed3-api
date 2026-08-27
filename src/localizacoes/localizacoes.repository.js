const localizacoes = require('../data/localizacoes.data');

/**
 * LocalizacoesRepository — Camada de acesso a dados de localizacoes.
 */
class LocalizacoesRepository {
  findAll() {
    return [...localizacoes];
  }

  findById(id) {
    return localizacoes.find((l) => l.id === id) || null;
  }

  findByNome(nome) {
    return localizacoes.find((l) => l.nome === nome) || null;
  }
}

module.exports = new LocalizacoesRepository();
