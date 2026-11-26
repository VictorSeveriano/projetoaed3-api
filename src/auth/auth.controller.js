'use strict';
const authService = require('./auth.service');
const { success } = require('../utils/responseHelper');
const AppError = require('../utils/AppError');
const auditoriaService = require('../auditoria/auditoria.service');

/**
 * AuthController — Controlador de autenticacao.
 */
const login = async (req, res, next) => {
  try {
    const { usuario, senha } = req.body;
    const resultado = await authService.login(usuario, senha);
    await auditoriaService.registrar({ usuarioId: resultado.usuario.id, perfil: resultado.usuario.perfil, acao: 'LOGIN_SUCESSO', modulo: 'AUTH', resultado: 'SUCESSO' }, req, { descricao: `Usuário ${usuario} logou.` });
    return success(res, resultado, 'Login realizado com sucesso');
  } catch (err) {
    await auditoriaService.registrar({ acao: 'LOGIN_FALHA', modulo: 'AUTH', resultado: 'FALHA' }, req, { descricao: `Falha ao logar usuário: ${req.body.usuario}. Erro: ${err.message}`, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

const verificarDisponibilidadeCadastro = async (req, res, next) => {
  try {
    const resultado = await authService.verificarDisponibilidadeCadastro(req.body);
    return success(res, resultado, 'Disponibilidade dos dados verificada.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/cadastrar
 * Cria conta publica (USUARIO ou MOTORISTA — nunca ADMINISTRADOR).
 */
const cadastrar = async (req, res, next) => {
  try {
    const { nome, cpf, celular, email, senha, perfil, endereco, cnh } = req.body;
    if (!nome || !senha || !perfil || !cpf || !celular || !email) {
      return next(new AppError('Campos obrigatórios ausentes.', 400));
    }
    if (perfil === 'ADMINISTRADOR') {
      return next(new AppError('Nao e possivel criar conta de administrador pelo cadastro publico.', 403));
    }
    const resultado = await authService.cadastrar({ nome, cpf, celular, email, senha, perfil, endereco, cnh });
    const acao = perfil === 'MOTORISTA' ? 'CADASTRO_MOTORISTA' : 'CADASTRO_USUARIO';
    await auditoriaService.registrar({ usuarioId: resultado.usuario.id, perfil: resultado.usuario.perfil, acao, modulo: 'AUTH', resultado: 'SUCESSO' }, req, { descricao: `Conta ${perfil} criada.` });
    return res.status(201).json({ success: true, data: resultado, message: 'Conta criada com sucesso.' });
  } catch (err) {
    const acao = req.body.perfil === 'MOTORISTA' ? 'CADASTRO_MOTORISTA_FALHA' : 'CADASTRO_USUARIO_FALHA';
    await auditoriaService.registrar({ acao, modulo: 'AUTH', resultado: 'FALHA' }, req, { descricao: err.message, statusHttp: err.statusCode || 500 });
    next(err);
  }
};

module.exports = { login, cadastrar, verificarDisponibilidadeCadastro };
