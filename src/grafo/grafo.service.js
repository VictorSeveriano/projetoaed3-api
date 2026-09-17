const Grafo = require('./Grafo');
const Vertice = require('./Vertice');
const Aresta = require('./Aresta');
const { ArvoreBinariaBusca } = require('./ArvoreBinariaBusca');

/**
 * GrafoService — Serviço responsável pelo grafo dinâmico e pela ABB de rotas.
 * 
 * Responsável por construir o grafo por operação e organizar alternativas 
 * usando a Árvore Binária de Busca.
 */
class GrafoService {
  /**
   * Constrói um grafo dinâmico representando a operação de rota atual.
   *
   * @param {{ nome: string, lat: number, lng: number }} origem
   * @param {{ nome: string, lat: number, lng: number }} destino
   * @param {Array<{ distanciaMetros: number }>} rotasValidas - Rotas alternativas retornadas pela API
   * @returns {Grafo}
   */
  construirGrafoDaOperacao(origem, destino, rotasValidas) {
    const grafo = new Grafo();

    const verticeOrigem = new Vertice(
      'origem',
      origem.nome,
      '',
      '',
      'Origem',
      origem.lat,
      origem.lng,
    );

    const verticeDestino = new Vertice(
      'destino',
      destino.nome,
      '',
      '',
      'Destino',
      destino.lat,
      destino.lng,
    );

    grafo.adicionarVertice(verticeOrigem);
    grafo.adicionarVertice(verticeDestino);

    // Para cada rota válida, adiciona uma aresta no grafo
    for (const rota of rotasValidas) {
      if (rota && rota.distanciaMetros > 0) {
        const pesoKm = rota.distanciaMetros / 1000;
        grafo.adicionarAresta(origem.nome, destino.nome, pesoKm);
      }
    }

    return grafo;
  }

  /**
   * Retorna a estrutura do grafo dinâmico da operação atual para exibição.
   *
   * @param {{ nome, lat, lng }} origem
   * @param {{ nome, lat, lng }} destino
   * @param {Array<{ distanciaMetros: number }>} rotasValidas
   * @returns {{ vertices, arestas, adjacencia }}
   */
  obterGrafoDaOperacao(origem, destino, rotasValidas) {
    const grafo = this.construirGrafoDaOperacao(origem, destino, rotasValidas);

    return {
      vertices: grafo.obterVertices().map((v) => ({
        id: v.id,
        nome: v.nome,
        categoria: v.categoria,
        latitude: v.latitude,
        longitude: v.longitude,
      })),
      arestas: grafo.obterArestas(),
      adjacencia: grafo.paraObjeto(),
    };
  }

  /**
   * Organiza as alternativas reais de rota usando a Árvore Binária de Busca.
   *
   * @param {Array<{ distanciaMetros, duracaoSegundos, polyline, ... }>} rotasValidas
   *   Rotas já validadas pelo serviço de roteamento.
   * @returns {object[]} Rotas ordenadas: menor distância primeiro.
   */
  organizarAlternativasComABB(rotasValidas) {
    if (!rotasValidas || rotasValidas.length === 0) return [];
    if (rotasValidas.length === 1) return [...rotasValidas];

    // ABB criada por operação — nunca global
    const abb = new ArvoreBinariaBusca();

    for (const rota of rotasValidas) {
      abb.inserir(rota.distanciaMetros, rota);
    }

    // Percurso in-order retorna rotas do menor ao maior percurso
    return abb.obterOrdenadas();
  }
}

const grafoService = new GrafoService();

module.exports = grafoService;
