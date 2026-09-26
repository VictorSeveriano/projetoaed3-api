const express = require('express');
const {
  listarTodas, listarMinhas, buscarPorId, criar,
  aceitar, recusar, cancelar, confirmarPagamento, finalizar,
} = require('./corridas.controller');

const router = express.Router();

router.get('/',                          listarTodas);
router.get('/minhas',                    listarMinhas);
router.get('/:id',                       buscarPorId);
router.post('/',                         criar);
router.patch('/:id/aceitar',             aceitar);
router.patch('/:id/recusar',             recusar);
router.patch('/:id/cancelar',            cancelar);
router.patch('/:id/confirmar-pagamento', confirmarPagamento);
router.patch('/:id/finalizar',           finalizar);

module.exports = router;
