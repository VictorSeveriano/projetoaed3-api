const reservasService = require('./reservas.service');
const { success } = require('../utils/responseHelper');

/**
 * ReservasController — Controlador de reservas.
 */
const listarTodas = (req, res, next) => {
  try {
    const reservas = reservasService.listarTodas();
    return success(res, reservas, 'Reservas listadas com sucesso');
  } catch (err) {
    next(err);
  }
};

const buscarPorId = (req, res, next) => {
  try {
    const reserva = reservasService.buscarPorId(req.params.id);
    return success(res, reserva, 'Reserva encontrada');
  } catch (err) {
    next(err);
  }
};

const criar = (req, res, next) => {
  try {
    const reserva = reservasService.criar(req.body);
    return success(res, reserva, 'Reserva criada com sucesso', 201);
  } catch (err) {
    next(err);
  }
};

const atualizar = (req, res, next) => {
  try {
    const reserva = reservasService.atualizar(req.params.id, req.body);
    return success(res, reserva, 'Reserva atualizada com sucesso');
  } catch (err) {
    next(err);
  }
};

const cancelar = (req, res, next) => {
  try {
    const reserva = reservasService.cancelar(req.params.id);
    return success(res, reserva, 'Reserva cancelada com sucesso');
  } catch (err) {
    next(err);
  }
};

const deletar = (req, res, next) => {
  try {
    reservasService.deletar(req.params.id);
    return success(res, null, 'Reserva removida com sucesso');
  } catch (err) {
    next(err);
  }
};

module.exports = { listarTodas, buscarPorId, criar, atualizar, cancelar, deletar };
