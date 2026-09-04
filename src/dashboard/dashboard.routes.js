const express = require('express');
const router = express.Router();
const dashboardController = require('./dashboard.controller');

router.get('/resumo',       dashboardController.getResumo.bind(dashboardController));
router.get('/corridas',     dashboardController.getCorridas.bind(dashboardController));
router.get('/origens',      dashboardController.getOrigens.bind(dashboardController));
router.get('/destinos',     dashboardController.getDestinos.bind(dashboardController));
router.get('/rotas',        dashboardController.getRotas.bind(dashboardController));
router.get('/veiculos',     dashboardController.getVeiculos.bind(dashboardController));
router.get('/faturamento',  dashboardController.getFaturamento.bind(dashboardController));

module.exports = router;

