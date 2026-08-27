const carrosService = require('./carros.service');
const { success } = require('../utils/responseHelper');

/**
 * CarrosController — Controlador de carros.
 */
const listarTodos = (req, res, next) => {
  try {
    const { categoria, marca, localizacao, status } = req.query;
    const carros = carrosService.listarTodos({ categoria, marca, localizacao, status });
    return success(res, carros, 'Carros listados com sucesso');
  } catch (err) {
    next(err);
  }
};

const listarDisponiveis = (req, res, next) => {
  try {
    const carros = carrosService.listarDisponiveis();
    return success(res, carros, 'Carros disponiveis listados com sucesso');
  } catch (err) {
    next(err);
  }
};

const buscarPorId = (req, res, next) => {
  try {
    const carro = carrosService.buscarPorId(req.params.id);
    return success(res, carro, 'Carro encontrado');
  } catch (err) {
    next(err);
  }
};

module.exports = { listarTodos, listarDisponiveis, buscarPorId };
