'use strict';
const corridasService = require('./corridas.service');
const AppError        = require('../utils/AppError');
const { success }     = require('../utils/responseHelper');
const auditoriaService = require('../auditoria/auditoria.service');

/**
 * CorridasController — Controlador HTTP para corridas.
 * Nenhuma regra de negocio aqui.
 */

/** GET /api/corridas — Admin: lista todas */
const listarTodas = async (req, res, next) => {
  try {
    const corridas = await corridasService.listarTodas();
    return success(res, corridas, 'Corridas listadas com sucesso.');
  } catch (err) { next(err); }
};

/**
 * GET /api/corridas/minhas
 * Lista corridas filtradas por perfil do usuario autenticado.
 * Query params: usuarioId, perfil, status (opcional)
 */
const listarMinhas = async (req, res, next) => {
  try {
    const { usuarioId, perfil, status } = req.query;
    if (!usuarioId || !perfil) {
      return next(new AppError('usuarioId e perfil sao obrigatorios.', 400));
    }
    const corridas = await corridasService.listarPorPerfil(usuarioId, perfil, status || null);
    return success(res, corridas, 'Corridas listadas.');
  } catch (err) { next(err); }
};

/** GET /api/corridas/:id */
const buscarPorId = async (req, res, next) => {
  try {
    const corrida = await corridasService.buscarPorId(req.params.id);
    return success(res, corrida, 'Corrida encontrada.');
  } catch (err) { next(err); }
};

/** POST /api/corridas/calcular-valor */
const calcularValorPrevia = (req, res, next) => {
  try {
    const { distanciaKm, classe, dataHorario } = req.body;
    if (distanciaKm == null || !classe || !dataHorario) {
      return next(new AppError('Campos obrigatorios para calculo: distanciaKm, classe, dataHorario.', 400));
    }
    const valor = corridasService.calcularValor({ distanciaKm, classe, dataHorario });
    return success(res, { valor }, 'Valor calculado com sucesso.');
  } catch (err) { next(err); }
};

/** POST /api/corridas */
const criar = async (req, res, next) => {
  try {
    const { usuarioId, origemNome, destinoNome, distanciaKm } = req.body;
    if (!usuarioId || !origemNome || !destinoNome || distanciaKm == null) {
      return next(new AppError('Campos obrigatorios: usuarioId, origemNome, destinoNome, distanciaKm.', 400));
    }
    const novaCorrida = await corridasService.criar(req.body);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || usuarioId, perfil: req.usuario?.perfil, acao: 'SOLICITACAO_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: novaCorrida.id }, req);
    return res.status(201).json({ success: true, data: novaCorrida, message: 'Corrida criada com sucesso.' });
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || req.body.usuarioId, perfil: req.usuario?.perfil, acao: 'SOLICITACAO_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA' }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/corridas/:id/aceitar — Motorista aceita a corrida */
const aceitar = async (req, res, next) => {
  try {
    const corridaAceita = await corridasService.aceitar(req.params.id, req.usuario.id);
    await auditoriaService.registrar({ usuarioId: req.usuario.id, perfil: req.usuario.perfil, acao: 'ACEITE_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: req.params.id }, req);
    return success(res, corridaAceita, 'Corrida aceita com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'ACEITE_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA', entidade: 'Corrida', entidadeId: req.params.id }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/corridas/:id/recusar — Motorista recusa a corrida */
const recusar = async (req, res, next) => {
  try {
    const { motoristaUsuarioId } = req.body;
    if (!motoristaUsuarioId) {
      return next(new AppError('motoristaUsuarioId e obrigatorio.', 400));
    }
    const resultado = await corridasService.recusar(req.params.id, motoristaUsuarioId);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || motoristaUsuarioId, perfil: req.usuario?.perfil || 'MOTORISTA', acao: 'RECUSA_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: req.params.id }, req);
    return success(res, resultado, 'Corrida recusada.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || req.body.motoristaUsuarioId, perfil: req.usuario?.perfil || 'MOTORISTA', acao: 'RECUSA_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA', entidade: 'Corrida', entidadeId: req.params.id }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/corridas/:id/cancelar */
const cancelar = async (req, res, next) => {
  try {
    const corridaCancelada = await corridasService.cancelar(req.params.id);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'CANCELAMENTO_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: req.params.id }, req);
    return success(res, corridaCancelada, 'Corrida cancelada com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'CANCELAMENTO_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA', entidade: 'Corrida', entidadeId: req.params.id }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/**
 * PATCH /api/corridas/:id/confirmar-pagamento
 * Motorista confirma recebimento do pagamento e finaliza a corrida.
 * A corrida só é FINALIZADA após este passo.
 */
const confirmarPagamento = async (req, res, next) => {
  try {
    const { motoristaUsuarioId } = req.body;
    const corridaFinalizada = await corridasService.confirmarPagamentoEFinalizar(
      req.params.id,
      motoristaUsuarioId || null
    );
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || motoristaUsuarioId, perfil: req.usuario?.perfil, acao: 'FINALIZACAO_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: req.params.id }, req);
    return success(res, corridaFinalizada, 'Pagamento confirmado. Corrida finalizada com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id || req.body.motoristaUsuarioId, perfil: req.usuario?.perfil, acao: 'FINALIZACAO_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA', entidade: 'Corrida', entidadeId: req.params.id }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/corridas/:id/finalizar — Admin ou motorista */
const finalizar = async (req, res, next) => {
  try {
    const corridaFinalizada = await corridasService.finalizar(req.params.id);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'FINALIZACAO_CORRIDA', modulo: 'CORRIDAS', resultado: 'SUCESSO', entidade: 'Corrida', entidadeId: req.params.id }, req);
    return success(res, corridaFinalizada, 'Corrida finalizada com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'FINALIZACAO_CORRIDA_FALHA', modulo: 'CORRIDAS', resultado: 'FALHA', entidade: 'Corrida', entidadeId: req.params.id }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

module.exports = {
  listarTodas, listarMinhas, buscarPorId, criar, calcularValorPrevia,
  aceitar, recusar, cancelar, confirmarPagamento, finalizar,
};
