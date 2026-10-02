'use strict';
const notificacoesService = require('./notificacoes.service');
const { success }         = require('../utils/responseHelper');

/** GET /api/notificacoes?destinatarioId= */
const listar = async (req, res, next) => {
  try {
    const destinatarioId = req.usuario.id;
    const dados    = await notificacoesService.listar(destinatarioId);
    const naoLidas = await notificacoesService.contarNaoLidas(destinatarioId);
    return success(res, { notificacoes: dados, naoLidas }, 'Notificações listadas.');
  } catch (err) { next(err); }
};

/** PATCH /api/notificacoes/:id/ler */
const marcarLida = async (req, res, next) => {
  try {
    const n = await notificacoesService.marcarLida(req.params.id, req.usuario);
    return success(res, n, 'Notificação marcada como lida.');
  } catch (err) { next(err); }
};

/** PATCH /api/notificacoes/ler-todas */
const marcarTodasLidas = async (req, res, next) => {
  try {
    const destinatarioId = req.usuario.id;
    await notificacoesService.marcarTodasLidas(destinatarioId);
    return success(res, null, 'Todas as notificações marcadas como lidas.');
  } catch (err) { next(err); }
};

module.exports = { listar, marcarLida, marcarTodasLidas };
