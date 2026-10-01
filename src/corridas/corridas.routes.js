const express = require('express');
const {
  listarTodas, listarMinhas, buscarPorId, criar, calcularValorPrevia,
  aceitar, recusar, cancelar, confirmarPagamento, finalizar,
} = require('./corridas.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/',                          listarTodas);
router.get('/minhas',                    listarMinhas);
router.get('/:id',                       buscarPorId);
router.post('/calcular-valor',           calcularValorPrevia);
router.post('/',                         criar);
router.patch('/:id/aceitar',             authMiddleware, aceitar);
router.patch('/:id/recusar',             recusar);
router.patch('/:id/cancelar',            cancelar);
router.patch('/:id/confirmar-pagamento', confirmarPagamento);
router.patch('/:id/finalizar',           finalizar);

module.exports = router;
