const rotasService = require('./rotas.service');
const grafoService = require('../grafo/grafo.service');
const AppError = require('../utils/AppError');
const { success } = require('../utils/responseHelper');

/**
 * RotasController — Controlador para endpoints de rotas.
 *
 * Responsável exclusivamente por:
 * - Receber e validar os parâmetros da requisição
 * - Delegar ao RotasService
 * - Formatar e retornar a resposta
 *
 * Não contém regras de negócio.
 */

/**
 * GET /api/rotas?origem=X&destino=Y
 *
 * Calcula a melhor rota entre dois locais.
 * Utiliza o algoritmo de Dijkstra internamente e enriquece o resultado
 * com dados reais da Google Maps Directions API quando disponível.
 */
const calcularRota = async (req, res, next) => {
  try {
    const { origem, destino } = req.query;

    // Validação de parâmetros obrigatórios
    if (!origem || !destino) {
      return next(new AppError('Os parâmetros "origem" e "destino" são obrigatórios.', 400));
    }

    // Validação: origem e destino devem ser diferentes
    if (origem.trim().toLowerCase() === destino.trim().toLowerCase()) {
      return next(new AppError('Origem e destino devem ser diferentes.', 400));
    }

    // Validação: locais existem no sistema
    if (!grafoService.localizacaoExiste(origem)) {
      return next(new AppError(`Local de origem '${origem}' não encontrado.`, 404));
    }

    if (!grafoService.localizacaoExiste(destino)) {
      return next(new AppError(`Local de destino '${destino}' não encontrado.`, 404));
    }

    const rota = await rotasService.calcularRota(origem, destino);

    return success(res, rota, 'Rota calculada com sucesso.');
  } catch (err) {
    if (err.statusCode) {
      return next(new AppError(err.message, err.statusCode));
    }
    next(err);
  }
};

/**
 * GET /api/rotas/locais
 *
 * Retorna todos os locais disponíveis para seleção de origem/destino,
 * incluindo coordenadas geográficas reais para exibição no mapa.
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
 * POST /api/rotas/mais-proximo
 * Body: { cepOuEndereco, lat, lng }
 * 
 * Calcula a agência de devolução mais próxima.
 */
const calcularMaisProximo = async (req, res, next) => {
  try {
    const { cepOuEndereco, lat, lng } = req.body;

    if (!cepOuEndereco && (!lat || !lng)) {
      return next(new AppError('Informe o CEP/Endereço ou as coordenadas geográficas.', 400));
    }

    const rota = await rotasService.calcularRotaMaisProxima({ cepOuEndereco, lat, lng });

    return success(res, rota, 'Agência mais próxima encontrada com sucesso.');
  } catch (err) {
    if (err.statusCode) {
      return next(new AppError(err.message, err.statusCode));
    }
    next(err);
  }
};

module.exports = { calcularRota, listarLocais, calcularMaisProximo };
