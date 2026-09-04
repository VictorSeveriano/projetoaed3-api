const rotasService = require('./rotas.service');
const grafoService = require('../grafo/grafo.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * RotasController — Controlador para endpoints de rotas.
 *
 * Endpoints:
 * - GET  /api/rotas/locais            — Lista todos os locais cadastrados
 * - POST /api/rotas/calcular-corrida  — Calcula multiplas rotas entre origem e destino
 * - POST /api/rotas/geocodificar      — Geocodifica um CEP/endereco (ViaCEP + Nominatim)
 */

/**
 * GET /api/rotas/locais
 * Retorna todos os locais disponiveis com coordenadas geograficas.
 */
const listarLocais = (req, res, next) => {
  try {
    const locais = grafoService.obterVertices();
    return success(res, locais, 'Locais retornados com sucesso.');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/rotas/calcular-corrida
 * Body: { origem: { nome, lat, lng }, destino: { nome, lat, lng } }
 *
 * Calcula multiplas rotas entre dois locais usando:
 * 1. RouteSearchTree (BFS) para encontrar caminhos alternativos
 * 2. Dijkstra para calcular distancias
 * 3. Google Routes API para enriquecer a melhor rota (se disponivel)
 *
 * Retorna: { origemNome, destinoNome, rotas: [], melhorRota: {} }
 */
const calcularCorrida = async (req, res, next) => {
  try {
    const { origem, destino } = req.body;

    if (!origem || !destino || !origem.lat || !destino.lat) {
      return next(new AppError('Origem e destino com latitude e longitude sao obrigatorios.', 400));
    }

    if (origem.nome.trim().toLowerCase() === destino.nome.trim().toLowerCase() && origem.nome !== '') {
      return next(new AppError('Origem e destino devem ser diferentes.', 400));
    }

    const resultado = await rotasService.calcularCorrida(origem, destino);
    return success(res, resultado, 'Rotas calculadas com sucesso.');
  } catch (err) {
    if (err.statusCode) return next(new AppError(err.message, err.statusCode));
    next(err);
  }
};

/**
 * POST /api/rotas/geocodificar
 * Body: { cep } ou { endereco }
 *
 * Fluxo completo:
 *   CEP -> ViaCEP -> endereco estruturado em JSON -> Nominatim -> lat/lng
 *
 * Retorna: { endereco: { cep, logradouro, bairro, cidade, uf, pais }, latitude, longitude }
 */
const geocodificar = async (req, res, next) => {
  try {
    const { cep, endereco } = req.body;
    const entrada = cep || endereco;

    if (!entrada) {
      return next(new AppError('Informe um CEP ou endereco para geocodificar.', 400));
    }

    const resultado = await rotasService.geocodificar(entrada);
    return success(res, resultado, 'Geocodificacao realizada com sucesso.');
  } catch (err) {
    if (err.statusCode) return next(new AppError(err.message, err.statusCode));
    next(err);
  }
};

module.exports = { listarLocais, calcularCorrida, geocodificar };

