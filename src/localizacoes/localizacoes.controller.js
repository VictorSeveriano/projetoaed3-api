const localizacoesService = require('./localizacoes.service');
const { success } = require('../utils/responseHelper');

/**
 * LocalizacoesController
 */
const listarTodas = (req, res, next) => {
  try {
    const localizacoes = localizacoesService.listarTodas();
    return success(res, localizacoes, 'Localizacoes listadas com sucesso');
  } catch (err) {
    next(err);
  }
};

const buscarPorId = (req, res, next) => {
  try {
    const localizacao = localizacoesService.buscarPorId(req.params.id);
    return success(res, localizacao, 'Localizacao encontrada');
  } catch (err) {
    next(err);
  }
};

module.exports = { listarTodas, buscarPorId };
