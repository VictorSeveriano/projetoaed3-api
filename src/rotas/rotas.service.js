const https = require('https');
const grafoService = require('../grafo/grafo.service');

/**
 * RotasService — Servico responsavel pelo calculo e enriquecimento de rotas.
 *
 * Responsabilidades:
 * 1. Consultar a Google Maps Routes API v2 com computeAlternativeRoutes=true
 *    para obter rotas reais pela malha viaria
 * 2. Validar cada rota recebida (geometria, distancia, duracao, polyline)
 * 3. Delegar ao GrafoService a ordenacao via grafo dinamico + Dijkstra
 * 4. Geocodificar CEPs/enderecos via ViaCEP + Nominatim (com cache e rate limit)
 * 5. Retornar somente rotas validas (1, 2 ou 3 — nunca artificiais)
 *
 * Seguranca:
 * - A chave da API (GOOGLE_MAPS_API_KEY) nunca e exposta ao frontend
 *
 * API utilizada: Google Maps Routes API v2
 * - POST https://routes.googleapis.com/directions/v2:computeRoutes
 */
class RotasService {
  constructor() {
    // Cache de geocodificação Nominatim: chave = query normalizada, valor = { resultado, expiresAt }
    // TTL de 10 minutos por entrada para respeitar o rate limit da API
    this._geocodingCache = new Map();
    this._CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos
  }
  /**
   * Calcula multiplas rotas reais entre dois locais dinamicos.
   *
   * Fluxo:
   * 1. Consulta Google Routes API com computeAlternativeRoutes=true
   *    -> Recebe geometria REAL da malha viaria (polyline encodada)
   * 2. Valida cada rota recebida (_validarRota)
   *    -> Descarta rotas sem geometria, distancia ou duracao invalidos
   * 3. GrafoService.ordenarRotasReais() constroi grafo dinamico e executa Dijkstra
   *    -> Ordena as rotas validas pela melhor (menor distancia)
   * 4. Formata e retorna as rotas com dados reais
   *
   * IMPORTANTE: Nao ha fallback de linha reta ou criacao artificial de rotas.
   * Se o servico de roteamento nao encontrar rotas validas, retorna erro.
   *
   * @param {{ nome: string, lat: number, lng: number }} origem
   * @param {{ nome: string, lat: number, lng: number }} destino
   * @returns {Promise<{ rotas: Array, melhorRota: object }>}
   */
  async calcularCorrida(origem, destino) {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      const err = new Error(
        'Servico de roteamento nao configurado. Configure a variavel GOOGLE_MAPS_API_KEY.',
      );
      err.statusCode = 503;
      throw err;
    }

    // 1. Consultar a Google Routes API solicitando rotas alternativas reais
    let rotasAPI;
    try {
      rotasAPI = await this._consultarRoutesAPI(
        { lat: origem.lat, lng: origem.lng },
        { lat: destino.lat, lng: destino.lng },
        apiKey,
      );
    } catch (apiError) {
      const err = new Error(
        'Nao foi possivel calcular a rota pelas vias disponiveis: ' + apiError.message,
      );
      err.statusCode = 502;
      throw err;
    }

    // 2. Validar cada rota recebida — descartar rotas sem geometria ou dados invalidos
    const rotasValidas = (rotasAPI || []).filter((r) => this._validarRota(r));

    if (rotasValidas.length === 0) {
      const err = new Error(
        'Nenhuma rota valida encontrada pelas vias disponiveis entre a origem e o destino.',
      );
      err.statusCode = 404;
      throw err;
    }

    // 3. Ordenar as rotas validas via grafo dinamico + Dijkstra (exigencia academica)
    //    O grafo e construido com os dados reais da API — nao com distancias Haversine.
    const rotasOrdenadas = grafoService.ordenarRotasReais(rotasValidas);

    // Tarifa minima para estimativa pre-confirmacao (Hatch: R$2/km).
    // O valor REAL e calculado pelo backend em corridas.service.criar()
    // apos a selecao do veiculo disponivel.
    const TARIFA_MINIMA = 2.0;

