const https = require('https');
const grafoService = require('../grafo/grafo.service');

/**
 * RotasService — Serviço responsável pelo cálculo e enriquecimento de rotas.
 *
 * Responsabilidades:
 * 1. Calcular o caminho interno via algoritmo de Dijkstra (grafoService)
 * 2. Consultar a Google Maps Routes API v2 para obter distância real e
 *    tempo estimado de deslocamento
 * 3. Retornar resultado unificado ao controller
 *
 * Segurança:
 * - A chave da API (GOOGLE_MAPS_API_KEY) é lida exclusivamente do ambiente
 *   do servidor e NUNCA é exposta ao frontend
 *
 * Arquitetura:
 * - Frontend → Backend (este service) → Google Maps Routes API v2
 * - O frontend recebe apenas o resultado processado, sem contato direto
 *   com a API externa
 *
 * API utilizada: Routes API v2 (routes.googleapis.com)
 * - POST https://routes.googleapis.com/directions/v2:computeRoutes
 * - Substitui a Directions API (legacy) que foi descontinuada para novas chaves
 */
class RotasService {
  /**
   * Calcula a melhor rota entre dois locais.
   *
   * O fluxo é:
   * 1. Executa Dijkstra para obter o caminho interno
   * 2. Consulta a Routes API com as coordenadas de origem e destino
   * 3. Retorna resultado unificado (caminho + dados reais do Google Maps)
   *
   * @param {string} origemNome  - Nome do local de origem
   * @param {string} destinoNome - Nome do local de destino
   * @returns {Promise<object>}  - Resultado da rota
   * @throws {Error}             - Em caso de local não encontrado ou falha na API
   */
  async calcularRota(origemNome, destinoNome) {
    // 1. Calcula caminho interno via Dijkstra
    const rotaInterna = grafoService.calcularRota(origemNome, destinoNome);

    if (!rotaInterna) {
      const err = new Error(`Nenhum trajeto encontrado entre '${origemNome}' e '${destinoNome}'.`);
      err.statusCode = 404;
      throw err;
    }

    const origem = rotaInterna.pontos[0];
    const destino = rotaInterna.pontos[rotaInterna.pontos.length - 1];

    // 2. Tenta obter dados reais via Google Maps Routes API v2
    let dadosGoogleMaps = null;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey) {
      try {
        dadosGoogleMaps = await this._consultarRoutesAPI(
          { lat: origem.latitude, lng: origem.longitude },
          { lat: destino.latitude, lng: destino.longitude },
          apiKey,
        );
      } catch (apiError) {
        // Falha na API externa não impede o retorno do resultado interno
        console.warn('[RotasService] Google Maps Routes API indisponível:', apiError.message);
      }
    }

