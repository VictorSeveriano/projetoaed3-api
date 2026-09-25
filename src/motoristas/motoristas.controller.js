const motoistasService = require('./motoristas.service');
const relatorioService = require('./relatorio.motorista.service');
const { success } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');

/**
 * MotoristasController — Endpoints do módulo de motoristas.
 * Nenhuma regra de negócio aqui.
 */

/** GET /api/motoristas — Admin: lista todos (com filtro opcional ?status=) */
const listarTodos = (req, res, next) => {
  try {
    const { status } = req.query;
    const dados = motoistasService.listarPorStatus(status || null);
    return success(res, dados, 'Motoristas listados.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/analise — Admin: lista pendentes */
const listarAnalise = (req, res, next) => {
  try {
    const dados = motoistasService.listarPorStatus('PENDENTE');
    return success(res, dados, 'Solicitações pendentes listadas.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/online — Admin: lista ONLINE */
const listarOnline = (req, res, next) => {
  try {
    const dados = motoistasService.listarOnline();
    return success(res, dados, 'Motoristas online listados.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/perfil/:usuarioId — Próprio motorista: busca pelo usuarioId */
const buscarPerfil = (req, res, next) => {
  try {
    const dados = motoistasService.buscarPorUsuarioId(req.params.usuarioId);
    return success(res, dados, dados ? 'Perfil encontrado.' : 'Sem solicitação registrada.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id — Admin: busca pelo id do registro */
const buscarPorId = (req, res, next) => {
  try {
    const dados = motoistasService.buscarPorId(req.params.id);
    return success(res, dados, 'Motorista encontrado.');
  } catch (err) { next(err); }
};

/** POST /api/motoristas — Motorista: solicita cadastro */
const solicitar = (req, res, next) => {
  try {
    const { usuarioId, cnh } = req.body;
    if (!usuarioId || !cnh) {
      return next(new AppError('usuarioId e cnh são obrigatórios.', 400));
    }
    const motorista = motoistasService.solicitar(usuarioId, cnh);
    return res.status(201).json({ success: true, data: motorista, message: 'Solicitação enviada.' });
  } catch (err) { next(err); }
};

/** PATCH /api/motoristas/:id/aprovar — Admin */
const aprovar = (req, res, next) => {
  try {
    const dados = motoistasService.aprovar(req.params.id);
    return success(res, dados, 'Motorista aprovado com sucesso.');
  } catch (err) { next(err); }
};

/** PATCH /api/motoristas/:id/rejeitar — Admin */
const rejeitar = (req, res, next) => {
  try {
    const dados = motoistasService.rejeitar(req.params.id);
    return success(res, dados, 'Motorista rejeitado.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id/corridas — Corridas do motorista */
const listarCorridas = (req, res, next) => {
  try {
    // :id aqui é o usuarioId do motorista (ex: '4', '5')
    const corridas = motoistasService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do motorista listadas.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id/veiculo — Veículo do motorista */
const buscarVeiculo = (req, res, next) => {
  try {
    const veiculo = motoistasService.buscarVeiculo(req.params.id);
    return success(res, veiculo, veiculo ? 'Veículo encontrado.' : 'Nenhum veículo associado.');
  } catch (err) { next(err); }
};

/** GET /api/motoristas/:id/relatorio?mes=&ano= */
const getRelatorio = (req, res, next) => {
  try {
    const mes = parseInt(req.query.mes, 10);
    const ano = parseInt(req.query.ano, 10);
    if (!mes || mes < 1 || mes > 12 || !ano || ano < 2000) {
      return next(new AppError('Parâmetros mes (1-12) e ano são obrigatórios.', 400));
    }
    const relatorio = relatorioService.gerarRelatorioMensal(req.params.id, mes, ano);
    return success(res, relatorio, 'Relatório gerado com sucesso.');
  } catch (err) { next(err); }
};

module.exports = {
  listarTodos, listarAnalise, listarOnline, buscarPerfil,
  buscarPorId, solicitar, aprovar, rejeitar,
  listarCorridas, buscarVeiculo, getRelatorio,
};
