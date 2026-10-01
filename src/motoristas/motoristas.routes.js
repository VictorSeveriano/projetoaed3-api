const express = require('express');
const {
  listarAnalise, listarOnline, buscarPerfil,
  buscarPorId, solicitar, aprovar, rejeitar,
  listarCorridas, buscarVeiculo, getRelatorio, atualizar
} = require('./motoristas.controller');
const { authMiddleware, requireAdmin } = require('../middlewares/auth.middleware');

const router = express.Router();

// Rotas específicas antes das parametrizadas
router.get('/analise',               listarAnalise);
router.get('/online',                listarOnline);
router.get('/perfil/:usuarioId',     buscarPerfil);


router.post('/',                     solicitar);

router.get('/:id',                   buscarPorId);
router.patch('/:id',                 authMiddleware, atualizar);
router.patch('/:id/aprovar',         authMiddleware, requireAdmin, aprovar);
router.patch('/:id/rejeitar',        authMiddleware, requireAdmin, rejeitar);
router.get('/:id/corridas',          listarCorridas);
router.get('/:id/veiculo',           buscarVeiculo);
router.get('/:id/relatorio',         getRelatorio);

module.exports = router;
