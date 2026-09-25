'use strict';
const dashboardService = require('./dashboard.service');

/**
 * DashboardController — Endpoints de metricas do sistema de corridas.
 * Todos os métodos são async para suportar o service PostgreSQL.
 */
class DashboardController {
  async getResumo(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getResumo() });
    } catch (err) { next(err); }
  }

  async getCorridas(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getCorridasPorMes() });
    } catch (err) { next(err); }
  }

  async getOrigens(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getOrigensMaisSolicitadas() });
    } catch (err) { next(err); }
  }

  async getDestinos(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getDestinosMaisSolicitados() });
    } catch (err) { next(err); }
  }

  async getRotas(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getRotasMaisUtilizadas() });
    } catch (err) { next(err); }
  }

  async getVeiculos(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getVeiculosMaisUtilizados() });
    } catch (err) { next(err); }
  }

  async getFaturamento(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getFaturamentoMensal() });
    } catch (err) { next(err); }
  }
}

module.exports = new DashboardController();
