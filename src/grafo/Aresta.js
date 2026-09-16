/**
 * Classe Aresta - representa uma conexao entre dois vertices do grafo.
 *
 * Cada aresta conecta dois vertices com um peso numerico positivo
 * (distancia em km no grafo academico; distancia real em km no grafo dinamico).
 */
class Aresta {
  constructor(origem, destino, peso) {
    if (typeof peso !== 'number' || peso <= 0) {
      throw new Error(`Peso invalido para aresta ${origem} -> ${destino}: ${peso}`);
    }
    this.origem = origem;
    this.destino = destino;
    this.peso = peso;
  }

  toString() {
    return `${this.origem} --[${this.peso}km]--> ${this.destino}`;
  }
}

module.exports = Aresta;