    // 4. Formatar para retorno ao frontend
    const rotasFormatadas = rotasOrdenadas.map((rota, index) => {
      const distanciaKm = parseFloat((rota.distanciaMetros / 1000).toFixed(2));
      const valorEstimado = parseFloat((distanciaKm * TARIFA_MINIMA).toFixed(2));
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
        // valorEstimado: estimativa usando tarifa minima para exibicao pre-confirmacao.
        // Nao usar este valor para criacao da corrida — o backend recalcula com o veiculo real.
        valorEstimado,
        fonte: 'google_maps',
      };
    });

    return {
      origemNome: origem.nome,
      destinoNome: destino.nome,
      rotas: rotasFormatadas,
      melhorRota: rotasFormatadas[0],
    };
  }

  /**
   * Valida uma rota recebida do servico de roteamento.
   *
   * Uma rota e valida somente se possuir:
   * - distancia positiva (em metros)
   * - duracao positiva (em segundos)
   * - polyline valida (geometria real da malha viaria)
   *
   * Rotas sem polyline sao descartadas para evitar exibir linhas artificiais.
   *
   * @param {object} rota - Rota retornada pela Routes API
   * @returns {boolean}
   */
  _validarRota(rota) {
    if (!rota) return false;
    if (!rota.distanciaMetros || rota.distanciaMetros <= 0) return false;
    if (!rota.duracaoSegundos || rota.duracaoSegundos <= 0) return false;
    if (!rota.polyline || rota.polyline.trim() === '') return false;
    return true;
  }

  /**
   * Geocodifica um CEP ou endereco livre.
   *
   * Fluxo para CEP (8 digitos):
   *   1. ViaCEP -> valida e retorna endereco estruturado em JSON
   *   2. Nominatim com endereco completo (logradouro + bairro + cidade + UF)
   *   3. Fallback: logradouro + cidade + UF
   *   4. Fallback: bairro + cidade + UF
   *   5. Fallback: cidade + UF
   *
   * Retorna o endereco estruturado em JSON + coordenadas.
   *
   * @param {string} entrada - CEP (com ou sem hifen) ou endereco livre
   * @returns {Promise<{ endereco: object, latitude: number, longitude: number }>}
   */
  /**
   * Busca sugestões de localização para autocomplete.
   *
   * Consulta Nominatim com `limit=5` e retorna múltiplos resultados formatados.
   * Reutiliza o cache já existente (_geocodingCache) com TTL de 10 min.
   *
   * @param {string} query - Texto digitado pelo usuário (mínimo 3 caracteres)
   * @returns {Promise<Array<{ descricao, logradouro, bairro, cidade, estado, cep, latitude, longitude }>>}
   */
  buscarSugestoes(query) {
    return new Promise((resolve, reject) => {
      const texto = (query || '').trim();

      if (!texto || texto.length < 3) {
        resolve([]);
        return;
      }

      const erroComStatus = (msg, status = 503) => {
        const err = new Error(msg);
        err.statusCode = status;
        reject(err);
      };

      const agent = new (require('https').Agent)({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      });

      // Chave de cache para esta query
      const cacheKey = ('sugestoes:' + texto).toLowerCase();
      const cached = this._geocodingCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        resolve(cached.resultado);
        return;
      }

      // Consulta Nominatim com múltiplos resultados e detalhes de endereço
      const url =
        'https://nominatim.openstreetmap.org/search' +
        '?format=json' +
        '&addressdetails=1' +
        '&limit=5' +
        '&countrycodes=br' +
        '&q=' + encodeURIComponent(texto + ', Brasil');

      const opts = {
        headers: {
          'User-Agent': 'ReservaCar-AED3/1.0',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        agent,
      };

      const req = https.get(url, opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);

            if (!Array.isArray(data)) {
              resolve([]);
              return;
            }

            const sugestoes = data
              .filter((item) => item.lat && item.lon)
              .map((item) => {
                const addr = item.address || {};

                // Monta logradouro a partir dos campos disponíveis
                const logradouro = [
                  addr.road || addr.pedestrian || addr.footway || '',
                  addr.house_number || '',
                ].filter(Boolean).join(', ');

                const bairro = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || '';
                const cidade = addr.city || addr.town || addr.village || addr.municipality || '';
                const estado = addr.state || '';
                const cep    = (addr.postcode || '').replace(/\D/g, '');

                // Descrição legível para exibição no dropdown
                const partes = [];
                if (logradouro) partes.push(logradouro);
                if (bairro) partes.push(bairro);
                if (cidade) partes.push(cidade);
                if (estado) partes.push(estado);
                const descricao = partes.join(', ') || item.display_name || texto;

                return {
                  descricao,
                  logradouro,
                  numero: addr.house_number || '',
                  complemento: '',
                  bairro,
                  cidade,
                  estado,
                  cep: cep.length === 8
                    ? cep.substring(0, 5) + '-' + cep.substring(5)
                    : cep,
                  latitude: parseFloat(item.lat),
                  longitude: parseFloat(item.lon),
                };
              });

            // Salva no cache
            this._geocodingCache.set(cacheKey, {
              resultado: sugestoes,
              expiresAt: Date.now() + this._CACHE_TTL_MS,
            });

            resolve(sugestoes);
          } catch (e) {
            erroComStatus('Erro ao processar resposta de sugestoes de localizacao.');
          }
        });
      });

      req.on('error', () => erroComStatus('Servico de sugestoes de localizacao indisponivel.'));
      req.setTimeout(6000, () => {
        req.destroy();
        erroComStatus('Timeout ao buscar sugestoes de localizacao.');
      });
    });
  }

  geocodificar(entrada) {
    return new Promise((resolve, reject) => {
      const texto = entrada.trim();
      const apenasNumeros = texto.replace(/\D/g, '');
      const ehCep = apenasNumeros.length === 8;

      const erroComStatus = (msg, status = 404) => {
        const err = new Error(msg);
        err.statusCode = status;
        reject(err);
      };

      const agent = new (require('https').Agent)({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      });

      const consultarNominatim = (q) =>
        new Promise((res, rej) => {
          const url = 'https://nominatim.openstreetmap.org/search?format=json&addressdetails=0&limit=1&q=' + encodeURIComponent(q);

          const opts = { headers: { 'User-Agent': 'ReservaCar-AED3/1.0' }, agent };
          https.get(url, opts, (response) => {
            let raw = '';
            response.on('data', (c) => { raw += c; });
            response.on('end', () => {
              try {
                const data = JSON.parse(raw);
                if (Array.isArray(data) && data.length > 0) {
                  res({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), displayName: data[0].display_name });
                } else {
                  rej(new Error('sem_resultado'));
                }
              } catch (e) { rej(new Error('parse_error')); }
            });
          }).on('error', (e) => rej(e));
        });

      const tentarEmCascata = async (queries) => {
        for (const q of queries) {
          try {
            // Verifica cache antes de chamar Nominatim
            const cacheKey = q.toLowerCase().trim();
            const cached = this._geocodingCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
              return cached.resultado;
            }
            const resultado = await consultarNominatim(q);
            // Salva no cache com TTL
            this._geocodingCache.set(cacheKey, { resultado, expiresAt: Date.now() + this._CACHE_TTL_MS });
            return resultado;
          } catch (e) {
            // Delay de 1 segundo entre tentativas para respeitar rate limit do Nominatim
            // (politica de uso: max 1 req/s por User-Agent)
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
        erroComStatus('Nao foi possivel localizar o endereco informado.');
      };

      if (ehCep) {
        const urlViaCep = 'https://viacep.com.br/ws/' + apenasNumeros + '/json/';

        https.get(urlViaCep, { agent }, (res) => {
          let raw = '';
          res.on('data', (c) => { raw += c; });
          res.on('end', async () => {
            try {
              const dados = JSON.parse(raw);
              if (dados.erro === true || dados.erro === 'true') {
                return erroComStatus('CEP nao encontrado. Verifique o numero digitado.');
              }

              const logradouro = dados.logradouro || '';
              const bairro     = dados.bairro     || '';
              const cidade     = dados.localidade  || '';
              const uf         = dados.uf          || 'ES';

              if (!cidade) return erroComStatus('CEP valido, mas sem dados de localidade.');

              // Endereço estruturado em JSON (conforme especificacao)
              const enderecoJson = {
                cep: apenasNumeros.substring(0, 5) + '-' + apenasNumeros.substring(5),

                logradouro,
                complemento: dados.complemento || '',
                bairro,
                cidade,
                estado: dados.estado || '',
                uf,
                pais: 'Brasil',
              };

              const queries = [];
              if (logradouro && bairro) queries.push(logradouro + ', ' + bairro + ', ' + cidade + ', ' + uf + ', Brasil');
              if (logradouro)           queries.push(logradouro + ', ' + cidade + ', ' + uf + ', Brasil');
              if (bairro)               queries.push(bairro + ', ' + cidade + ', ' + uf + ', Brasil');
              queries.push(cidade + ', ' + uf + ', Brasil');


              const geo = await tentarEmCascata(queries);
              if (geo) {
                resolve({
                  endereco: enderecoJson,
                  latitude: geo.lat,
                  longitude: geo.lng,
                  displayName: geo.displayName,
                });
              }
            } catch (e) { erroComStatus('Erro ao processar resposta do ViaCEP.', 500); }
          });
        }).on('error', () => erroComStatus('Nao foi possivel consultar o ViaCEP.', 503));
      } else {
        // Endereco livre
        const queries = [texto + ', Espirito Santo, Brasil', texto + ', Brasil'];

        tentarEmCascata(queries).then((geo) => {
          if (geo) {
            resolve({
              endereco: { logradouro: texto, cidade: '', uf: 'ES', pais: 'Brasil' },
              latitude: geo.lat,
              longitude: geo.lng,
              displayName: geo.displayName,
            });
          }
        });
      }
    });
  }

  /**
   * Consulta a Google Maps Routes API v2 para obter TODAS as rotas reais
   * (principal + alternativas) com geometria da malha viaria.
   *
   * Diferenca em relacao a versao anterior:
   * - computeAlternativeRoutes: true  -> solicita ate 3 rotas alternativas
   * - Retorna ARRAY de rotas (antes retornava apenas a primeira)
   * - Cada rota possui polyline real (geometria das ruas/estradas)
   *
   * @param {{ lat, lng }} origem
   * @param {{ lat, lng }} destino
   * @param {string} apiKey
   * @returns {Promise<Array<{ distanciaMetros, distanciaFormatada, duracaoSegundos, duracaoFormatada, polyline }>>}
   */
  _consultarRoutesAPI(origem, destino, apiKey) {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: 'DRIVE',
        languageCode: 'pt-BR',
        units: 'METRIC',
        computeAlternativeRoutes: true,
      });

      const options = {
        hostname: 'routes.googleapis.com',
        path: '/directions/v2:computeRoutes',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestBody),
          'X-Goog-Api-Key': apiKey,
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
              return reject(new Error(json.error?.message || 'Routes API nao retornou rotas.'));
            }

            // Mapeia TODAS as rotas retornadas pela API (nao apenas a primeira)
            const rotas = json.routes.map((route) => {
              const distanciaMetros = route.distanceMeters;
              const duracaoSegundos = parseInt(route.duration.replace('s', ''), 10);
              const distanciaKm = distanciaMetros / 1000;
              const distanciaFormatada = distanciaKm >= 1
                ? (distanciaKm.toFixed(1).replace('.', ',') + ' km')
                : (distanciaMetros + ' m');

              return {
                distanciaMetros,
                distanciaFormatada,
                duracaoSegundos,
                duracaoFormatada: this._formatarDuracao(duracaoSegundos),
                // Geometria real da malha viaria (nao e uma linha artificial)
                polyline: route.polyline?.encodedPolyline || null,
              };
            });

            resolve(rotas);
          } catch (e) { reject(new Error('Erro ao processar Routes API: ' + e.message)); }
        });
      });

      req.on('error', (err) => reject(new Error('Erro de conexao Routes API: ' + err.message)));
      req.setTimeout(8000, () => { req.destroy(); reject(new Error('Timeout Routes API.')); });
      req.write(requestBody);
      req.end();
    });
  }

  /**
   * Formata duracao em segundos para string legivel.
   * @param {number} segundos
   * @returns {string} Ex: "25 min", "1 h 30 min"
   */
  _formatarDuracao(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.round((segundos % 3600) / 60);
    if (horas === 0) return minutos + ' min';
    if (minutos === 0) return horas + ' h';
    return horas + ' h ' + minutos + ' min';
  }
}

module.exports = new RotasService();
