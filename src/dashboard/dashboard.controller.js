const dashboardService = require('./dashboard.service');

/**
 * DashboardController — Endpoints de metricas do sistema de corridas.
 */
class DashboardController {
  getResumo(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getResumo() });
    } catch (err) { next(err); }
  }

  getCorridas(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getCorridasPorMes() });
    } catch (err) { next(err); }
  }

  getOrigens(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getOrigensMaisSolicitadas() });
    } catch (err) { next(err); }
  }

  getDestinos(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getDestinosMaisSolicitados() });
    } catch (err) { next(err); }
  }

  getRotas(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getRotasMaisUtilizadas() });
    } catch (err) { next(err); }
  }

  getVeiculos(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getVeiculosMaisUtilizados() });
    } catch (err) { next(err); }
  }

  getFaturamento(req, res, next) {
    try {
      res.json({ success: true, data: dashboardService.getFaturamentoMensal() });
    } catch (err) { next(err); }
  }
}

module.exports = new DashboardController();
