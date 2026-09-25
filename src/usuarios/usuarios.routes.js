const express = require('express');
const { buscarPorId, listarCorridas } = require('./usuarios.controller');

const router = express.Router();

router.get('/:id',          buscarPorId);
router.get('/:id/corridas', listarCorridas);

module.exports = router;
