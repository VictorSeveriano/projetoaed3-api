const carros = require('../data/carros.data');

/**
 * CarrosRepository — Camada de acesso a dados de carros.
 * Opera sobre o array em memoria; substituivel por DatabaseRepository no futuro.
 *
 * MODELAGEM DE STATUS:
 * PENDENTE  — cadastrado pelo motorista, aguarda análise do administrador
 * APROVADO  — não usado diretamente (veículo aprovado fica DISPONIVEL)
 * REJEITADO — rejeitado; não pode ser usado em corridas
 * DISPONIVEL — apto para corridas
 * EM_CORRIDA — em uso atualmente
 *
 * Regra: apenas veículos DISPONIVEL podem ser alocados para corridas.
 */
class CarrosRepository {
  findAll() {
    return [...carros];
  }

  findById(id) {
    return carros.find((c) => c.id === id) || null;
  }

  findDisponiveis() {
    return carros.filter((c) => c.status === 'DISPONIVEL');
  }

  findByStatus(status) {
    return carros.filter((c) => c.status === status);
  }

  /**
   * Retorna o veículo associado a um motorista (pelo usuarioId do motorista).
   * Retorna null se não houver veículo associado.
   * @param {string} motoristaId - usuarioId do motorista
   * @returns {object|null}
   */
  findByMotoristaId(motoristaId) {
    return carros.find((c) => c.motoristaId === motoristaId) || null;
  }

  /**
   * Lista veículos por status de aprovação (PENDENTE, REJEITADO, DISPONIVEL, EM_CORRIDA).
   * @param {string} status
   * @returns {object[]}
   */
  findByStatusAprovacao(status) {
    return carros.filter((c) => c.status === status);
  }

  updateStatus(id, status) {
    const index = carros.findIndex((c) => c.id === id);
    if (index === -1) return null;
    carros[index].status = status;
    return carros[index];
  }

  /**
   * Cria novo veículo com status PENDENTE (aguarda aprovação admin).
   * @param {object} dados
   * @returns {object}
   */
  create(dados) {
    const novo = {
      id: String(carros.length + 1),
      modelo: dados.modelo,
      marca: dados.marca,
      ano: dados.ano,
      placa: dados.placa,
      categoria: dados.categoria,
      status: 'PENDENTE', // sempre inicia PENDENTE para novo cadastro de motorista
      tarifaBase: dados.tarifaBase || 3.00,
      motoristaId: dados.motoristaId,
      criadoEm: new Date().toISOString(),
    };
    carros.push(novo);
    return novo;
  }
}

module.exports = new CarrosRepository();
