/**
 * Definicao das ARESTAS do grafo de localizacoes.
 *
 * ESTRUTURA DO GRAFO:
 * - Vertices: As localizacoes cadastradas (Centro, Shopping, Aeroporto, etc.)
 * - Arestas: Conexoes entre localizacoes com peso (distancia em km)
 * - Grafo nao-direcionado: as arestas valem nos dois sentidos
 *
 * MAPA VISUAL:
 *
 *   Centro ---5km--- Shopping ---12km--- Aeroporto
 *     |                 |                    |
 *     7km             20km                 18km
 *     |                 |                    |
 *   Rodoviaria         Praia ---8km--- Universidade
 *       |                |
 *      15km             10km
 *       |_______________/
 *
 * COMPLEXIDADE DO GRAFO:
 * - Vertices (V): 6
 * - Arestas (E): 7
 * - Complexidade Dijkstra com lista de adjacencia: O((V + E) log V)
 */
const arestas = [
  { origem: 'Centro',      destino: 'Shopping',     peso: 5  },
  { origem: 'Centro',      destino: 'Rodoviaria',   peso: 7  },
  { origem: 'Shopping',    destino: 'Aeroporto',    peso: 12 },
  { origem: 'Shopping',    destino: 'Praia',        peso: 20 },
  { origem: 'Rodoviaria',  destino: 'Aeroporto',   peso: 15 },
  { origem: 'Rodoviaria',  destino: 'Praia',        peso: 10 },
  { origem: 'Praia',       destino: 'Universidade', peso: 8  },
  { origem: 'Universidade',destino: 'Aeroporto',    peso: 18 },
];

module.exports = arestas;
