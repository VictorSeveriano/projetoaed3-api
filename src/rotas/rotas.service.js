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
   * Converte um CEP ou endereço em Latitude/Longitude.
   *
   * Fluxo para CEP (8 dígitos):
   *   1. ViaCEP → valida e retorna endereço estruturado
   *   2. Nominatim com endereço completo (logradouro + bairro + cidade + UF)
   *   3. Fallback: logradouro + cidade + UF
   *   4. Fallback: bairro + cidade + UF
   *   5. Fallback: cidade + UF
   *
   * Fluxo para endereço livre:
   *   1. Nominatim com endereço + Espírito Santo + Brasil
   *
   * Nota sobre Google Geocoding API:
   *   Requer Billing habilitado no Google Cloud Console (diferente da
   *   Maps JavaScript API que tem cota gratuita para exibição de mapa).
   *   Por isso utilizamos Nominatim (OpenStreetMap) como geocoder — gratuito,
   *   sem necessidade de billing, preciso para endereços brasileiros.
   *
   * @param {string} entrada - CEP (com ou sem hífen) ou endereço livre
   * @returns {Promise<{ lat: number, lng: number, address: string }>}
   */
  _geocode(entrada) {
    return new Promise((resolve, reject) => {
      const texto = entrada.trim();
      const apenasNumeros = texto.replace(/\D/g, '');
      const ehCep = apenasNumeros.length === 8;

      const erroComStatus = (msg, status = 404) => {
        const err = new Error(msg);
        err.statusCode = status;
        reject(err);
      };

      // Agente HTTPS: respeita NODE_TLS_REJECT_UNAUTHORIZED do ambiente.
      // Em produção, essa variável não deve ser definida (segurança default).
      // Em ambientes com proxy corporativo SSL-interceptor, defina como '0' no .env.
      const agent = new (require('https').Agent)({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      });

      /**
       * Consulta Nominatim com uma query e resolve se encontrar resultado.
       * @param {string} q
       * @returns {Promise<{ lat, lng, address }>}
       */
      const consultarNominatim = (q) =>
        new Promise((res, rej) => {
          const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=1&q=${encodeURIComponent(q)}`;
          const opts = {
            headers: { 'User-Agent': 'ReservaCar-AED3/1.0 (projeto academico)' },
            agent,
          };
          const https = require('https');
          https
            .get(url, opts, (response) => {
              let raw = '';
              response.on('data', (c) => { raw += c; });
              response.on('end', () => {
                try {
                  const data = JSON.parse(raw);
                  if (Array.isArray(data) && data.length > 0) {
                    res({
                      lat: parseFloat(data[0].lat),
                      lng: parseFloat(data[0].lon),
                      address: data[0].display_name,
                    });
                  } else {
                    rej(new Error('sem_resultado'));
                  }
                } catch (e) {
                  rej(new Error('parse_error'));
                }
              });
            })
            .on('error', (e) => rej(e));
        });

      /**
       * Tenta consultar Nominatim com múltiplas queries em cascata.
       * Retorna o primeiro resultado encontrado, ou rejeita se nenhum funcionar.
       */
      const tentarNominatimEmCascata = async (queries) => {
        for (const q of queries) {
          try {
            const resultado = await consultarNominatim(q);
            return resultado;
          } catch (e) {
            // Continua para o próximo fallback
          }
        }
        erroComStatus('Não foi possível localizar o endereço informado.');
      };

      if (ehCep) {
        // --- Fluxo CEP: ViaCEP → endereço estruturado → Nominatim em cascata ---
        const https = require('https');
        const urlViaCep = `https://viacep.com.br/ws/${apenasNumeros}/json/`;

        https
          .get(urlViaCep, { agent }, (res) => {
            let raw = '';
            res.on('data', (c) => { raw += c; });
            res.on('end', async () => {
              try {
                const dados = JSON.parse(raw);

                if (dados.erro === true || dados.erro === 'true') {
                  return erroComStatus('CEP não encontrado. Verifique o número digitado.');
                }

                const logradouro = dados.logradouro || '';
                const bairro     = dados.bairro     || '';
                const cidade     = dados.localidade  || '';
                const uf         = dados.uf          || 'ES';

                if (!cidade) {
                  return erroComStatus('CEP válido, mas sem dados de localidade no ViaCEP.');
                }

                // Queries em cascata: do mais específico ao mais genérico
                const queries = [];
                if (logradouro && bairro) queries.push(`${logradouro}, ${bairro}, ${cidade}, ${uf}, Brasil`);
                if (logradouro)           queries.push(`${logradouro}, ${cidade}, ${uf}, Brasil`);
                if (bairro)               queries.push(`${bairro}, ${cidade}, ${uf}, Brasil`);
                queries.push(`${cidade}, ${uf}, Brasil`);

                const resultado = await tentarNominatimEmCascata(queries);
                if (resultado) resolve(resultado);
              } catch (e) {
                erroComStatus('Erro ao processar resposta do ViaCEP.', 500);
              }
            });
          })
          .on('error', () => {
            erroComStatus('Não foi possível consultar o ViaCEP. Verifique sua conexão.', 503);
          });
      } else {
        // --- Fluxo endereço livre: Nominatim direto ---
        const queries = [
          `${texto}, Espírito Santo, Brasil`,
          `${texto}, Brasil`,
        ];
        tentarNominatimEmCascata(queries).then((r) => { if (r) resolve(r); });
      }
    });
  }

  /**
   * Encontra a agência mais próxima da localização do usuário e calcula a rota até ela.
   *
   * Fluxo:
   * 1. Se GPS disponível: usa lat/lng diretamente
   * 2. Se CEP/endereço: geocodifica via ViaCEP + Nominatim
   * 3. Encontra agência mais próxima via Dijkstra no grafo interno
   * 4. Enriquece com dados da Google Routes API (distância/tempo reais), se disponível
   */
  async calcularRotaMaisProxima({ cepOuEndereco, lat, lng }) {
    let origemLat = lat;
    let origemLng = lng;
    let nomeOrigemFormatado = 'Sua Localização';

    // Geocodifica apenas se não tiver coordenadas GPS
    if (!origemLat || !origemLng) {
      if (!cepOuEndereco) {
        const err = new Error('Informe o CEP/Endereço ou permita o acesso à sua localização.');
        err.statusCode = 400;
        throw err;
      }
      const geo = await this._geocode(cepOuEndereco);
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

    // Substitui o identificador interno pelo nome amigável para o usuário
    rotaInterna.origem = nomeOrigemFormatado;
    rotaInterna.caminho[0] = 'Origem';
    rotaInterna.pontos[0].nome = 'Origem';

    const origem = rotaInterna.pontos[0];
    const destino = rotaInterna.pontos[rotaInterna.pontos.length - 1];

    // Google Routes API: fornece distância real e tempo estimado (requer billing habilitado)
    // Se não disponível, fallback gracioso para dados do grafo interno
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
        console.warn('[RotasService] Google Routes API indisponível (distância aproximada será usada):', apiError.message);
      }
    }

    return this._montarResposta(rotaInterna, dadosGoogleMaps);
  }
}

module.exports = new RotasService();
