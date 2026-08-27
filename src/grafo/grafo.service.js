const Grafo = require('./Grafo');
const Vertice = require('./Vertice');
const Dijkstra = require('./Dijkstra');
const localizacoes = require('../data/localizacoes.data');
const arestasData = require('../data/grafo.data');

/**
 * GrafoService — Servico responsavel por gerenciar o grafo de localizacoes.
 *
 * Inicializa o grafo com as localizacoes e arestas definidas nos dados,
 * e expoe metodos para consulta e calculo de rotas.
 */
class GrafoService {
  constructor() {
    this.grafo = new Grafo();
    this._inicializar();
  }

  /**
   * Inicializa o grafo adicionando vertices (localizacoes) e arestas (distancias).
   * Chamado automaticamente no construtor.
   */
  _inicializar() {
    // Adiciona vertices (localizacoes como vertices do grafo)
    for (const loc of localizacoes) {
      const vertice = new Vertice(loc.id, loc.nome, loc.descricao);
      this.grafo.adicionarVertice(vertice);
    }

    // Adiciona arestas bidirecionais (conexoes entre localizacoes)
    for (const aresta of arestasData) {
      this.grafo.adicionarAresta(aresta.origem, aresta.destino, aresta.peso);
    }
  }

  /**
   * Retorna todos os vertices do grafo.
   */
  obterVertices() {
    return this.grafo.obterVertices();
  }

  /**
   * Retorna todas as arestas do grafo.
   */
  obterArestas() {
    return this.grafo.obterArestas();
  }

  /**
   * Retorna a estrutura completa do grafo (lista de adjacencia).
   */
  obterGrafoCompleto() {
    return {
      vertices: this.grafo.obterVertices().map((v) => ({
        id: v.id,
        nome: v.nome,
        descricao: v.descricao,
      })),
      arestas: this.grafo.obterArestas(),
      adjacencia: this.grafo.paraObjeto(),
    };
  }

  /**
   * Calcula o menor caminho entre dois vertices usando Dijkstra.
   *
   * @param {string} origem - Nome da localizacao de origem
   * @param {string} destino - Nome da localizacao de destino
   * @returns {{ origem, destino, caminho, distanciaTotal } | null}
   */
  calcularRota(origem, destino) {
    const resultado = Dijkstra.calcularMenorCaminho(this.grafo, origem, destino);

    if (!resultado) {
      return null;
    }

    return {
      origem,
      destino,
      caminho: resultado.caminho,
      distanciaTotal: resultado.distanciaTotal,
    };
  }

  /**
   * Verifica se uma localizacao existe no grafo.
   * @param {string} nome
   * @returns {boolean}
   */
  localizacaoExiste(nome) {
    return this.grafo.possuiVertice(nome);
  }
}

// Singleton: uma unica instancia do grafo para toda a aplicacao
const grafoService = new GrafoService();

module.exports = grafoService;
