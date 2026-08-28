/**
 * Classe Vertice — representa um local no grafo de rotas.
 *
 * No sistema de reservas, cada vértice corresponde a um local real
 * (Rodoviária, Aeroporto, Estádio, etc.) onde veículos podem estar
 * disponíveis para retirada ou devolução.
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
