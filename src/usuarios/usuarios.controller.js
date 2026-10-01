'use strict';
const usuariosService = require('./usuarios.service');
const { success }     = require('../utils/responseHelper');
const auditoriaService = require('../auditoria/auditoria.service');

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
    const dados = await usuariosService.atualizar(req.params.id, req.body, req.usuario);
    await auditoriaService.registrar(
      { usuarioId: req.usuario.id, perfil: req.usuario.perfil, acao: 'ALTERACAO_USUARIO', modulo: 'USUARIOS', resultado: 'SUCESSO' },
      req,
      { entidade: 'Usuario', entidadeId: req.params.id, dadosNovos: req.body }
    );
    return success(res, dados, 'Usuário atualizado com sucesso.');
  } catch (err) {
    await auditoriaService.registrar(
      { usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'ALTERACAO_USUARIO_FALHA', modulo: 'USUARIOS', resultado: 'FALHA' },
      req,
      { entidade: 'Usuario', entidadeId: req.params.id, descricao: err.message, statusHttp: err.statusCode || 500 }
    );
    next(err);
  }
};

/** POST /api/usuarios — Admin */
const criar = async (req, res, next) => {
  try {
    const dados = await usuariosService.criar(req.body, req.usuario);
    await auditoriaService.registrar(
      { usuarioId: req.usuario.id, perfil: req.usuario.perfil, acao: 'CRIACAO_USUARIO', modulo: 'USUARIOS', resultado: 'SUCESSO' },
      req,
      { entidade: 'Usuario', entidadeId: dados.id, dadosNovos: dados }
    );
    return success(res, dados, 'Usuário criado com sucesso.', 201);
  } catch (err) {
    await auditoriaService.registrar(
      { usuarioId: req.usuario?.id, perfil: req.usuario?.perfil, acao: 'CRIACAO_USUARIO_FALHA', modulo: 'USUARIOS', resultado: 'FALHA' },
      req,
      { entidade: 'Usuario', descricao: err.message, statusHttp: err.statusCode || 500 }
    );
    next(err);
  }
};

/** GET /api/usuarios/:id/corridas */
const listarCorridas = async (req, res, next) => {
  try {
    const corridas = await usuariosService.listarCorridas(req.params.id);
    return success(res, corridas, 'Corridas do usuário listadas.');
  } catch (err) { next(err); }
};

module.exports = { buscarPorId, listarCorridas, listarTodos, atualizar, criar };
