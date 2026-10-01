const https = require('https');

class RoutingProvider {
  /**
   * Consulta a Google Maps Routes API v2 para obter TODAS as rotas reais
   * (principal + alternativas) com geometria da malha viaria.
   *
   * @param {{ lat, lng }} origem
   * @param {{ lat, lng }} destino
   * @param {string} apiKey
   * @returns {Promise<Array<{ distanciaMetros, distanciaFormatada, duracaoSegundos, duracaoFormatada, polyline }>>}
   */
  consultarRoutesAPI(origem, destino, apiKey) {
    return new Promise((resolve, reject) => {
      const requestBody = JSON.stringify({
        origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
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

  _formatarDuracao(segundos) {
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.round((segundos % 3600) / 60);
    if (horas === 0) return minutos + ' min';
    if (minutos === 0) return horas + ' h';
    return horas + ' h ' + minutos + ' min';
  }
}

module.exports = new RoutingProvider();
