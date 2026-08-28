/**
 * Definição das ARESTAS do grafo de rotas — Espírito Santo.
 *
 * ESTRUTURA DO GRAFO:
 * - Vértices: Os 7 locais reais cadastrados (localizacoes.data.js)
 * - Arestas : Conexões entre locais com peso = distância rodoviária real em km
 * - Grafo não-direcionado: cada aresta vale nos dois sentidos
 *
 * DISTÂNCIAS:
 * Os valores de peso representam distâncias rodoviárias aproximadas em km,
 * baseadas em rotas reais da região metropolitana da Grande Vitória - ES.
 * São utilizadas internamente pelo algoritmo de Dijkstra para determinar
 * o caminho de menor distância entre os locais.
 *
 * MAPA DOS LOCAIS:
 *   [1] Rodoviária de Vitória    — Vitória/ES
 *   [2] Aeroporto de Vitória     — Vitória/ES
 *   [3] Estádio Kleber Andrade   — Cariacica/ES
 *   [4] Estação Pedro Nolasco    — Cariacica/ES
 *   [5] Convento da Penha        — Vila Velha/ES
 *   [6] Terminal de Carapina     — Serra/ES
 *   [7] Shopping Montserrat      — Serra/ES
 *
 * GRAFO DE CONECTIVIDADE:
 *
 *   Rodoviária ──── Aeroporto ──── Terminal Carapina ──── Shopping Montserrat
 *       │                │
 *   Convento Penha    Estádio Kleber ──── Estação Pedro Nolasco
 *
 * COMPLEXIDADE:
 * - Vértices (V): 7
 * - Arestas (E): 12
 * - Dijkstra com lista de adjacência: O((V + E) log V)
 */
const arestas = [
  // Vitória ↔ Vitória
  { origem: 'Rodoviária de Vitória',  destino: 'Aeroporto de Vitória',    peso: 9  },

  // Vitória ↔ Vila Velha
  { origem: 'Rodoviária de Vitória',  destino: 'Convento da Penha',       peso: 5  },

  // Vitória ↔ Cariacica
  { origem: 'Rodoviária de Vitória',  destino: 'Estádio Kleber Andrade',  peso: 14 },

  // Vitória ↔ Serra
  { origem: 'Aeroporto de Vitória',   destino: 'Terminal de Carapina',    peso: 11 },
  { origem: 'Aeroporto de Vitória',   destino: 'Shopping Montserrat',     peso: 12 },

  // Cariacica ↔ Cariacica
  { origem: 'Estádio Kleber Andrade', destino: 'Estação Pedro Nolasco',   peso: 4  },

  // Cariacica ↔ Vitória
  { origem: 'Estação Pedro Nolasco',  destino: 'Rodoviária de Vitória',   peso: 18 },

  // Cariacica ↔ Serra
  { origem: 'Estádio Kleber Andrade', destino: 'Terminal de Carapina',    peso: 22 },

  // Vila Velha ↔ Aeroporto
  { origem: 'Convento da Penha',      destino: 'Aeroporto de Vitória',    peso: 10 },

  // Serra ↔ Serra
  { origem: 'Terminal de Carapina',   destino: 'Shopping Montserrat',     peso: 2  },

  // Conexões alternativas para garantir grafo conectado
  { origem: 'Convento da Penha',      destino: 'Estádio Kleber Andrade',  peso: 17 },
  { origem: 'Shopping Montserrat',    destino: 'Estação Pedro Nolasco',   peso: 26 },
];

module.exports = arestas;
