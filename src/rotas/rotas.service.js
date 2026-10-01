const grafoService = require('../grafo/grafo.service');
const geocodingProvider = require('./providers/geocoding.provider');
const routingProvider = require('./providers/routing.provider');

class RotasService {
  async calcularCorrida(origem, destino) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      const err = new Error('Servico de roteamento nao configurado. Configure a variavel GOOGLE_MAPS_API_KEY.');
      err.statusCode = 503;
      throw err;
    }

    let rotasAPI;
    try {
      rotasAPI = await routingProvider.consultarRoutesAPI(
        { lat: origem.lat, lng: origem.lng },
        { lat: destino.lat, lng: destino.lng },
        apiKey,
      );
    } catch (apiError) {
      const err = new Error('Nao foi possivel calcular a rota pelas vias disponiveis: ' + apiError.message);
      err.statusCode = 502;
      throw err;
    }

    const rotasValidas = (rotasAPI || []).filter((r) => this._validarRota(r));

    if (rotasValidas.length === 0) {
      const err = new Error('Nenhuma rota valida encontrada pelas vias disponiveis entre a origem e o destino.');
      err.statusCode = 404;
      throw err;
    }

    const grafoOperacao = grafoService.construirGrafoDaOperacao(origem, destino, rotasValidas);
    const rotasOrdenadas = grafoService.organizarAlternativasComABB(rotasValidas);

    const corridasService = require('../corridas/corridas.service');
    const agora = new Date().toISOString();

    const rotasFormatadas = rotasOrdenadas.map((rota, index) => {
      const distanciaKm = Number((rota.distanciaMetros / 1000).toFixed(2));
      const valorEstimado = corridasService.calcularValor({ distanciaKm, classe: 'BASICO', dataHorario: agora });
      return {
        id: index + 1,
        caminho: [origem.nome, destino.nome],
        pontos: [
          { nome: origem.nome, latitude: origem.lat, longitude: origem.lng },
          { nome: destino.nome, latitude: destino.lat, longitude: destino.lng },
        ],
        distanciaKm,
        distanciaFormatada: rota.distanciaFormatada,
        duracaoMin: Math.round(rota.duracaoSegundos / 60),
        duracaoFormatada: rota.duracaoFormatada,
        polyline: rota.polyline,
        valorEstimado,
        fonte: 'google_maps',
      };
    });

    return {
      origemNome: origem.nome,
      destinoNome: destino.nome,
      rotas: rotasFormatadas,
      melhorRota: rotasFormatadas[0],
      grafoDaOperacao: grafoOperacao.paraObjeto()
    };
  }

  _validarRota(rota) {
    if (!rota) return false;
    if (!rota.distanciaMetros || rota.distanciaMetros <= 0) return false;
    if (!rota.duracaoSegundos || rota.duracaoSegundos <= 0) return false;
    if (!rota.polyline || rota.polyline.trim() === '') return false;
    return true;
  }

  buscarSugestoes(query) {
    return geocodingProvider.buscarSugestoes(query);
  }

  geocodificar(entrada) {
    return geocodingProvider.geocodificar(entrada);
  }
}

module.exports = new RotasService();
