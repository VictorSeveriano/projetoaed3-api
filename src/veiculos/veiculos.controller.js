'use strict';
const veiculosService = require('./veiculos.service');
const { success }     = require('../utils/responseHelper');
const AppError        = require('../utils/AppError');

/** GET /api/veiculos/analise — Admin: veículos PENDENTE */
const listarAnalise = async (req, res, next) => {
  try {
    const dados = await veiculosService.listarPendentes();
    return success(res, dados, 'Veículos pendentes listados.');
  } catch (err) { next(err); }
};

/** GET /api/veiculos — Admin: todos (com filtro ?status=) */
const listarTodos = async (req, res, next) => {
  try {
    const dados = await veiculosService.listarTodos(req.query);
    return success(res, dados, 'Veículos listados.');
  } catch (err) { next(err); }
};

/** POST /api/veiculos — Motorista: cadastra veículo */
const cadastrar = async (req, res, next) => {
  try {
    const { usuarioId, ...dadosVeiculo } = req.body;
    if (!usuarioId) return next(new AppError('usuarioId é obrigatório.', 400));
    const veiculo = await veiculosService.cadastrar(usuarioId, dadosVeiculo);
    return res.status(201).json({ success: true, data: veiculo, message: 'Veículo cadastrado. Aguarda aprovação.' });
  } catch (err) { next(err); }
};

/** PATCH /api/veiculos/:id/aprovar — Admin */
const aprovar = async (req, res, next) => {
  try {
    const dados = await veiculosService.aprovar(req.params.id);
    return success(res, dados, 'Veículo aprovado.');
  } catch (err) { next(err); }
};

/** PATCH /api/veiculos/:id/classe — Admin */
const editarClasse = async (req, res, next) => {
  try {
    const { classe } = req.body;
    if (!classe) return next(new AppError('classe é obrigatória.', 400));
    const dados = await veiculosService.editarClasse(req.params.id, classe);
    return success(res, dados, 'Classe do veículo atualizada.');
  } catch (err) { next(err); }
};

/** PATCH /api/veiculos/:id/rejeitar — Admin */
const rejeitar = async (req, res, next) => {
  try {
    const dados = await veiculosService.rejeitar(req.params.id);
    return success(res, dados, 'Veículo rejeitado.');
  } catch (err) { next(err); }
};

module.exports = { listarAnalise, listarTodos, cadastrar, aprovar, rejeitar, editarClasse };
