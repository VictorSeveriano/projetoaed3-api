const corridasService = require('./corridas.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * CorridasController — Controlador HTTP para corridas.
 * Nenhuma regra de negocio aqui.
 */

/**
 * GET /api/corridas
 * Lista todas as corridas (admin).
 */
const listarTodas = (req, res, next) => {
  try {
    const corridas = corridasService.listarTodas();
    return success(res, corridas, 'Corridas listadas com sucesso.');
  } catch (err) { next(err); }
};

/**
 * GET /api/corridas/minhas
 * Lista corridas filtradas por perfil do usuario autenticado.
 * Query params: usuarioId, perfil, status (opcional)
 *
 * A diferenciacao por perfil ocorre AQUI no backend:
 *   ADMINISTRADOR  → repo.findAll() ou findByStatus()
 *   USUARIO        → repo.findByUsuarioId() ou findByUsuarioIdAndStatus()
 *   MOTORISTA      → repo.findByMotoristaId() ou findByMotoristaIdAndStatus()
 */
const listarMinhas = (req, res, next) => {
  try {
    const { usuarioId, perfil, status } = req.query;
    if (!usuarioId || !perfil) {
      return next(new AppError('usuarioId e perfil sao obrigatorios.', 400));
    }
    const corridas = corridasService.listarPorPerfil(usuarioId, perfil, status || null);
    return success(res, corridas, 'Corridas listadas.');
  } catch (err) { next(err); }
};

/**
 * GET /api/corridas/:id
 */
const buscarPorId = (req, res, next) => {
  try {
    const corrida = corridasService.buscarPorId(req.params.id);
    return success(res, corrida, 'Corrida encontrada.');
  } catch (err) { next(err); }
};

/**
 * POST /api/corridas
 */
const criar = (req, res, next) => {
  try {
    const { usuarioId, origemNome, destinoNome, distanciaKm } = req.body;
    if (!usuarioId || !origemNome || !destinoNome || distanciaKm == null) {
      return next(new AppError('Campos obrigatorios: usuarioId, origemNome, destinoNome, distanciaKm.', 400));
    }
    const novaCorrida = corridasService.criar(req.body);
    return res.status(201).json({ success: true, data: novaCorrida, message: 'Corrida criada com sucesso.' });
  } catch (err) { next(err); }
};

/** PATCH /api/corridas/:id/cancelar */
const cancelar = (req, res, next) => {
  try {
    const corridaCancelada = corridasService.cancelar(req.params.id);
    return success(res, corridaCancelada, 'Corrida cancelada com sucesso.');
  } catch (err) { next(err); }
};

/** PATCH /api/corridas/:id/finalizar */
const finalizar = (req, res, next) => {
  try {
    const corridaFinalizada = corridasService.finalizar(req.params.id);
    return success(res, corridaFinalizada, 'Corrida finalizada com sucesso.');
  } catch (err) { next(err); }
};

module.exports = { listarTodas, listarMinhas, buscarPorId, criar, cancelar, finalizar };
