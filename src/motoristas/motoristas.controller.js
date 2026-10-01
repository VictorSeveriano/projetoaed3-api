'use strict';
const motoristasService = require('./motoristas.service');
const relatorioService  = require('./relatorio.motorista.service');
const { success }       = require('../utils/responseHelper');
const AppError          = require('../utils/AppError');
const auditoriaService  = require('../auditoria/auditoria.service');

/**
 * MotoristasController — Endpoints do módulo de motoristas.
 * Nenhuma regra de negócio aqui.
 */


/** GET /api/motoristas/analise — Admin: lista pendentes */
const listarAnalise = async (req, res, next) => {
  try {
    const dados = await motoristasService.listarPorStatus('PENDENTE');
    return success(res, dados, 'Solicitações pendentes listadas.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/online — Admin: lista ONLINE */
const listarOnline = async (req, res, next) => {
  try {
    const dados = await motoristasService.listarOnline();
    return success(res, dados, 'Motoristas online listados.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/perfil/:usuarioId — Próprio motorista: busca pelo usuarioId */
const buscarPerfil = async (req, res, next) => {
  try {
    const dados = await motoristasService.buscarPorUsuarioId(req.params.usuarioId);
    return success(res, dados, dados ? 'Perfil encontrado.' : 'Sem solicitação registrada.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id — Admin: busca pelo id do registro */
const buscarPorId = async (req, res, next) => {
  try {
    const dados = await motoristasService.buscarPorId(req.params.id);
    return success(res, dados, 'Motorista encontrado.');
  } catch (err) { next(err); }
};

/** POST /api/motoristas — Motorista: solicita cadastro */
const solicitar = async (req, res, next) => {
  try {
    const { usuarioId, cnh } = req.body;
    if (!usuarioId || !cnh) {
      return next(new AppError('usuarioId e cnh são obrigatórios.', 400));
    }
    const motorista = await motoristasService.solicitar(usuarioId, cnh);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'SOLICITACAO_MOTORISTA', modulo: 'MOTORISTAS', resultado: 'SUCESSO', entidade: 'Motorista', entidadeId: motorista.id }, req);
    return res.status(201).json({ success: true, data: motorista, message: 'Solicitação enviada.' });
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'SOLICITACAO_MOTORISTA_FALHA', modulo: 'MOTORISTAS', resultado: 'FALHA' }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/motoristas/:id/aprovar — Admin */
const aprovar = async (req, res, next) => {
  try {
    const dados = await motoristasService.aprovar(req.params.id);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'APROVACAO_MOTORISTA', modulo: 'MOTORISTAS', resultado: 'SUCESSO' }, req, { entidade: 'Motorista', entidadeId: req.params.id });
    return success(res, dados, 'Motorista aprovado com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'APROVACAO_MOTORISTA_FALHA', modulo: 'MOTORISTAS', resultado: 'FALHA' }, req, { entidade: 'Motorista', entidadeId: req.params.id, descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/motoristas/:id/rejeitar — Admin */
const rejeitar = async (req, res, next) => {
  try {
    const dados = await motoristasService.rejeitar(req.params.id);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'REJEICAO_MOTORISTA', modulo: 'MOTORISTAS', resultado: 'SUCESSO' }, req, { entidade: 'Motorista', entidadeId: req.params.id });
    return success(res, dados, 'Motorista rejeitado.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'REJEICAO_MOTORISTA_FALHA', modulo: 'MOTORISTAS', resultado: 'FALHA' }, req, { entidade: 'Motorista', entidadeId: req.params.id, descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** PATCH /api/motoristas/:id — Atualiza dados do motorista */
const atualizar = async (req, res, next) => {
  try {
    const dados = await motoristasService.atualizar(req.params.id, req.body, req.usuario);
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'ALTERACAO_MOTORISTA', modulo: 'MOTORISTAS', resultado: 'SUCESSO' }, req, { entidade: 'Motorista', entidadeId: req.params.id, dadosNovos: req.body });
    return success(res, dados, 'Motorista atualizado com sucesso.');
  } catch (err) {
    await auditoriaService.registrar({ usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'ALTERACAO_MOTORISTA_FALHA', modulo: 'MOTORISTAS', resultado: 'FALHA' }, req, { entidade: 'Motorista', entidadeId: req.params.id, descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

/** GET /api/motoristas/:id/corridas — Corridas do motorista */
const listarCorridas = async (req, res, next) => {
  try {
    const corridas = await motoristasService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do motorista listadas.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id/veiculo — Veículo do motorista */
const buscarVeiculo = async (req, res, next) => {
  try {
    const veiculo = await motoristasService.buscarVeiculo(req.params.id);
    return success(res, veiculo, veiculo ? 'Veículo encontrado.' : 'Nenhum veículo associado.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id/relatorio?mes=&ano= */
const getRelatorio = async (req, res, next) => {
  try {
    const mes = parseInt(req.query.mes, 10);
    const ano = parseInt(req.query.ano, 10);
    if (!mes || mes < 1 || mes > 12 || !ano || ano < 2000) {
      return next(new AppError('Parâmetros mes (1-12) e ano são obrigatórios.', 400));
    }
    const relatorio = await relatorioService.gerarRelatorioMensal(req.params.id, mes, ano);
    return success(res, relatorio, 'Relatório gerado com sucesso.');
  } catch (err) { next(err); }
};

module.exports = {
  listarAnalise, listarOnline, buscarPerfil,
  buscarPorId, solicitar, aprovar, rejeitar,
  listarCorridas, buscarVeiculo, getRelatorio, atualizar
};
