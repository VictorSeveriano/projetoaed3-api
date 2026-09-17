const rotasService = require('./rotas.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * RotasController — Controlador para endpoints de rotas.
 *
 * Endpoints:
 * - POST /api/rotas/calcular-corrida  — Calcula multiplas rotas entre origem e destino
 * - POST /api/rotas/geocodificar      — Geocodifica um CEP/endereco (ViaCEP + Nominatim)
 * - GET  /api/rotas/sugestoes?q=...   — Autocomplete: texto → sugestoes (Nominatim)
 */

/**
 * POST /api/rotas/calcular-corrida
 * Body: { origem: { nome, lat, lng }, destino: { nome, lat, lng } }
 *
 * Calcula multiplas rotas reais entre dois locais usando:
 * 1. Google Routes API para rotas reais pela malha viaria
 * 2. ABB para organizar as alternativas por distancia crescente
 *
 * Retorna: { origemNome, destinoNome, rotas: [], melhorRota: {} }
 */
const calcularCorrida = async (req, res, next) => {
  try {
    const { origem, destino } = req.body;

    if (!origem || !destino) {
      return next(new AppError('Origem e destino são obrigatórios.', 400));
    }

    if (typeof origem.nome !== 'string' || typeof destino.nome !== 'string') {
      return next(new AppError('Os nomes da origem e destino devem ser textos válidos.', 400));
    }

    const origemNomeTrim = origem.nome.trim();
    const destinoNomeTrim = destino.nome.trim();

    if (!origemNomeTrim || !destinoNomeTrim) {
      return next(new AppError('Os nomes da origem e destino não podem ser vazios.', 400));
    }

    const isValidCoord = (l, g) => Number.isFinite(l) && l >= -90 && l <= 90 && Number.isFinite(g) && g >= -180 && g <= 180;

    const oLat = parseFloat(origem.lat);
    const oLng = parseFloat(origem.lng);
    const dLat = parseFloat(destino.lat);
    const dLng = parseFloat(destino.lng);

    if (!isValidCoord(oLat, oLng) || !isValidCoord(dLat, dLng)) {
      return next(new AppError('Origem e destino devem conter latitude e longitude numéricas e válidas.', 400));
    }

    // Verificar se origem e destino são muito próximos espacialmente (mesmo local)
    // Tolerância de ~11 metros (0.0001 graus)
    const latDiff = Math.abs(oLat - dLat);
    const lngDiff = Math.abs(oLng - dLng);
    if (origemNomeTrim.toLowerCase() === destinoNomeTrim.toLowerCase() && latDiff < 0.0001 && lngDiff < 0.0001) {
      return next(new AppError('Origem e destino devem ser diferentes.', 400));
    }

    const resultado = await rotasService.calcularCorrida(
      { nome: origemNomeTrim, lat: oLat, lng: oLng },
      { nome: destinoNomeTrim, lat: dLat, lng: dLng }
    );
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

/**
 * GET /api/rotas/sugestoes?q=texto
 *
 * Busca sugestoes de localizacao para autocomplete.
 * Retorna ate 5 resultados com endereco estruturado e coordenadas.
 *
 * Restricoes:
 * - q deve ter pelo menos 3 caracteres (validacao no controller e no service)
 * - Rate limit implicito via cache no RotasService (_geocodingCache)
 */
const buscarSugestoes = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 3) {
      return next(new AppError('O parâmetro "q" deve ter pelo menos 3 caracteres.', 400));
    }

    const sugestoes = await rotasService.buscarSugestoes(q.trim());
    return success(res, sugestoes, 'Sugestões retornadas com sucesso.');
  } catch (err) {
    if (err.statusCode) return next(new AppError(err.message, err.statusCode));
    next(err);
  }
};

module.exports = { calcularCorrida, geocodificar, buscarSugestoes };
