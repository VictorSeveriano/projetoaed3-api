const express = require('express');
const { buscarPorId, listarCorridas, buscarVeiculo, getRelatorio } = require('./motoristas.controller');

const router = express.Router();

router.get('/:id',           buscarPorId);
router.get('/:id/corridas',  listarCorridas);
router.get('/:id/veiculo',   buscarVeiculo);
router.get('/:id/relatorio', getRelatorio);

module.exports = router;
