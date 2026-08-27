/**
 * Classe Aresta - representa uma conexao entre dois vertices do grafo.
 *
 * No sistema de reservas, cada aresta conecta duas localizacoes
 * com um peso que representa a distancia em km entre elas.
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
