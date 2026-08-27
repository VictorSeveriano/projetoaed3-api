/**
 * Algoritmo de Dijkstra — Caminho Minimo em Grafos Ponderados
 *
 * DESCRICAO:
 * O Algoritmo de Dijkstra encontra o menor caminho entre um vertice
 * de origem e todos os outros vertices de um grafo com pesos nao-negativos.
 *
 * COMPLEXIDADE:
 * - Com lista de adjacencia e fila de prioridade minima: O((V + E) log V)
 *   onde V = numero de vertices e E = numero de arestas
 * - No grafo deste sistema: V=6, E=8, muito eficiente
 *
 * POR QUE DIJKSTRA?
 * - O grafo de localizacoes possui pesos positivos (distancias em km)
 * - Dijkstra e o algoritmo classico e otimo para este cenario
 * - Complexidade melhor que Bellman-Ford para grafos sem pesos negativos
 *
 * APLICACAO NO SISTEMA:
 * - Usado para calcular a rota mais curta entre a localizacao do usuario
 *   e a localizacao do carro desejado durante o processo de reserva
 * - Resultado exibido ao usuario antes de confirmar a reserva
 */
class Dijkstra {
  /**
   * Calcula o menor caminho entre origem e destino usando o grafo fornecido.
   *
   * @param {import('./Grafo')} grafo - Instancia do grafo com vertices e arestas
   * @param {string} origem - Nome do vertice de partida
   * @param {string} destino - Nome do vertice de chegada
   * @returns {{ caminho: string[], distanciaTotal: number } | null}
   *   Retorna objeto com caminho e distancia total, ou null se nao houver caminho
   *
   * @throws {Error} Se origem ou destino nao existirem no grafo
   */
  static calcularMenorCaminho(grafo, origem, destino) {
    if (!grafo.possuiVertice(origem)) {
      throw new Error(`Vertice de origem '${origem}' nao existe no grafo.`);
    }
    if (!grafo.possuiVertice(destino)) {
      throw new Error(`Vertice de destino '${destino}' nao existe no grafo.`);
    }

    if (origem === destino) {
      return { caminho: [origem], distanciaTotal: 0 };
    }

    // --- Inicializacao ---
    // distancias[v] = menor distancia conhecida da origem ate v
    const distancias = new Map();
    // predecessores[v] = vertice anterior no caminho mais curto ate v
    const predecessores = new Map();
    // visitados = conjunto de vertices ja processados
    const visitados = new Set();

    // Inicializa todas as distancias como Infinito
    for (const vertice of grafo.obterVertices()) {
      distancias.set(vertice.nome, Infinity);
      predecessores.set(vertice.nome, null);
    }
    distancias.set(origem, 0);

    // --- Loop principal do Dijkstra ---
    // Implementacao com busca linear do minimo (adequado para V pequeno)
    // Para grafos grandes, substituir por MinHeap/PriorityQueue
    while (true) {
      // Seleciona o vertice nao-visitado com menor distancia conhecida
      const atual = Dijkstra._selecionarMinimo(distancias, visitados);

      // Nao ha mais vertices alcancaveis
      if (atual === null) break;

      // Chegamos ao destino
      if (atual === destino) break;

      visitados.add(atual);

      // Relaxamento das arestas adjacentes ao vertice atual
      const vizinhos = grafo.obterVizinhos(atual);
      for (const aresta of vizinhos) {
        if (visitados.has(aresta.destino)) continue;

        const novaDistancia = distancias.get(atual) + aresta.peso;

        if (novaDistancia < distancias.get(aresta.destino)) {
          distancias.set(aresta.destino, novaDistancia);
          predecessores.set(aresta.destino, atual);
        }
      }
    }

    // Verifica se o destino foi alcancado
    if (distancias.get(destino) === Infinity) {
      return null; // Nao existe caminho entre origem e destino
    }

    // Reconstroi o caminho percorrendo os predecessores de tras para frente
    const caminho = Dijkstra._reconstruirCaminho(predecessores, origem, destino);

    return {
      caminho,
      distanciaTotal: distancias.get(destino),
    };
  }

  /**
   * Seleciona o vertice com menor distancia que ainda nao foi visitado.
   * @param {Map<string, number>} distancias
   * @param {Set<string>} visitados
   * @returns {string|null}
   */
  static _selecionarMinimo(distancias, visitados) {
    let minDistancia = Infinity;
    let minVertice = null;

    for (const [vertice, distancia] of distancias) {
      if (!visitados.has(vertice) && distancia < minDistancia) {
        minDistancia = distancia;
        minVertice = vertice;
      }
    }

    return minVertice;
  }

  /**
   * Reconstroi o caminho a partir do mapa de predecessores.
   * @param {Map<string, string|null>} predecessores
   * @param {string} origem
   * @param {string} destino
   * @returns {string[]}
   */
  static _reconstruirCaminho(predecessores, origem, destino) {
    const caminho = [];
    let atual = destino;

    while (atual !== null) {
      caminho.unshift(atual);
      atual = predecessores.get(atual);
    }

    // Verifica se o caminho realmente comeca na origem
    if (caminho[0] !== origem) {
      return []; // Caminho invalido
    }

    return caminho;
  }
}

module.exports = Dijkstra;
