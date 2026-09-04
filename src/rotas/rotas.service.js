const https = require('https');
const grafoService = require('../grafo/grafo.service');

/**
 * RotasService — Servico responsavel pelo calculo e enriquecimento de rotas.
 *
 * Responsabilidades:
 * 1. Calcular multiplas rotas via GrafoService (Dijkstra + RouteSearchTree)
 * 2. Geocodificar CEPs via ViaCEP + Nominatim
 * 3. Enriquecer a melhor rota com dados reais da Google Maps Routes API v2
 * 4. Retornar array de rotas para o usuario escolher
 *
 * Seguranca:
 * - A chave da API (GOOGLE_MAPS_API_KEY) nunca e exposta ao frontend
 *
 * API utilizada: Google Maps Routes API v2
 * - POST https://routes.googleapis.com/directions/v2:computeRoutes
 */
class RotasService {
  /**
   * Calcula multiplas rotas entre dois locais (agora aceitando coordenadas dinamicas).
   *
   * Fluxo:
   * 1. Injeta nos temporarios (Origem e Destino) no grafo, ligando aos vizinhos mais proximos
   * 2. GrafoService.calcularMultiplasRotas() gera array de rotas via BFS + Dijkstra
   * 3. Remove os nos temporarios do grafo
   * 4. Enriquece a melhor rota (id=1) com dados reais da Google Routes API
   * 5. Retorna todas as rotas com distancias e a melhor destacada
   *
   * @param {{ nome: string, lat: number, lng: number }} origem
   * @param {{ nome: string, lat: number, lng: number }} destino
   * @returns {Promise<{ rotas: Array, melhorRota: object }>}
   */
  async calcularCorrida(origem, destino) {
    const idOrigem = `ORIGEM_${Date.now()}`;
    const idDestino = `DESTINO_${Date.now()}`;

    // 1. Injeta os locais do usuario no grafo
    grafoService.adicionarNoTemporario(idOrigem, origem.lat, origem.lng);
    grafoService.adicionarNoTemporario(idDestino, destino.lat, destino.lng);

    // 2. Calcula as rotas internamente
    const rotasInternas = grafoService.calcularMultiplasRotas(idOrigem, idDestino);

    // 3. Limpa o grafo
    grafoService.removerNoTemporario(idOrigem);
    grafoService.removerNoTemporario(idDestino);

    if (!rotasInternas || rotasInternas.length === 0) {
      const err = new Error('Nenhum trajeto encontrado entre a origem e o destino.');
      err.statusCode = 404;
      throw err;
    }

    // Tenta enriquecer a melhor rota com dados reais da Google Routes API
    const melhorRota = rotasInternas[0];
    let dadosGoogleMaps = null;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey && melhorRota.pontos.length >= 2) {
      const pontoOrigem = melhorRota.pontos[0];
      const pontoDestino = melhorRota.pontos[melhorRota.pontos.length - 1];

      if (pontoOrigem.latitude && pontoDestino.latitude) {
        try {
          dadosGoogleMaps = await this._consultarRoutesAPI(
            { lat: pontoOrigem.latitude, lng: pontoOrigem.longitude },
            { lat: pontoDestino.latitude, lng: pontoDestino.longitude },
            apiKey,
          );
        } catch (apiError) {
          console.warn('[RotasService] Google Routes API indisponivel:', apiError.message);
        }
      }
    }

    // Formata cada rota para retorno ao frontend
    const rotasFormatadas = rotasInternas.map((rota) => {
      const caminhoFormatado = rota.caminho.map(nome => 
        nome === idOrigem ? origem.nome : (nome === idDestino ? destino.nome : nome)
      );
      const pontosFormatados = rota.pontos.map(p => {
        if (p.nome === idOrigem) return { ...p, nome: origem.nome };
        if (p.nome === idDestino) return { ...p, nome: destino.nome };
        return p;
      });

      return {
        id: rota.id,
        caminho: caminhoFormatado,
        pontos: pontosFormatados,
        distanciaKm: rota.distanciaTotal,
        distanciaFormatada: rota.distanciaTotal.toFixed(1).replace('.', ',') + ' km',
        duracaoMin: Math.round((rota.distanciaTotal / 30) * 60),
        duracaoFormatada: this._formatarDuracao(Math.round((rota.distanciaTotal / 30) * 60) * 60),
      };
    });

    // Sobrescreve duracao e polyline da melhor rota com dados reais quando disponivel
    if (dadosGoogleMaps) {
      rotasFormatadas[0].duracaoMin = Math.round(dadosGoogleMaps.duracaoSegundos / 60);
      rotasFormatadas[0].duracaoFormatada = dadosGoogleMaps.duracaoFormatada;
      rotasFormatadas[0].distanciaKm = parseFloat((dadosGoogleMaps.distanciaMetros / 1000).toFixed(2));
      rotasFormatadas[0].distanciaFormatada = dadosGoogleMaps.distanciaFormatada;
      rotasFormatadas[0].polyline = dadosGoogleMaps.polyline;
      rotasFormatadas[0].fonte = 'google_maps';
    } else {
      rotasFormatadas[0].polyline = null;
      rotasFormatadas[0].fonte = 'grafo_interno';
    }

    return {
      origemNome: origem.nome,
      destinoNome: destino.nome,
      rotas: rotasFormatadas,
      melhorRota: rotasFormatadas[0],
    };
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
          try { return await consultarNominatim(q); } catch (e) { /* continua */ }
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
   * Consulta a Google Maps Routes API v2 para dados reais de rota.
   * @param {{ lat, lng }} origem
   * @param {{ lat, lng }} destino
   * @param {string} apiKey
   */
  _consultarRoutesAPI(origem, destino, apiKey) {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
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
              return reject(new Error(json.error?.message || 'Routes API sem rotas.'));
            }
            const route = json.routes[0];
            const distanciaMetros = route.distanceMeters;
            const duracaoSegundos = parseInt(route.duration.replace('s', ''), 10);
            const distanciaKm = distanciaMetros / 1000;
            const distanciaFormatada = distanciaKm >= 1
              ? (distanciaKm.toFixed(1).replace('.', ',') + ' km')
              : (distanciaMetros + ' m');

            resolve({
              distanciaMetros,
              distanciaFormatada,
              duracaoSegundos,
              duracaoFormatada: this._formatarDuracao(duracaoSegundos),
              polyline: route.polyline.encodedPolyline,
            });
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
