/**
 * Classe Vertice — representa um ponto de referência geográfico no grafo.
 *
 * No sistema de corridas, cada vértice corresponde a um local real
 * do Espírito Santo (Rodoviária, Aeroporto, Estádio, etc.) que compõe
 * o grafo estático de 7 locais usado para fins acadêmicos.
 *
 * O grafo é usado em dois contextos:
 * 1. Consulta acadêmica via /api/grafo — exibição do grafo e seus algoritmos
 * 2. Ordenação de rotas reais (Google Routes API) via GrafoService.ordenarRotasReais()
 *
 * Os campos de coordenadas (latitude, longitude) permitem a integração
 * com serviços de mapeamento para exibição visual das rotas.
 *
 * Estrutura compatível com futura migração ao banco de dados.
 */
class Vertice {
  /**
   * @param {string} id         - Identificador único
   * @param {string} nome       - Nome de exibição
   * @param {string} cidade     - Cidade onde o local está situado
   * @param {string} estado     - UF (ex: 'ES')
   * @param {string} categoria  - Tipo do local (ex: 'Aeroporto')
   * @param {number} latitude   - Coordenada geográfica real
   * @param {number} longitude  - Coordenada geográfica real
   */
  constructor(id, nome, cidade = '', estado = '', categoria = '', latitude = null, longitude = null) {
    this.id = id;
    this.nome = nome;
    this.cidade = cidade;
    this.estado = estado;
    this.categoria = categoria;
    this.latitude = latitude;
    this.longitude = longitude;
  }

  toString() {
    return this.nome;
  }
}

module.exports = Vertice;
