const Grafo = require('./Grafo');
const Vertice = require('./Vertice');
const Dijkstra = require('./Dijkstra');
const { RouteSearchTree } = require('./RouteSearchTree');
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
   * Calcula multiplas rotas alternativas entre origem e destino.
   *
   * Fluxo:
   * 1. RouteSearchTree.buscarCaminhos() explora o grafo via BFS,
   *    construindo uma arvore de possibilidades e retornando ate maxRotas caminhos
   * 2. Para cada caminho candidato da arvore, calcula a distancia total
   *    somando os pesos das arestas (sem re-executar Dijkstra — soma direta)
   * 3. Ordena por distancia crescente (melhor rota primeiro)
   * 4. Enriquece cada rota com coordenadas dos pontos
   *
   * @param {string} origem  - Nome do local de origem
   * @param {string} destino - Nome do local de destino
   * @param {number} maxRotas - Maximo de rotas alternativas (padrao: 3)
   * @returns {Array<{ id, caminho, pontos, distanciaTotal }>}
   */
  calcularMultiplasRotas(origem, destino, maxRotas = 3) {
    // 1. BFS na arvore para obter caminhos candidatos
    const caminhosCandidatos = RouteSearchTree.buscarCaminhos(
      this.grafo,
      origem,
      destino,
      maxRotas,
    );

    // 2. Para cada caminho, calcula distancia total somando pesos das arestas
    const rotas = caminhosCandidatos
      .map((caminho, index) => {
        let distanciaTotal = 0;
        let valida = true;

        for (let i = 0; i < caminho.length - 1; i++) {
          const noAtual = caminho[i];
          const noProximo = caminho[i + 1];
          const vizinhos = this.grafo.obterVizinhos(noAtual);
          const aresta = vizinhos.find((a) => a.destino === noProximo);

          if (!aresta) {
            valida = false;
            break;
          }
          distanciaTotal += aresta.peso;
        }

        if (!valida) return null;

        // Enriquece com coordenadas dos pontos
        const pontos = caminho.map((nome) => {
          const v = this.grafo.vertices.get(nome);
          if (!v) return { nome, latitude: null, longitude: null };
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
          id: index + 1,
          caminho,
          pontos,
          distanciaTotal: parseFloat(distanciaTotal.toFixed(2)),
        };
      })
      .filter(Boolean); // Remove rotas invalidas

    // 3. Ordena por distancia crescente (melhor rota = menor distancia = primeira)
    rotas.sort((a, b) => a.distanciaTotal - b.distanciaTotal);

    // 4. Re-numera IDs apos ordenacao
    rotas.forEach((r, i) => { r.id = i + 1; });

    return rotas;
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
   * Adiciona um vertice temporario ao grafo (para Origem ou Destino dinamicos)
   * conectando-o aos 3 nós mais próximos usando distancia Haversine.
   *
   * @param {string} nomeTemp - Nome ou identificador unico do no (ex: 'TEMP_ORIGEM')
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   */
  adicionarNoTemporario(nomeTemp, lat, lng) {
    // 1. Cria o vertice temporario
    const verticeTemp = new Vertice(
      'temp_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      nomeTemp,
      'Desconhecida',
      'ES',
      'LocalAtual',
      lat,
      lng
    );
    
    this.grafo.adicionarVertice(verticeTemp);

    // 2. Conecta aos 3 nos permanentes mais proximos (linha reta)
    const todosVertices = this.obterVertices().filter((v) => v.nome !== nomeTemp && !v.nome.startsWith('TEMP_'));
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
  }

  /**
   * Remove um vertice temporario do grafo.
   *
   * @param {string} nomeTemp - O nome do no a ser removido
   */
  removerNoTemporario(nomeTemp) {
    if (this.grafo.possuiVertice(nomeTemp)) {
      this.grafo.removerVertice(nomeTemp);
    }
  }

}

// Singleton: uma única instância do grafo para toda a aplicação
const grafoService = new GrafoService();

module.exports = grafoService;
