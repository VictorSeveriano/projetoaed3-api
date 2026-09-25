'use strict';
const usuariosService = require('./usuarios.service');
const { success }     = require('../utils/responseHelper');

/** GET /api/usuarios/:id */
const buscarPorId = async (req, res, next) => {
  try {
    const dados = await usuariosService.buscarPorId(req.params.id);
    return success(res, dados, 'Usuário encontrado.');
  } catch (err) { next(err); }
};

/** GET /api/usuarios — Admin (com ?search= e ?perfil=) */
const listarTodos = async (req, res, next) => {
  try {
    const dados = await usuariosService.listarTodos(req.query);
    return success(res, dados, 'Usuários listados com sucesso.');
  } catch (err) { next(err); }
};

/** PATCH /api/usuarios/:id — Admin */
const atualizar = async (req, res, next) => {
  try {
    const dados = await usuariosService.atualizar(req.params.id, req.body);
    return success(res, dados, 'Usuário atualizado com sucesso.');
  } catch (err) { next(err); }
};

/** GET /api/usuarios/:id/corridas */
const listarCorridas = async (req, res, next) => {
  try {
    const corridas = await usuariosService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do usuário listadas.');
  } catch (err) { next(err); }
};

module.exports = { buscarPorId, listarCorridas, listarTodos, atualizar };