    // 3. Monta resposta unificada
    return this._montarResposta(rotaInterna, dadosGoogleMaps);
  }

  /**
   * Consulta a Google Maps Routes API v2 (computeRoutes) para dados reais de rota.
   *
   * Utiliza a API REST diretamente via HTTPS para manter a chave no servidor.
   * Campo fieldMask limita os dados retornados ao mínimo necessário,
   * reduzindo custo de faturamento.
   *
   * @param {{ lat: number, lng: number }} origem
   * @param {{ lat: number, lng: number }} destino
   * @param {string} apiKey
   * @returns {Promise<{ distanciaMetros, distanciaFormatada, duracaoSegundos, duracaoFormatada, polyline }>}
   */
  _consultarRoutesAPI(origem, destino, apiKey) {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: origem.lat, longitude: origem.lng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: destino.lat, longitude: destino.lng },
          },
        },
        travelMode: 'DRIVE',
        languageCode: 'pt-BR',
        units: 'METRIC',
      });

      const options = {
        hostname: 'routes.googleapis.com',
        path: '/directions/v2:computeRoutes',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'X-Goog-Api-Key': apiKey,
          // FieldMask limita resposta ao mínimo necessário (reduz custo)
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
        },
      };

      const req = https.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(raw);

            if (!json.routes || json.routes.length === 0) {
              const errorMsg = json.error?.message || 'Routes API não retornou rotas.';
              return reject(new Error(errorMsg));
            }

            const route = json.routes[0];
            const distanciaMetros = route.distanceMeters;
            // duration vem no formato "1234s" (segundos como string)
            const duracaoSegundos = parseInt(route.duration.replace('s', ''), 10);

            // Formata distância em português brasileiro
            const distanciaKm = distanciaMetros / 1000;
            const distanciaFormatada = distanciaKm >= 1
              ? `${distanciaKm.toFixed(1).replace('.', ',')} km`
              : `${distanciaMetros} m`;

            // Formata duração em português
            const duracaoFormatada = this._formatarDuracao(duracaoSegundos);

            resolve({
              distanciaMetros,
              distanciaFormatada,
              duracaoSegundos,
              duracaoFormatada,
              polyline: route.polyline.encodedPolyline,
            });
          } catch (parseError) {
            reject(new Error(`Erro ao processar resposta da Routes API: ${parseError.message}`));
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Erro de conexão com a Routes API: ${err.message}`));
      });

      req.setTimeout(8000, () => {
        req.destroy();
        reject(new Error('Timeout ao consultar a Routes API.'));
      });

      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Formata duração em segundos para string legível em português.
   * @param {number} segundos
   * @returns {string} Ex: "25 min", "1 h 30 min"
   */
  _formatarDuracao(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.round((segundos % 3600) / 60);

    if (horas === 0) return `${minutos} min`;
    if (minutos === 0) return `${horas} h`;
    return `${horas} h ${minutos} min`;
  }

  /**
   * Monta o objeto de resposta unificado combinando Dijkstra + Google Maps.
   *
   * Quando a Routes API está disponível, a distância e o tempo exibidos
   * ao usuário são os valores reais retornados pelo Google Maps.
   *
   * Quando indisponível (sem chave ou falha), a distância retornada é a
   * do grafo interno (km rodoviários aproximados) e o tempo não é exibido.
   *
   * @param {object} rotaInterna   - Resultado do Dijkstra
   * @param {object|null} mapsDados - Dados da Routes API
   * @returns {object}
   */
  _montarResposta(rotaInterna, mapsDados) {
    const usandoGoogleMaps = mapsDados !== null;

    const distanciaKm = usandoGoogleMaps
      ? (mapsDados.distanciaMetros / 1000)
      : rotaInterna.distanciaTotal;

    const distanciaFormatada = usandoGoogleMaps
      ? mapsDados.distanciaFormatada
      : `${distanciaKm.toFixed(1).replace('.', ',')} km`;

    return {
      origem: rotaInterna.origem,
      destino: rotaInterna.destino,
      caminho: rotaInterna.caminho,
      pontos: rotaInterna.pontos,
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
      distanciaFormatada,
      duracaoSegundos: usandoGoogleMaps ? mapsDados.duracaoSegundos : null,
      duracaoFormatada: usandoGoogleMaps ? mapsDados.duracaoFormatada : null,
      polyline: usandoGoogleMaps ? mapsDados.polyline : null,
      fonte: usandoGoogleMaps ? 'google_maps' : 'grafo_interno',
    };
  }

  /**
   * Converte um endereco ou CEP em Latitude/Longitude.
   * Usa Google Maps se houver API Key, caso contrario usa Nominatim (OpenStreetMap).
   */
  _geocode(endereco, apiKey) {
    return new Promise((resolve, reject) => {
      if (apiKey) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(endereco)}&key=${apiKey}`;
        https.get(url, (res) => {
          let raw = '';
          res.on('data', (c) => { raw += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              if (data.status === 'OK' && data.results.length > 0) {
                const loc = data.results[0].geometry.location;
                resolve({ lat: loc.lat, lng: loc.lng, address: data.results[0].formatted_address });
              } else {
                reject(new Error('Endereço não encontrado pelo Google Maps.'));
              }
            } catch (e) {
              reject(new Error('Erro ao processar resposta do Geocoding.'));
            }
          });
        }).on('error', reject);
      } else {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(endereco + ', Espirito Santo, Brasil')}&limit=1`;
        const options = { headers: { 'User-Agent': 'ReservaCar-AED3/1.0' } };
        https.get(url, options, (res) => {
          let raw = '';
          res.on('data', (c) => { raw += c; });
          res.on('end', () => {
            try {
              const data = JSON.parse(raw);
              if (data && data.length > 0) {
                resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name });
              } else {
                reject(new Error('Endereço não encontrado no Nominatim.'));
              }
            } catch (e) {
              reject(new Error('Erro ao processar resposta do Nominatim.'));
            }
          });
        }).on('error', reject);
      }
    });
  }

  /**
   * Encontra a agencia mais proxima da localizacao do usuario e calcula a rota ate ela.
   */
  async calcularRotaMaisProxima({ cepOuEndereco, lat, lng }) {
    let origemLat = lat;
    let origemLng = lng;
    let nomeOrigemFormatado = 'Sua Localização';

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!origemLat || !origemLng) {
      if (!cepOuEndereco) throw new Error('É necessário fornecer CEP/Endereço ou Latitude/Longitude.');
      const geo = await this._geocode(cepOuEndereco, apiKey);
      origemLat = geo.lat;
      origemLng = geo.lng;
      nomeOrigemFormatado = geo.address;
    }

    const rotaInterna = grafoService.calcularLocalMaisProximo(origemLat, origemLng);

    if (!rotaInterna) {
      const err = new Error('Não foi possível encontrar uma agência de devolução próxima.');
      err.statusCode = 404;
      throw err;
    }

    // Substitui o nome temporario pelo nome amigavel
    rotaInterna.origem = nomeOrigemFormatado;
    rotaInterna.caminho[0] = 'Origem'; 
    rotaInterna.pontos[0].nome = 'Origem';

    const origem = rotaInterna.pontos[0];
    const destino = rotaInterna.pontos[rotaInterna.pontos.length - 1];

    let dadosGoogleMaps = null;
    if (apiKey) {
      try {
        dadosGoogleMaps = await this._consultarRoutesAPI(
          { lat: origem.latitude, lng: origem.longitude },
          { lat: destino.latitude, lng: destino.longitude },
          apiKey,
        );
      } catch (apiError) {
        console.warn('[RotasService] Google Maps API indisponível:', apiError.message);
      }
    }

    return this._montarResposta(rotaInterna, dadosGoogleMaps);
  }
}

module.exports = new RotasService();
