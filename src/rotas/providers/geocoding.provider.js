const https = require('https');

const MAPA_ESTADOS_UF = Object.freeze({
  acre: 'AC',
  alagoas: 'AL',
  amapa: 'AP',
  amazonas: 'AM',
  bahia: 'BA',
  ceara: 'CE',
  'distrito federal': 'DF',
  'espirito santo': 'ES',
  goias: 'GO',
  maranhao: 'MA',
  'mato grosso': 'MT',
  'mato grosso do sul': 'MS',
  'minas gerais': 'MG',
  para: 'PA',
  paraiba: 'PB',
  parana: 'PR',
  pernambuco: 'PE',
  piaui: 'PI',
  'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN',
  'rio grande do sul': 'RS',
  rondonia: 'RO',
  roraima: 'RR',
  'santa catarina': 'SC',
  'sao paulo': 'SP',
  sergipe: 'SE',
  tocantins: 'TO',
});

function extrairUf(addr = {}) {
  if (typeof addr.state_code === 'string' && addr.state_code.trim().length === 2) {
    return addr.state_code.trim().toUpperCase();
  }
  const iso = addr['ISO3166-2-lvl4'];
  if (typeof iso === 'string' && /^BR-[A-Z]{2}$/i.test(iso.trim())) {
    return iso.trim().slice(3).toUpperCase();
  }
  if (typeof addr.state === 'string' && addr.state.trim()) {
    const estadoTrim = addr.state.trim();
    if (estadoTrim.length === 2) return estadoTrim.toUpperCase();
    const chave = estadoTrim
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (MAPA_ESTADOS_UF[chave]) return MAPA_ESTADOS_UF[chave];
  }
  return '';
}

function formatarResultadoReverso(item, latOriginal, lngOriginal) {
  if (!item || typeof item !== 'object' || item.error) {
    return null;
  }

  const addr = item.address || {};
  const logradouro = (
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.cycleway ||
    addr.highway ||
    addr.path ||
    addr.square ||
    addr.place ||
    addr.amenity ||
    addr.building ||
    ''
  ).trim();

  // Nunca inventar número de imóvel quando não retornado pelo serviço
  const numero = addr.house_number != null ? String(addr.house_number).trim() : '';
  const bairro = (
    addr.suburb ||
    addr.neighbourhood ||
    addr.quarter ||
    addr.city_district ||
    addr.district ||
    addr.hamlet ||
    addr.locality ||
    ''
  ).trim();
  const cidade = (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    ''
  ).trim();
  const estado = (addr.state || '').trim();
  const uf = extrairUf(addr);
  const cepBruto = (addr.postcode || '').replace(/\D/g, '');
  const cep = cepBruto.length === 8 ? `${cepBruto.substring(0, 5)}-${cepBruto.substring(5)}` : cepBruto;

  const partes = [];
  if (logradouro && numero) {
    partes.push(`${logradouro}, ${numero}`);
  } else if (logradouro) {
    partes.push(logradouro);
  }

  if (bairro && bairro.toLowerCase() !== logradouro.toLowerCase()) {
    partes.push(bairro);
  }

  const siglaOuEstado = uf || estado;
  if (cidade && siglaOuEstado) {
    partes.push(`${cidade} - ${siglaOuEstado}`);
  } else if (cidade) {
    partes.push(cidade);
  } else if (siglaOuEstado) {
    partes.push(siglaOuEstado);
  }

  const displayLimpo = typeof item.display_name === 'string' ? item.display_name.trim() : '';
  const descricao = partes.join(', ') || displayLimpo;

  if (!descricao) {
    return null;
  }

  return {
    descricao,
    logradouro,
    numero,
    complemento: '',
    bairro,
    cidade,
    estado: estado || uf,
    uf,
    cep,
    latitude: Number(latOriginal),
    longitude: Number(lngOriginal),
  };
}

class GeocodingProvider {
  constructor() {
    this._geocodingCache = new Map();
    this._CACHE_TTL_MS = 10 * 60 * 1000;
  }

  formatarResultadoReverso(item, latOriginal, lngOriginal) {
    return formatarResultadoReverso(item, latOriginal, lngOriginal);
  }

  geocodificarReverso(lat, lng) {
    return new Promise((resolve, reject) => {
      const latNum = Number(lat);
      const lngNum = Number(lng);

      const erroComStatus = (msg, status = 503) => {
        const err = new Error(msg);
        err.statusCode = status;
        reject(err);
      };

      if (
        !Number.isFinite(latNum) ||
        !Number.isFinite(lngNum) ||
        latNum < -90 ||
        latNum > 90 ||
        lngNum < -180 ||
        lngNum > 180
      ) {
        return erroComStatus('Coordenadas geograficas invalidas para geocodificacao reversa.', 400);
      }

      const cacheKey = `reverso:${latNum.toFixed(6)},${lngNum.toFixed(6)}`;
      const cached = this._geocodingCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return resolve({
          ...cached.resultado,
          latitude: latNum,
          longitude: lngNum,
        });
      }

      const agent = new https.Agent({
        rejectUnauthorized:
          process.env.ALLOW_INSECURE_TLS !== 'true' &&
          process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
      });
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${encodeURIComponent(latNum)}&lon=${encodeURIComponent(lngNum)}`;
      const opts = {
        headers: {
          'User-Agent': 'ReservaCar-AED3/1.0',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        agent,
      };

      const req = https.get(url, opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 500) {
            return erroComStatus('Servico de geocodificacao reversa indisponivel no momento.', 503);
          }
          if (res.statusCode === 429) {
            return erroComStatus('Limite de consultas de localizacao atingido. Tente novamente em instantes.', 503);
          }
          try {
            const data = JSON.parse(raw);
            const formatado = formatarResultadoReverso(data, latNum, lngNum);
            if (!formatado) {
              return erroComStatus('Nao foi possivel identificar um endereco para a localizacao atual.', 404);
            }
            this._geocodingCache.set(cacheKey, {
              resultado: formatado,
              expiresAt: Date.now() + this._CACHE_TTL_MS,
            });
            resolve(formatado);
          } catch (e) {
            erroComStatus('Erro ao processar resposta de geocodificacao reversa.', 503);
          }
        });
      });

      req.on('error', () =>
        erroComStatus('Servico de geocodificacao reversa indisponivel no momento.', 503)
      );
      req.setTimeout(6000, () => {
        req.destroy();
        erroComStatus('Tempo limite esgotado ao consultar o endereco da localizacao atual.', 503);
      });
    });
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

      const agent = new https.Agent({ rejectUnauthorized: process.env.ALLOW_INSECURE_TLS !== 'true' && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' });
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

            const sugestoes = data
              .filter(
                (item) =>
                  item.lat !== undefined &&
                  item.lat !== null &&
                  item.lat !== '' &&
                  item.lon !== undefined &&
                  item.lon !== null &&
                  item.lon !== '' &&
                  Number.isFinite(Number(item.lat)) &&
                  Number.isFinite(Number(item.lon))
              )
              .map((item) => {
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

      const agent = new https.Agent({ rejectUnauthorized: process.env.ALLOW_INSECURE_TLS !== 'true' && process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' });

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
