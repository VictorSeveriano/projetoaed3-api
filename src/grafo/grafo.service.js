const Grafo = require('./Grafo');
const Vertice = require('./Vertice');
const Aresta = require('./Aresta');
const { ArvoreBinariaBusca } = require('./ArvoreBinariaBusca');

/**
 * GrafoService — Serviço responsável pelo grafo dinâmico e pela ABB de rotas.
 *
 * RESPONSABILIDADES:
 * 1. construirGrafoDaOperacao() — monta um grafo com os dados reais de cada
 *    operação (origem, destino, distância). O grafo começa vazio e recebe
 *    apenas os dados daquela corrida específica.
 *
 * 2. organizarAlternativasComABB() — insere as alternativas reais de rota
 *    (retornadas pelo serviço de roteamento) em uma ABB usando a distância
 *    em metros como chave, percorre em ordem e retorna as rotas organizadas.
 *
 * ARQUITETURA:
 * - O grafo representa somente relações justificadas pelos dados reais da operação.
 * - A ABB organiza as alternativas — não descobre caminhos (isso é função do
 *   serviço de roteamento).
 * - Uma ABB por operação de rota, nunca global.
 *
 * SINGLETON: uma única instância do service para toda a aplicação.
 * O estado do grafo e da ABB, no entanto, é criado por operação — sem estado global.
 */
class GrafoService {
  /**
   * Constrói um grafo dinâmico representando a operação de rota atual.
   *
   * O grafo contém:
   *   - Vértice ORIGEM com as coordenadas reais do ponto de partida
   *   - Vértice DESTINO com as coordenadas reais do ponto de chegada
   *   - Aresta ORIGEM → DESTINO com peso = distância real em metros
   *
   * A aresta representa a rota escolhida (melhor alternativa), justificada
   * pelos dados reais retornados pelo serviço de roteamento.
   *
   * @param {{ nome: string, lat: number, lng: number }} origem
   * @param {{ nome: string, lat: number, lng: number }} destino
   * @param {number} distanciaMetros - Distância real da rota selecionada
   * @returns {Grafo}
   */
  construirGrafoDaOperacao(origem, destino, distanciaMetros) {
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

    // Aresta com a distância real retornada pelo serviço de roteamento convertida para km
    const pesoKm = distanciaMetros / 1000;
    grafo.adicionarAresta(origem.nome, destino.nome, pesoKm);

    return grafo;
  }

  /**
   * Retorna a estrutura do grafo dinâmico da operação atual para exibição.
   *
   * @param {{ nome, lat, lng }} origem
   * @param {{ nome, lat, lng }} destino
   * @param {number} distanciaMetros
   * @returns {{ vertices, arestas, adjacencia }}
   */
  obterGrafoDaOperacao(origem, destino, distanciaMetros) {
    const grafo = this.construirGrafoDaOperacao(origem, destino, distanciaMetros);

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
   * Fluxo:
   * 1. Cria uma nova ABB para esta operação (nunca reutiliza entre corridas)
   * 2. Insere cada rota válida usando distanciaMetros como chave
   * 3. Percorre a ABB em ordem (in-order) → rotas do menor ao maior percurso
   * 4. Retorna o array plano de rotas ordenadas
   *
   * A ABB garante a ordenação por estrutura própria — não usa Array.sort().
   * Rotas com mesma distância são todas preservadas no mesmo nó.
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

// Singleton: uma única instância do service para toda a aplicação.
// O estado dinâmico (grafo, ABB) é sempre criado dentro dos métodos — sem estado global.
const grafoService = new GrafoService();

module.exports = grafoService;
