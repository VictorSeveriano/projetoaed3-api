const corridasService = require('./corridas.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * CorridasController — Controlador HTTP para corridas.
 *
 * Responsabilidades:
 * - Receber e validar parametros HTTP
 * - Delegar ao CorridasService
 * - Formatar e retornar a resposta HTTP
 *
 * Nao contem regras de negocio.
 */

/**
 * GET /api/corridas
 * Lista todas as corridas do sistema.
 */
const listarTodas = (req, res, next) => {
  try {
    const corridas = corridasService.listarTodas();
    return success(res, corridas, 'Corridas listadas com sucesso.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/corridas/:id
 * Busca uma corrida pelo ID.
 */
const buscarPorId = (req, res, next) => {
  try {
    const corrida = corridasService.buscarPorId(req.params.id);
    return success(res, corrida, 'Corrida encontrada.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/corridas
 * Cria uma nova corrida.
 * Body: { usuarioId, veiculoId?, origemNome, destinoNome, origemLat?, origemLng?,
 *         destinoLat?, destinoLng?, rotaCaminho?, distanciaKm, duracaoMin?, dataHorario? }
 */
const criar = (req, res, next) => {
  try {
    const {
      usuarioId, origemNome, destinoNome, distanciaKm,
    } = req.body;

    if (!usuarioId || !origemNome || !destinoNome || distanciaKm == null) {
      return next(new AppError('Campos obrigatorios: usuarioId, origemNome, destinoNome, distanciaKm.', 400));
    }

    const novaCorrida = corridasService.criar(req.body);
    return res.status(201).json({
      success: true,
      data: novaCorrida,
      message: 'Corrida criada com sucesso.',
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/corridas/:id/cancelar
 * Cancela uma corrida ativa.
 */
const cancelar = (req, res, next) => {
  try {
    const corridaCancelada = corridasService.cancelar(req.params.id);
    return success(res, corridaCancelada, 'Corrida cancelada com sucesso.');
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/corridas/:id/finalizar
 * Finaliza uma corrida em andamento.
 */
const finalizar = (req, res, next) => {
  try {
    const corridaFinalizada = corridasService.finalizar(req.params.id);
    return success(res, corridaFinalizada, 'Corrida finalizada com sucesso.');
  } catch (err) {
    next(err);
  }
};

module.exports = { listarTodas, buscarPorId, criar, cancelar, finalizar };
