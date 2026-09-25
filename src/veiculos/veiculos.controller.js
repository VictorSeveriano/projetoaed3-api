const veiculosService = require('./veiculos.service');
const { success } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');

/** GET /api/veiculos/analise — Admin: veículos PENDENTE */
const listarAnalise = (req, res, next) => {
  try {
    const dados = veiculosService.listarPendentes();
    return success(res, dados, 'Veículos pendentes listados.');
  } catch (err) { next(err); }
};

/** GET /api/veiculos — Admin: todos (com filtro ?status=) */
const listarTodos = (req, res, next) => {
  try {
    const dados = veiculosService.listarTodos(req.query);
    return success(res, dados, 'Veículos listados.');
  } catch (err) { next(err); }
};

/** POST /api/veiculos — Motorista: cadastra veículo */
const cadastrar = (req, res, next) => {
  try {
    const { usuarioId, ...dadosVeiculo } = req.body;
    if (!usuarioId) return next(new AppError('usuarioId é obrigatório.', 400));
    const veiculo = veiculosService.cadastrar(usuarioId, dadosVeiculo);
    return res.status(201).json({ success: true, data: veiculo, message: 'Veículo cadastrado. Aguarda aprovação.' });
  } catch (err) { next(err); }
};

/** PATCH /api/veiculos/:id/aprovar — Admin */
const aprovar = (req, res, next) => {
  try {
    const dados = veiculosService.aprovar(req.params.id);
    return success(res, dados, 'Veículo aprovado.');
  } catch (err) { next(err); }
};

/** PATCH /api/veiculos/:id/rejeitar — Admin */
const rejeitar = (req, res, next) => {
  try {
    const dados = veiculosService.rejeitar(req.params.id);
    return success(res, dados, 'Veículo rejeitado.');
  } catch (err) { next(err); }
};

module.exports = { listarAnalise, listarTodos, cadastrar, aprovar, rejeitar };
