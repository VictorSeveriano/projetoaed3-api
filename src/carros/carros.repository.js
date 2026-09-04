const carros = require('../data/carros.data');

/**
 * CarrosRepository — Camada de acesso a dados de carros.
 * Opera sobre o array em memoria; substituivel por DatabaseRepository no futuro.
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


  updateStatus(id, status) {
    const index = carros.findIndex((c) => c.id === id);
    if (index === -1) return null;
    carros[index].status = status;
    return carros[index];
  }
}

module.exports = new CarrosRepository();
