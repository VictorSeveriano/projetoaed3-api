const dashboardService = require('./dashboard.service');
const AppError = require('../utils/AppError');

class DashboardController {
  async getResumo(req, res, next) {
    try {
      const resumo = dashboardService.getResumo();
      res.json({ success: true, data: resumo });
    } catch (err) {
      next(err);
    }
  }

  async getReservas(req, res, next) {
    try {
      const dados = dashboardService.getReservasPorMes();
      res.json({ success: true, data: dados });
    } catch (err) {
      next(err);
    }
  }

  async getLocais(req, res, next) {
    try {
      const dados = dashboardService.getLocaisMaisSolicitados();
      res.json({ success: true, data: dados });
    } catch (err) {
      next(err);
    }
  }

  async getCarros(req, res, next) {
    try {
      const dados = dashboardService.getCarrosMaisReservados();
      res.json({ success: true, data: dados });
    } catch (err) {
      next(err);
    }
  }

  async getReceitas(req, res, next) {
    try {
      const dados = dashboardService.getReceitasPorMes();
      res.json({ success: true, data: dados });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DashboardController();
