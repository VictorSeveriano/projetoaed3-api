const grafoService = require('./grafo.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * GrafoController — Controlador para endpoints do grafo dinâmico.
 * Responsável apenas por receber requisições e delegar ao service.
 */

/**
 * GET /api/grafo?origemNome=X&origemLat=Y&origemLng=Z&destinoNome=A&destinoLat=B&destinoLng=C&distanciaMetros=D
 *
 * Retorna a estrutura do grafo dinâmico construído para uma operação específica.
 * Os parâmetros descrevem origem, destino e a distância real da rota selecionada.
 *
 * Quando chamado sem parâmetros, retorna a estrutura esperada com valores de exemplo.
 */
const obterGrafo = (req, res, next) => {
  try {
    const {
      origemNome,
      origemLat,
      origemLng,
      destinoNome,
      destinoLat,
      destinoLng,
      distanciaMetros,
    } = req.query;

    // Sem parâmetros: documenta a estrutura vazia e como usar
    if (!origemNome || !destinoNome) {
      return success(res, {
        descricao: 'Grafo dinâmico — criado por operação de rota, nunca com pontos fixos.',
        uso: 'Forneça origemNome, origemLat, origemLng, destinoNome, destinoLat, destinoLng e distanciaMetros.',
        grafo: { vertices: [], arestas: [], adjacencia: {} },
      }, 'Grafo retornado com sucesso');
    }

    const lat = parseFloat(origemLat);
    const lng = parseFloat(origemLng);
    const dLat = parseFloat(destinoLat);
    const dLng = parseFloat(destinoLng);
    const distM = parseFloat(distanciaMetros);

    if (!Number.isFinite(distM) || distM <= 0) {
      return next(new AppError('Distância inválida. Forneça um valor numérico maior que zero.', 400));
    }

    const isValidCoord = (l, g) => Number.isFinite(l) && l >= -90 && l <= 90 && Number.isFinite(g) && g >= -180 && g <= 180;

    if (!isValidCoord(lat, lng) || !isValidCoord(dLat, dLng)) {
      return next(new AppError('Coordenadas inválidas. Forneça valores numéricos válidos para lat/lng.', 400));
    }

    const grafo = grafoService.obterGrafoDaOperacao(
      { nome: origemNome, lat, lng },
      { nome: destinoNome, lat: dLat, lng: dLng },
      distM,
    );

    return success(res, grafo, 'Grafo da operação retornado com sucesso');
  } catch (err) {
    next(err);
  }
};

module.exports = { obterGrafo };
