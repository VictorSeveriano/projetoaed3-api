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
   * Calcula multiplas rotas alternativas entre dois locais DO GRAFO FIXO.
   *
   * CONTEXTO ACADEMICO: Este metodo opera exclusivamente sobre os 7 locais
   * fixos do grafo do Espirito Santo (localizacoes.data.js). Nao e usado
   * no fluxo de corridas (que usa a Google Routes API para rotas reais).
   *
   * E disponibilizado pelo endpoint GET /api/grafo/rota para exibicao
   * academica do grafo e seus algoritmos.
   *
   * Fluxo:
   * 1. RouteSearchTree.buscarCaminhos() explora o grafo via BFS,
   *    construindo uma arvore de possibilidades e retornando ate maxRotas caminhos
   * 2. Para cada caminho candidato da arvore, calcula a distancia total
   *    somando os pesos das arestas (sem re-executar Dijkstra — soma direta)
   * 3. Ordena por distancia crescente (melhor rota primeiro)
   * 4. Enriquece cada rota com coordenadas dos pontos
   *
   * @param {string} origem  - Nome do local de origem (deve existir no grafo fixo)
   * @param {string} destino - Nome do local de destino (deve existir no grafo fixo)
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
   * Ordena um array de rotas reais (retornadas pelo servico de roteamento)
   * utilizando um grafo dinamico e o algoritmo de Dijkstra.
   *
   * ESTRUTURA DO GRAFO DINAMICO:
   *   - No ORIGEM  : ponto de partida da corrida
   *   - No ROTA_i  : representa cada alternativa de rota (i = 0, 1, 2...)
   *   - No DESTINO : ponto de chegada da corrida
   *
   * ARESTAS:
   *   - ORIGEM  → ROTA_i  : peso = distancia real da rota i em km (dado real da API)
   *   - ROTA_i  → DESTINO : peso = 0  (chegada ao destino e equivalente para todas)
   *
   * DIJKSTRA:
   *   Executa o algoritmo do no ORIGEM ate o no DESTINO.
   *   O caminho minimo encontrado atravessa o ROTA_i de menor distancia.
   *   Esse e identificado como a melhor rota e posicionado no indice 0.
   *   As demais rotas sao ordenadas por distancia crescente.
   *
   * IMPORTANTE: As conexoes do grafo sao baseadas nos dados reais do
   * servico de roteamento — nao em distancias Haversine (linha reta).
   *
   * @param {Array<{ distanciaMetros, duracaoSegundos, polyline, ... }>} rotasAPI
   *   Array de rotas validas retornadas e ja validadas pela Routes API.
   * @returns {Array} Rotas ordenadas: melhor rota primeiro, restantes por distancia crescente.
   */
  ordenarRotasReais(rotasAPI) {
    if (!rotasAPI || rotasAPI.length === 0) return [];
    if (rotasAPI.length === 1) return [...rotasAPI];

    // Constroi grafo temporario com os dados reais da API
    const grafoTemp = new Grafo();

    // IMPORTANTE: Grafo indexa vertices pelo campo 'nome' (segundo argumento do Vertice).
    // O mesmo string usado aqui deve ser usado em adicionarAresta e calcularMenorCaminho.
    grafoTemp.adicionarVertice(new Vertice('ORIGEM', 'ORIGEM', '', '', 'Origem'));
    grafoTemp.adicionarVertice(new Vertice('DESTINO', 'DESTINO', '', '', 'Destino'));

    // Cada rota alternativa vira um no intermediario com peso = distancia real
    rotasAPI.forEach((rota, i) => {
      const nomeNo = `ROTA_${i}`;
      grafoTemp.adicionarVertice(new Vertice(nomeNo, nomeNo, '', '', 'Rota'));
      // Aresta ORIGEM → ROTA_i com peso = distancia real em km (dado do servico de roteamento)
      grafoTemp.adicionarAresta('ORIGEM', nomeNo, rota.distanciaMetros / 1000);
      // Aresta ROTA_i → DESTINO com peso minimo (Aresta requer peso > 0)
      grafoTemp.adicionarAresta(nomeNo, 'DESTINO', 0.001);
    });

    // Executa Dijkstra para identificar o caminho de menor custo (melhor rota)
    let melhorIndex = 0;
    try {
      const resultado = Dijkstra.calcularMenorCaminho(grafoTemp, 'ORIGEM', 'DESTINO');
      if (resultado && resultado.caminho.length >= 3) {
        // caminho = ['ORIGEM', 'ROTA_i', 'DESTINO'] — extrai o indice i
        const nomeNo = resultado.caminho[1];
        const indexParsed = parseInt(nomeNo.split('_')[1], 10);
        if (!isNaN(indexParsed)) melhorIndex = indexParsed;
      }
    } catch (e) {
      // Se Dijkstra falhar, mantem a primeira rota como melhor (menor distancia da API)
      console.warn('[GrafoService] Dijkstra falhou ao ordenar rotas reais:', e.message);
    }

    // Ordena: melhor rota (identificada pelo Dijkstra) primeiro,
    // as demais em ordem crescente de distancia
    return [...rotasAPI]
      .map((r, i) => ({ ...r, _indexOriginal: i }))
      .sort((a, b) => {
        if (a._indexOriginal === melhorIndex) return -1;
        if (b._indexOriginal === melhorIndex) return 1;
        return a.distanciaMetros - b.distanciaMetros;
      })
      .map(({ _indexOriginal, ...r }) => r);
  }

}

// Singleton: uma única instância do grafo para toda a aplicação
const grafoService = new GrafoService();

module.exports = grafoService;
