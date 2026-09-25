const Corrida = require('./Corrida');
const corridasData = require('../data/corridas.data');

/**
 * CorridasRepository — Acesso aos dados de corridas.
 *
 * Implementação em memória preparada para substituição por banco de dados.
 * Segue o padrão Repository: encapsula toda a lógica de persistência,
 * permitindo que o Service trabalhe com abstração e não com dados brutos.
 *
 * Para migrar ao banco: substituir os métodos por chamadas ORM/SQL
 * mantendo as mesmas assinaturas.
 */
class CorridasRepository {
  constructor() {
    // Carrega dados iniciais convertendo em instâncias de Corrida
    this._corridas = corridasData.map((c) => new Corrida(c));
    // _nextId: mocks existentes têm ids c1..c17, portanto próximo é c18
    this._nextId = 18;
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
   * Filtragem por usuário — deve ocorrer no backend para garantir isolamento.
   * @param {string} usuarioId
   * @returns {Corrida[]}
   */
  findByUsuarioId(usuarioId) {
    return this._corridas.filter((c) => c.usuarioId === usuarioId);
  }

  /**
   * Filtragem por motorista — deve ocorrer no backend para garantir isolamento.
   * @param {string} motoristaId
   * @returns {Corrida[]}
   */
  findByMotoristaId(motoristaId) {
    return this._corridas.filter((c) => c.motoristaId === motoristaId);
  }

  /**
   * Corridas do motorista filtradas por período (mês/ano) — usa dataHorario.
   * @param {string} motoristaId
   * @param {number} mes  - 1..12
   * @param {number} ano  - ex: 2026
   * @returns {Corrida[]}
   */
  findByMotoristaIdAndPeriodo(motoristaId, mes, ano) {
    return this._corridas.filter((c) => {
      if (c.motoristaId !== motoristaId) return false;
      const d = new Date(c.dataHorario);
      return d.getFullYear() === ano && d.getMonth() + 1 === mes;
    });
  }

  /**
   * Corridas do usuário filtradas por status.
   * @param {string} usuarioId
   * @param {string} status
   * @returns {Corrida[]}
   */
  findByUsuarioIdAndStatus(usuarioId, status) {
    return this._corridas.filter((c) => c.usuarioId === usuarioId && c.status === status);
  }

  /**
   * @param {string} veiculoId
   * @returns {Corrida[]}
   */
  findByVeiculo(veiculoId) {
    return this._corridas.filter((c) => c.veiculoId === veiculoId);
  }

  /**
   * Cria nova corrida e persiste em memória.
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
