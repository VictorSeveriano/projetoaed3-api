const rotasService = require('./rotas.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');
const { isValidCoord } = require('../utils/geoUtils');

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
 * Retorna as alternativas de rotas organizadas entre origem e destino.
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

    const oLat = Number(origem.lat);
    const oLng = Number(origem.lng);
    const dLat = Number(destino.lat);
    const dLng = Number(destino.lng);

    if (!isValidCoord(oLat, oLng) || !isValidCoord(dLat, dLng)) {
      return next(new AppError('Origem e destino devem conter latitude e longitude numéricas e válidas.', 400));
    }

    // Verifica se origem e destino são o mesmo local (tolerância de ~11m)
    const latDiff = Math.abs(oLat - dLat);
    const lngDiff = Math.abs(oLng - dLng);
    if (latDiff < 0.0001 && lngDiff < 0.0001) {
      return next(new AppError('Origem e destino devem ser diferentes fisicamente.', 400));
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
 * Converte CEP ou endereço livre em coordenadas geográficas.
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
 * Busca até 5 sugestões de localização para autocomplete.
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
