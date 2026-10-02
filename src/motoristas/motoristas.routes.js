const express = require('express');
const {
  listarAnalise, listarOnline, buscarPerfil,
  buscarPorId, solicitar, aprovar, rejeitar,
  listarCorridas, buscarVeiculo, getRelatorio, atualizar
} = require('./motoristas.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

// Rotas específicas antes das parametrizadas
router.get('/analise',               authMiddleware, requireAdmin, listarAnalise);
router.get('/online',                authMiddleware, listarOnline);
router.get('/perfil/:usuarioId',     authMiddleware, buscarPerfil);
router.post('/',                     authMiddleware, solicitar);

router.get('/:id',                   authMiddleware, buscarPorId);
router.patch('/:id',                 authMiddleware, atualizar);
router.patch('/:id/aprovar',         authMiddleware, requireAdmin, aprovar);
router.patch('/:id/rejeitar',        authMiddleware, requireAdmin, rejeitar);
router.get('/:id/corridas',          authMiddleware, listarCorridas);
router.get('/:id/veiculo',           authMiddleware, buscarVeiculo);
router.get('/:id/relatorio',         authMiddleware, getRelatorio);

module.exports = router;
