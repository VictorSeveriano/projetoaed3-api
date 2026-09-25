const express = require('express');
const {
  listarTodos, listarAnalise, listarOnline, buscarPerfil,
  buscarPorId, solicitar, aprovar, rejeitar,
  listarCorridas, buscarVeiculo, getRelatorio,
} = require('./motoristas.controller');

const router = express.Router();

// Rotas específicas antes das parametrizadas
router.get('/analise',               listarAnalise);
router.get('/online',                listarOnline);
router.get('/perfil/:usuarioId',     buscarPerfil);

router.get('/',                      listarTodos);
router.post('/',                     solicitar);

router.get('/:id',                   buscarPorId);
router.patch('/:id/aprovar',         aprovar);
router.patch('/:id/rejeitar',        rejeitar);
router.get('/:id/corridas',          listarCorridas);
router.get('/:id/veiculo',           buscarVeiculo);
router.get('/:id/relatorio',         getRelatorio);

module.exports = router;
