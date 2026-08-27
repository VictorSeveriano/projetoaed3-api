const grafoService = require('./grafo.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * GrafoController — Controlador para endpoints do grafo.
 * Responsavel apenas por receber requisicoes e delegar ao service.
 */

/**
 * GET /api/grafo
 * Retorna a estrutura completa do grafo (vertices, arestas, adjacencia).
 */
const obterGrafo = (req, res, next) => {
  try {
    const grafo = grafoService.obterGrafoCompleto();
    return success(res, grafo, 'Grafo retornado com sucesso');
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/grafo/rota?origem=Centro&destino=Aeroporto
 * Calcula o menor caminho entre dois vertices usando Dijkstra.
 */
const calcularRota = (req, res, next) => {
  try {
    const { origem, destino } = req.query;

    if (!origem || !destino) {
      return next(new AppError('Parametros "origem" e "destino" sao obrigatorios.', 400));
    }

    if (!grafoService.localizacaoExiste(origem)) {
      return next(new AppError(`Localizacao de origem '${origem}' nao encontrada no grafo.`, 404));
    }

    if (!grafoService.localizacaoExiste(destino)) {
      return next(new AppError(`Localizacao de destino '${destino}' nao encontrada no grafo.`, 404));
    }

    const rota = grafoService.calcularRota(origem, destino);

    if (!rota) {
      return next(new AppError(`Nao existe caminho entre '${origem}' e '${destino}'.`, 404));
    }

    return success(res, rota, 'Rota calculada com sucesso');
  } catch (err) {
    next(err);
  }
};

module.exports = { obterGrafo, calcularRota };
