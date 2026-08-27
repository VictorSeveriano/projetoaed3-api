const localizacoesRepository = require('./localizacoes.repository');
const AppError = require('../utils/AppError');

/**
 * LocalizacoesService — Regras de negocio de localizacoes.
 */
class LocalizacoesService {
  listarTodas() {
    return localizacoesRepository.findAll();
  }

  buscarPorId(id) {
    const localizacao = localizacoesRepository.findById(id);
    if (!localizacao) {
      throw new AppError(`Localizacao com id '${id}' nao encontrada.`, 404);
    }
    return localizacao;
  }
}

module.exports = new LocalizacoesService();
