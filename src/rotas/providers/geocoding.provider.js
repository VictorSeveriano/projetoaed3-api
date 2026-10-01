const https = require('https');

class GeocodingProvider {
  constructor() {
    this._geocodingCache = new Map();
    this._CACHE_TTL_MS = 10 * 60 * 1000;
  }

  buscarSugestoes(query) {
    return new Promise((resolve, reject) => {
      const texto = (query || '').trim();
      if (!texto || texto.length < 3) return resolve([]);

      const erroComStatus = (msg, status = 503) => {
        const err = new Error(msg);
        err.statusCode = status;
        reject(err);
      };

      const agent = new https.Agent({ rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' });
      const cacheKey = ('sugestoes:' + texto).toLowerCase();
      const cached = this._geocodingCache.get(cacheKey);
      
      if (cached && cached.expiresAt > Date.now()) return resolve(cached.resultado);

      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=br&q=${encodeURIComponent(texto + ', Brasil')}`;
      const opts = { headers: { 'User-Agent': 'ReservaCar-AED3/1.0', 'Accept-Language': 'pt-BR,pt;q=0.9' }, agent };

      const req = https.get(url, opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) return resolve([]);

            const sugestoes = data.filter((item) => item.lat && item.lon).map((item) => {
              const addr = item.address || {};
              const logradouro = [addr.road || addr.pedestrian || addr.footway || '', addr.house_number || ''].filter(Boolean).join(', ');
              const bairro = addr.suburb || addr.neighbourhood || addr.quarter || addr.city_district || '';
              const cidade = addr.city || addr.town || addr.village || addr.municipality || '';
              const estado = addr.state || '';
              const cep = (addr.postcode || '').replace(/\D/g, '');

              const partes = [];
              if (logradouro) partes.push(logradouro);
              if (bairro) partes.push(bairro);
              if (cidade) partes.push(cidade);
              if (estado) partes.push(estado);
              const descricao = partes.join(', ') || item.display_name || texto;

              return {
                descricao, logradouro, numero: addr.house_number || '', complemento: '', bairro, cidade, estado,
                cep: cep.length === 8 ? cep.substring(0, 5) + '-' + cep.substring(5) : cep,
                latitude: Number(item.lat), longitude: Number(item.lon),
              };
            });

            this._geocodingCache.set(cacheKey, { resultado: sugestoes, expiresAt: Date.now() + this._CACHE_TTL_MS });
            resolve(sugestoes);
          } catch (e) { erroComStatus('Erro ao processar resposta de sugestoes de localizacao.'); }
        });
      });

      req.on('error', () => erroComStatus('Servico de sugestoes de localizacao indisponivel.'));
      req.setTimeout(6000, () => { req.destroy(); erroComStatus('Timeout ao buscar sugestoes de localizacao.'); });
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

      const agent = new https.Agent({ rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' });

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
                  res({ lat: Number(data[0].lat), lng: Number(data[0].lon), displayName: data[0].display_name });
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
            const cacheKey = q.toLowerCase().trim();
            const cached = this._geocodingCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) return cached.resultado;
            
            const resultado = await consultarNominatim(q);
            this._geocodingCache.set(cacheKey, { resultado, expiresAt: Date.now() + this._CACHE_TTL_MS });
            return resultado;
          } catch (e) {
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
              if (dados.erro === true || dados.erro === 'true') return erroComStatus('CEP nao encontrado. Verifique o numero digitado.');

              const logradouro = dados.logradouro || '';
              const bairro     = dados.bairro     || '';
              const cidade     = dados.localidade  || '';
              const uf         = dados.uf          || 'ES';

              if (!cidade) return erroComStatus('CEP valido, mas sem dados de localidade.');

              const enderecoJson = {
                cep: apenasNumeros.substring(0, 5) + '-' + apenasNumeros.substring(5),
                logradouro, complemento: dados.complemento || '', bairro, cidade, estado: dados.estado || '', uf, pais: 'Brasil',
              };

              const queries = [];
              if (logradouro && bairro) queries.push(logradouro + ', ' + bairro + ', ' + cidade + ', ' + uf + ', Brasil');
              if (logradouro)           queries.push(logradouro + ', ' + cidade + ', ' + uf + ', Brasil');
              if (bairro)               queries.push(bairro + ', ' + cidade + ', ' + uf + ', Brasil');
              queries.push(cidade + ', ' + uf + ', Brasil');

              const geo = await tentarEmCascata(queries);
              if (geo) resolve({ endereco: enderecoJson, latitude: geo.lat, longitude: geo.lng, displayName: geo.displayName });
            } catch (e) { erroComStatus('Erro ao processar resposta do ViaCEP.', 500); }
          });
        }).on('error', () => erroComStatus('Nao foi possivel consultar o ViaCEP.', 503));
      } else {
        const queries = [texto + ', Espirito Santo, Brasil', texto + ', Brasil'];
        tentarEmCascata(queries).then((geo) => {
          if (geo) resolve({ endereco: { logradouro: texto, cidade: '', uf: 'ES', pais: 'Brasil' }, latitude: geo.lat, longitude: geo.lng, displayName: geo.displayName });
        });
      }
    });
  }
}

module.exports = new GeocodingProvider();
