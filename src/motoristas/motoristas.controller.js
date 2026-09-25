const motoistasService = require('./motoristas.service');
const relatorioService = require('./relatorio.motorista.service');
const { success } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');

/**
 * MotoristasController — Endpoints para dados do próprio motorista.
 * Nenhuma regra de negócio aqui.
 */

/**
 * GET /api/motoristas/:id
 * Retorna perfil do motorista (sem senha).
 */
const buscarPorId = (req, res, next) => {
  try {
    const dados = motoistasService.buscarPorId(req.params.id);
    return success(res, dados, 'Motorista encontrado.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/motoristas/:id/corridas
 * Lista corridas do motorista autenticado.
 */
const listarCorridas = (req, res, next) => {
  try {
    const corridas = motoistasService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do motorista listadas.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/motoristas/:id/veiculo
 * Retorna o veículo associado ao motorista.
 */
const buscarVeiculo = (req, res, next) => {
  try {
    const veiculo = motoistasService.buscarVeiculo(req.params.id);
    return success(res, veiculo, veiculo ? 'Veículo encontrado.' : 'Nenhum veículo associado.');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/motoristas/:id/relatorio?mes=&ano=
 * Relatório mensal do motorista.
 */
const getRelatorio = (req, res, next) => {
  try {
    const mes = parseInt(req.query.mes, 10);
    const ano = parseInt(req.query.ano, 10);

    if (!mes || mes < 1 || mes > 12 || !ano || ano < 2000) {
      return next(new AppError('Parâmetros mes (1-12) e ano são obrigatórios.', 400));
    }

    const relatorio = relatorioService.gerarRelatorioMensal(req.params.id, mes, ano);
    return success(res, relatorio, 'Relatório gerado com sucesso.');
  } catch (err) {
    next(err);
  }
};

module.exports = { buscarPorId, listarCorridas, buscarVeiculo, getRelatorio };
