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
}

// Singleton: uma única instância do grafo para toda a aplicação
const grafoService = new GrafoService();

module.exports = grafoService;
