'use strict';
const dashboardService = require('./dashboard.service');
const relatorioDashboardService = require('./relatorioDashboard.service');
const auditoriaService = require('../auditoria/auditoria.service');
const { enviarArquivoExportado } = require('../utils/exportacaoHelper');

/**
 * DashboardController — Endpoints de métricas e exportação do Dashboard.
 */
class DashboardController {
  async getCompleto(req, res, next) {
    try {
      res.json({ success: true, data: await dashboardService.getCompleto(req.query) });
    } catch (err) { next(err); }
  }

  async exportarRelatorio(req, res, next) {
    try {
      const arquivo = await relatorioDashboardService.exportar(req.query, req.usuario);
      await auditoriaService.registrar(
        {
          usuarioId: req.usuario?.id,
          perfil: req.usuario?.perfil,
          acao: 'EXPORTACAO_RELATORIO_DASHBOARD',
          modulo: 'DASHBOARD',
          resultado: 'SUCESSO',
        },
        req,
        {
          descricao: `Exportação de dashboard (${String(req.query.formato || 'csv').toUpperCase()})`,
        }
      );
      return enviarArquivoExportado(res, arquivo);
    } catch (err) { next(err); }
  }

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
