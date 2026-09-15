const Corrida = require('./Corrida');
const corridasData = require('../data/corridas.data');

/**
 * CorridasRepository — Acesso aos dados de corridas.
 *
 * Implementacao em memoria preparada para substituicao por banco de dados.
 * Segue o padrao Repository: encapsula toda a logica de persistencia,
 * permitindo que o Service trabalhe com abstraco e nao com dados brutos.
 */
class CorridasRepository {
  constructor() {
    // Carrega dados iniciais convertendo em instancias de Corrida
    this._corridas = corridasData.map((c) => new Corrida(c));
    // _nextId = 15: mocks existentes têm ids c1..c14, portanto próximo é c15
    this._nextId = 15;
  }

  /** @returns {Corrida[]} */
  findAll() {
    return [...this._corridas];
  }

  /**
   * @param {string} id
   * @returns {Corrida|undefined}
   */
  findById(id) {
    return this._corridas.find((c) => c.id === id);
  }

  /**
   * @param {string} usuarioId
   * @returns {Corrida[]}
   */
  findByUsuario(usuarioId) {
    return this._corridas.filter((c) => c.usuarioId === usuarioId);
  }

  /**
   * @param {string} veiculoId
   * @returns {Corrida[]}
   */
  findByVeiculo(veiculoId) {
    return this._corridas.filter((c) => c.veiculoId === veiculoId);
  }

  /**
   * Cria nova corrida e persiste em memoria.
   * @param {object} dados
   * @returns {Corrida}
   */
  create(dados) {
    const novaCorrida = new Corrida({
      ...dados,
      id: 'c' + String(this._nextId++),
      criadaEm: new Date().toISOString(),
    });
    this._corridas.push(novaCorrida);
    return novaCorrida;
  }

  /**
   * Atualiza o status de uma corrida.
   * @param {string} id
   * @param {string} status
   * @returns {Corrida|undefined}
   */
  updateStatus(id, status) {
    const corrida = this.findById(id);
    if (!corrida) return undefined;
    corrida.status = status;
    return corrida;
  }

  /**
   * Remove uma corrida.
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const index = this._corridas.findIndex((c) => c.id === id);
    if (index === -1) return false;
    this._corridas.splice(index, 1);
    return true;
  }
}

module.exports = new CorridasRepository();
