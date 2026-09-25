const carros = require('../data/carros.data');

/**
 * CarrosRepository — Camada de acesso a dados de carros.
 * Opera sobre o array em memoria; substituivel por DatabaseRepository no futuro.
 *
 * MODELAGEM DE STATUS:
 * statusAprovacao: PENDENTE | APROVADO | REJEITADO
 * status: DISPONIVEL | EM_CORRIDA | INDISPONIVEL
 *
 * Regra: apenas veículos APROVADOS e com status DISPONIVEL podem ser alocados.
 */
class CarrosRepository {
  findAll() {
    return [...carros];
  }

  findById(id) {
    return carros.find((c) => c.id === id) || null;
  }

  findDisponiveis() {
    return carros.filter((c) => c.statusAprovacao === 'APROVADO' && c.status === 'DISPONIVEL');
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
   * Lista veículos por status de aprovação (PENDENTE, REJEITADO, APROVADO).
   * @param {string} statusAprovacao
   * @returns {object[]}
   */
  findByStatusAprovacao(statusAprovacao) {
    return carros.filter((c) => c.statusAprovacao === statusAprovacao);
  }

  updateStatusAprovacao(id, statusAprovacao, classe = null) {
    const index = carros.findIndex((c) => c.id === id);
    if (index === -1) return null;
    carros[index].statusAprovacao = statusAprovacao;
    if (statusAprovacao === 'APROVADO') {
      carros[index].status = 'DISPONIVEL'; // Libera para corridas
    }
    if (classe) {
      carros[index].classe = classe;
    }
    return carros[index];
  }

  updateStatus(id, status) {
    const index = carros.findIndex((c) => c.id === id);
    if (index === -1) return null;
    carros[index].status = status;
    return carros[index];
  }

  updateClasse(id, classe) {
    const index = carros.findIndex((c) => c.id === id);
    if (index === -1) return null;
    carros[index].classe = classe;
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
      porte: dados.porte,
      classe: dados.classe || null, // A ser definida pelo admin
      statusAprovacao: 'PENDENTE',
      status: 'INDISPONIVEL',
      tarifaBase: dados.tarifaBase || null, // Não exibir/definir valores agora
      motoristaId: dados.motoristaId,
      criadoEm: new Date().toISOString(),
    };
    carros.push(novo);
    return novo;
  }
}

module.exports = new CarrosRepository();
