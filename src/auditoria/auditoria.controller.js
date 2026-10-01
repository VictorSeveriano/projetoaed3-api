'use strict';

const auditoriaService = require('./auditoria.service');
const { success } = require('../utils/responseHelper');

const listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, usuarioId } = req.query;
    const paginacao = { page: parseInt(page, 10), limit: parseInt(limit, 10) };
    const filtros = { usuarioId };

    const result = await auditoriaService.listar(filtros, paginacao);
    return success(res, result.data, 'Registros de auditoria listados.', 200, result.meta);
  } catch (err) { next(err); }
};

const buscarPorId = async (req, res, next) => {
  try {
    const registro = await auditoriaService.buscarPorId(req.params.id);
    return success(res, registro, 'Registro de auditoria.');
  } catch (err) { next(err); }
};

module.exports = {
  listar,
  buscarPorId
};
