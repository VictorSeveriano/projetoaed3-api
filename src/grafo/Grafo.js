const Vertice = require('./Vertice');
const Aresta = require('./Aresta');

/**
 * Classe Grafo - implementacao de grafo nao-direcionado com lista de adjacencia.
 *
 * ESTRUTURA INTERNA:
 * - vertices: Map<string, Vertice> — mapeia nome -> objeto Vertice
 * - adjacencia: Map<string, Aresta[]> — lista de adjacencia
 *
 * No sistema de reservas:
 * - Vertices = Localizacoes (Centro, Shopping, Aeroporto, ...)
 * - Arestas = Conexoes entre localizacoes com distancia em km
 *
 * Esta estrutura e utilizada pelo Algoritmo de Dijkstra para calcular
 * o menor caminho entre localizacoes durante o processo de reserva.
 */
class Grafo {
  constructor() {
    /** @type {Map<string, Vertice>} */
    this.vertices = new Map();

    /** @type {Map<string, Aresta[]>} */
    this.adjacencia = new Map();
  }

  /**
   * Adiciona um vertice ao grafo.
   * @param {Vertice} vertice
   */
  adicionarVertice(vertice) {
    if (this.vertices.has(vertice.nome)) {
      throw new Error(`Vertice '${vertice.nome}' ja existe no grafo.`);
    }
    this.vertices.set(vertice.nome, vertice);
    this.adjacencia.set(vertice.nome, []);
  }

  /**
   * Adiciona uma aresta nao-direcionada ao grafo (bidirecional).
   * @param {string} origem - nome do vertice de origem
   * @param {string} destino - nome do vertice de destino
   * @param {number} peso - distancia em km
   */
  adicionarAresta(origem, destino, peso) {
    if (!this.vertices.has(origem)) {
      throw new Error(`Vertice de origem '${origem}' nao encontrado no grafo.`);
    }
    if (!this.vertices.has(destino)) {
      throw new Error(`Vertice de destino '${destino}' nao encontrado no grafo.`);
    }

    const arestaOrigem = new Aresta(origem, destino, peso);
    const arestaDestino = new Aresta(destino, origem, peso);

    this.adjacencia.get(origem).push(arestaOrigem);
    this.adjacencia.get(destino).push(arestaDestino);
  }

  /**
   * Retorna todos os vertices do grafo.
   * @returns {Vertice[]}
   */
  obterVertices() {
    return Array.from(this.vertices.values());
  }

  /**
   * Retorna todas as arestas unicas do grafo (sem duplicatas bidirecional).
   * @returns {{ origem, destino, peso }[]}
   */
  obterArestas() {
    const visitadas = new Set();
    const arestas = [];

    for (const [origem, vizinhos] of this.adjacencia) {
      for (const aresta of vizinhos) {
        const chave = [origem, aresta.destino].sort().join('-');
        if (!visitadas.has(chave)) {
          visitadas.add(chave);
          arestas.push({ origem, destino: aresta.destino, peso: aresta.peso });
        }
      }
    }

    return arestas;
  }

  /**
   * Retorna os vizinhos (adjacentes) de um vertice.
   * @param {string} nome - nome do vertice
   * @returns {Aresta[]}
   */
  obterVizinhos(nome) {
    if (!this.adjacencia.has(nome)) {
      throw new Error(`Vertice '${nome}' nao encontrado no grafo.`);
    }
    return this.adjacencia.get(nome);
  }

  /**
   * Verifica se um vertice existe no grafo.
   * @param {string} nome
   * @returns {boolean}
   */
  possuiVertice(nome) {
    return this.vertices.has(nome);
  }

  /**
   * Retorna a representacao visual (lista de adjacencia) do grafo.
   * @returns {Object}
   */
  paraObjeto() {
    const resultado = {};
    for (const [nome, vizinhos] of this.adjacencia) {
      resultado[nome] = vizinhos.map((a) => ({ destino: a.destino, peso: a.peso }));
    }
    return resultado;
  }

  /**
   * Remove um vertice e todas as arestas associadas a ele.
   * Utilizado para nos temporarios (ex: localizacao do usuario).
   * @param {string} nome
   */
  removerVertice(nome) {
    if (!this.vertices.has(nome)) return;

    // Remove as arestas dos vizinhos que apontam para este vertice
    const vizinhos = this.adjacencia.get(nome) || [];
    for (const aresta of vizinhos) {
      const vizinhoNome = aresta.destino;
      if (this.adjacencia.has(vizinhoNome)) {
        const arestasVizinho = this.adjacencia.get(vizinhoNome);
        this.adjacencia.set(
          vizinhoNome,
          arestasVizinho.filter((a) => a.destino !== nome)
        );
      }
    }

    // Remove o vertice e sua lista de adjacencia
    this.vertices.delete(nome);
    this.adjacencia.delete(nome);
  }
}

module.exports = Grafo;
