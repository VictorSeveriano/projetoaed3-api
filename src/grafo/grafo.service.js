const Grafo = require('./Grafo');
const Vertice = require('./Vertice');
const Dijkstra = require('./Dijkstra');
const localizacoes = require('../data/localizacoes.data');
const arestasData = require('../data/grafo.data');

/**
 * GrafoService — Serviço responsável por gerenciar o grafo de locais.
 *
 * Inicializa o grafo com os locais reais do Espírito Santo e as conexões
 * (distâncias rodoviárias) definidas nos dados, expondo métodos para
 * consulta e cálculo de rotas via algoritmo de Dijkstra.
 *
 * Este serviço é um Singleton: uma única instância para toda a aplicação.
 */
class GrafoService {
  constructor() {
    this.grafo = new Grafo();
    this._inicializar();
  }

  /**
   * Inicializa o grafo adicionando vértices (locais) e arestas (distâncias).
   * Chamado automaticamente no construtor.
   */
  _inicializar() {
    // Adiciona vértices (locais reais como vértices do grafo)
    for (const loc of localizacoes) {
      const vertice = new Vertice(
        loc.id,
        loc.nome,
        loc.cidade,
        loc.estado,
        loc.categoria,
        loc.latitude,
        loc.longitude,
      );
      this.grafo.adicionarVertice(vertice);
    }

    // Adiciona arestas bidirecionais (conexões entre locais com distância em km)
    for (const aresta of arestasData) {
      this.grafo.adicionarAresta(aresta.origem, aresta.destino, aresta.peso);
    }
  }

  /**
   * Retorna todos os vértices do grafo com informações completas.
   * @returns {{ id, nome, cidade, estado, categoria, latitude, longitude }[]}
   */
  obterVertices() {
    return this.grafo.obterVertices().map((v) => ({
      id: v.id,
      nome: v.nome,
      cidade: v.cidade,
      estado: v.estado,
      categoria: v.categoria,
      latitude: v.latitude,
      longitude: v.longitude,
    }));
  }

  /**
   * Retorna todas as arestas do grafo.
   */
  obterArestas() {
    return this.grafo.obterArestas();
  }

  /**
   * Retorna a estrutura completa do grafo (vértices, arestas, lista de adjacência).
   */
  obterGrafoCompleto() {
    return {
      vertices: this.obterVertices(),
      arestas: this.grafo.obterArestas(),
      adjacencia: this.grafo.paraObjeto(),
    };
  }

  /**
   * Calcula o caminho de menor distância entre dois locais usando Dijkstra.
   *
   * @param {string} origem  - Nome do local de origem
   * @param {string} destino - Nome do local de destino
   * @returns {{ origem, destino, caminho, distanciaTotal, pontos } | null}
   */
  calcularRota(origem, destino) {
    const resultado = Dijkstra.calcularMenorCaminho(this.grafo, origem, destino);

    if (!resultado) {
      return null;
    }

    // Enriquece o caminho com as coordenadas de cada ponto
    const pontos = resultado.caminho.map((nome) => {
      const v = this.grafo.vertices.get(nome);
      return {
        nome: v.nome,
        cidade: v.cidade,
        estado: v.estado,
        categoria: v.categoria,
        latitude: v.latitude,
        longitude: v.longitude,
      };
    });

    return {
      origem,
      destino,
      caminho: resultado.caminho,
      distanciaTotal: resultado.distanciaTotal,
      pontos,
    };
  }

  /**
   * Verifica se um local existe no grafo.
   * @param {string} nome
   * @returns {boolean}
   */
  localizacaoExiste(nome) {
    return this.grafo.possuiVertice(nome);
  }

  /**
   * Calcula a distancia em linha reta (Haversine) entre duas coordenadas.
   * Retorna a distancia em km.
   */
  _calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Encontra a agencia (no do grafo) mais proxima a uma coordenada (latitude/longitude).
   * Para respeitar o trabalho de AED3, criamos um no temporario, conectamos aos
   * nos mais proximos (linha reta), rodamos o Dijkstra para todos os destinos,
   * e retornamos o que tem o menor caminho total.
   */
  calcularLocalMaisProximo(lat, lng) {
    const nomeTemp = 'USER_TEMP_LOC';
    
    // 1. Cria o vertice temporario
    const verticeTemp = new Vertice(
      'temp_id',
      nomeTemp,
      'Desconhecida',
      'ES',
      'LocalAtual',
      lat,
      lng
    );
    
    this.grafo.adicionarVertice(verticeTemp);

    // 2. Conecta aos 3 nos mais proximos usando distancia em linha reta
    const todosVertices = this.obterVertices().filter((v) => v.nome !== nomeTemp);
    const distancias = todosVertices.map((v) => ({
      nome: v.nome,
      dist: this._calcularDistanciaHaversine(lat, lng, v.latitude, v.longitude),
    }));
    
    // Ordena pela menor distancia
    distancias.sort((a, b) => a.dist - b.dist);
    
    // Conecta aos 3 mais proximos
    const k = Math.min(3, distancias.length);
    for (let i = 0; i < k; i++) {
      this.grafo.adicionarAresta(nomeTemp, distancias[i].nome, distancias[i].dist);
    }

    // 3. Roda Dijkstra para todos os destinos e encontra a menor rota real
    let menorDistancia = Infinity;
    let melhorRota = null;

    for (const destino of todosVertices) {
      const rota = Dijkstra.calcularMenorCaminho(this.grafo, nomeTemp, destino.nome);
      if (rota && rota.distanciaTotal < menorDistancia) {
        menorDistancia = rota.distanciaTotal;
        melhorRota = rota;
      }
    }

    // 4. Remove o vertice temporario para nao sujar o grafo original
    this.grafo.removerVertice(nomeTemp);

    if (!melhorRota) return null;

    // Formata o resultado similar ao calcularRota
    const pontos = melhorRota.caminho.map((nome) => {
      // O vertice temporario nao estara mais no grafo quando iterarmos aqui, 
      // entao usamos a referencia de verticeTemp se for ele
      if (nome === nomeTemp) {
        return {
          nome: verticeTemp.nome,
          cidade: verticeTemp.cidade,
          estado: verticeTemp.estado,
          categoria: verticeTemp.categoria,
          latitude: verticeTemp.latitude,
          longitude: verticeTemp.longitude,
        };
      }
      const v = this.grafo.vertices.get(nome);
      return {
        nome: v.nome,
        cidade: v.cidade,
        estado: v.estado,
        categoria: v.categoria,
        latitude: v.latitude,
        longitude: v.longitude,
      };
    });

    return {
      origem: nomeTemp,
      destino: melhorRota.destino,
      caminho: melhorRota.caminho,
      distanciaTotal: melhorRota.distanciaTotal,
      pontos,
    };
  }
}

// Singleton: uma única instância do grafo para toda a aplicação
const grafoService = new GrafoService();

module.exports = grafoService;
