/**
 * Classe Vertice — representa um ponto de referencia geografico no grafo.
 *
 * No sistema de corridas, cada vertice corresponde a um local real
 * fornecido pelo usuario (origem ou destino de uma operacao de rota).
 * Coordenadas (latitude, longitude) permitem a integracao com servicos
 * de mapeamento para exibicao visual das rotas.
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
