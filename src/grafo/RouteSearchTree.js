/**
 * RouteSearchTree - Arvore de Busca de Caminhos Alternativos (BFS)
 *
 * ESTRUTURA:
 * Modela a exploracao de rotas como uma arvore onde:
 *   - RAIZ    = localizacao de origem
 *   - NOS     = localizacoes intermediarias
 *   - FOLHAS  = caminhos que chegaram ao destino
 *   - ARESTAS = conexoes do grafo percorridas durante a busca
 *
 * ALGORITMO: BFS (Busca em Largura)
 * Por que BFS e nao DFS?
 *   - BFS explora por nivel de profundidade, garantindo caminhos mais curtos primeiro
 *   - DFS pode mergulhar em caminhos muito longos antes de encontrar alternativas
 *   - Para grafo com 7 nos, BFS e eficiente e gera diversidade de alternativas reais
 *
 * INTEGRACAO NO SISTEMA:
 *   GrafoService.calcularMultiplasRotas()
 *     RouteSearchTree.buscarCaminhos() -> caminhos candidatos
 *       Dijkstra.calcularDistancia()   -> distancia real de cada caminho
 *         Array de Rotas ordenado por eficiencia
 */

/**
 * Representa um no na arvore de busca.
 * Encapsula a localizacao atual e o caminho percorrido desde a origem.
 */
class TreeNode {
  constructor(localizacao, caminhoPercorrido) {
    this.localizacao = localizacao;
    this.caminhoPercorrido = [...caminhoPercorrido, localizacao];
  }
}

/**
 * RouteSearchTree - Controlador da busca em arvore.
 * Usa apenas o metodo estatico buscarCaminhos().
 */
class RouteSearchTree {
  /**
   * BFS no grafo para encontrar multiplos caminhos distintos.
   *
   * @param {import('./Grafo')} grafo   - Instancia do grafo de localizacoes
   * @param {string}           origem  - Nome do no de origem
   * @param {string}           destino - Nome do no de destino
   * @param {number}           maxRotas  - Maximo de caminhos (padrao: 3)
   * @param {number}           maxDepth  - Profundidade maxima (padrao: 6)
   * @returns {string[][]} Array de caminhos (cada caminho = array de nomes)
   */
  static buscarCaminhos(grafo, origem, destino, maxRotas = 3, maxDepth = 6) {
    const caminhosencontrados = [];
    const fila = [new TreeNode(origem, [])];

    while (fila.length > 0 && caminhosencontrados.length < maxRotas) {
      const noAtual = fila.shift();

      if (noAtual.caminhoPercorrido.length > maxDepth) continue;

      if (noAtual.localizacao === destino) {
        const caminhoKey = noAtual.caminhoPercorrido.join('|');
        const jaExiste = caminhosencontrados.some((c) => c.join('|') === caminhoKey);
        if (!jaExiste) caminhosencontrados.push([...noAtual.caminhoPercorrido]);
        continue;
      }

      if (!grafo.possuiVertice(noAtual.localizacao)) continue;

      const vizinhos = grafo.obterVizinhos(noAtual.localizacao);
      for (const aresta of vizinhos) {
        const vizinhoNome = aresta.destino;
        if (noAtual.caminhoPercorrido.includes(vizinhoNome)) continue;
        fila.push(new TreeNode(vizinhoNome, noAtual.caminhoPercorrido));
      }
    }

    return caminhosencontrados;
  }
}

module.exports = { RouteSearchTree, TreeNode };
