const express = require('express');
const { listarTodas, buscarPorId, criar, cancelar, finalizar } = require('./corridas.controller');

const router = express.Router();

router.get('/',           listarTodas);
router.get('/:id',        buscarPorId);
router.post('/',          criar);
router.patch('/:id/cancelar',  cancelar);
router.patch('/:id/finalizar', finalizar);

module.exports = router;
