const veiculos = require('../data/veiculos.data');

/**
 * VeiculosRepository — Camada de acesso a dados de veiculos.
 * Opera sobre o array em memoria; substituivel por DatabaseRepository no futuro.
 *
 * MODELAGEM DE STATUS:
 * statusAprovacao: PENDENTE | APROVADO | REJEITADO
 * status: DISPONIVEL | EM_CORRIDA | INDISPONIVEL
 *
 * Regra: apenas veículos APROVADOS e com status DISPONIVEL podem ser alocados.
 */
class VeiculosRepository {
  findAll() {
    return [...veiculos];
  }

  findById(id) {
    return veiculos.find((c) => c.id === id) || null;
  }

  findDisponiveis() {
    return veiculos.filter((c) => c.statusAprovacao === 'APROVADO' && c.status === 'DISPONIVEL');
  }

  findByStatus(status) {
    return veiculos.filter((c) => c.status === status);
  }

  /**
   * Retorna o veículo associado a um motorista (pelo usuarioId do motorista).
   * Retorna null se não houver veículo associado.
   * @param {string} motoristaId - usuarioId do motorista
   * @returns {object|null}
   */
  findByMotoristaId(motoristaId) {
    return veiculos.find((c) => c.motoristaId === motoristaId) || null;
  }

  /**
   * Lista veículos por status de aprovação (PENDENTE, REJEITADO, APROVADO).
   * @param {string} statusAprovacao
   * @returns {object[]}
   */
  findByStatusAprovacao(statusAprovacao) {
    return veiculos.filter((c) => c.statusAprovacao === statusAprovacao);
  }

  updateStatusAprovacao(id, statusAprovacao, classe = null) {
    const index = veiculos.findIndex((c) => c.id === id);
    if (index === -1) return null;
    veiculos[index].statusAprovacao = statusAprovacao;
    if (statusAprovacao === 'APROVADO') {
      veiculos[index].status = 'DISPONIVEL'; // Libera para corridas
    }
    if (classe) {
      veiculos[index].classe = classe;
    }
    return veiculos[index];
  }

  updateStatus(id, status) {
    const index = veiculos.findIndex((c) => c.id === id);
    if (index === -1) return null;
    veiculos[index].status = status;
    return veiculos[index];
  }

  updateClasse(id, classe) {
    const index = veiculos.findIndex((c) => c.id === id);
    if (index === -1) return null;
    veiculos[index].classe = classe;
    return veiculos[index];
  }

  /**
   * Cria novo veículo com status PENDENTE (aguarda aprovação admin).
   * @param {object} dados
   * @returns {object}
   */
  create(dados) {
    const novo = {
      id: String(veiculos.length + 1),
      modelo: dados.modelo,
      marca: dados.marca,
      ano: dados.ano,
      placa: dados.placa,
      porte: dados.porte,
      classe: dados.classe, // Derivada no service
      possuiArCondicionado: dados.possuiArCondicionado,
      possuiExtintor: dados.possuiExtintor,
      possuiCintoSeguranca: dados.possuiCintoSeguranca,
      documentacaoRegularizada: dados.documentacaoRegularizada,
      cor: dados.cor,
      quilometragem: dados.quilometragem,
      quantidadePassageiros: dados.quantidadePassageiros,
      statusAprovacao: 'PENDENTE',
      status: 'INDISPONIVEL',
      tarifaBase: null, // A ser definido futuramente
      motoristaId: dados.motoristaId,
      criadoEm: new Date().toISOString(),
    };
    veiculos.push(novo);
    return novo;
  }
}

module.exports = new VeiculosRepository();
