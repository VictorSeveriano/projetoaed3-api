const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');

router.get('/resumo', dashboardController.getResumo);
router.get('/reservas', dashboardController.getReservas);
router.get('/locais', dashboardController.getLocais);
router.get('/carros', dashboardController.getCarros);
router.get('/receitas', dashboardController.getReceitas);

module.exports = router;
