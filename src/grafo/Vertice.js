/**
 * Classe Vertice - representa uma localidade no grafo.
 *
 * No sistema de reservas, cada vertice corresponde a uma localizacao
 * (Centro, Shopping, Aeroporto, etc.) onde carros podem estar disponíveis.
 */
class Vertice {
  constructor(id, nome, descricao = '') {
    this.id = id;
    this.nome = nome;
    this.descricao = descricao;
  }

  toString() {
    return this.nome;
  }
}

module.exports = Vertice;
