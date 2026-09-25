const usuariosService = require('./usuarios.service');
const { success } = require('../utils/responseHelper');

/**
 * UsuariosController — Endpoints para dados do próprio usuário.
 * Nenhuma regra de negócio aqui.
 */

/**
 * GET /api/usuarios/:id
 * Retorna perfil do usuário (sem senha).
 */
const buscarPorId = (req, res, next) => {
  try {
    const dados = usuariosService.buscarPorId(req.params.id);
    return success(res, dados, 'Usuário encontrado.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/usuarios/:id/corridas
 * Lista corridas do usuário autenticado.
 */
const listarCorridas = (req, res, next) => {
  try {
    const corridas = usuariosService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do usuário listadas.');
  } catch (err) {
    next(err);
  }
};

module.exports = { buscarPorId, listarCorridas };
