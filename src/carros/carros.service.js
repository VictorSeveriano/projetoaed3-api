const carrosRepository = require('./carros.repository');
const AppError = require('../utils/AppError');

/**
 * CarrosService — Regras de negocio de carros.
 */
class CarrosService {
  listarTodos(filtros = {}) {
    let carros = carrosRepository.findAll();

    if (filtros.categoria) {
      carros = carros.filter((c) => c.categoria.toLowerCase() === filtros.categoria.toLowerCase());
    }
    if (filtros.marca) {
      carros = carros.filter((c) => c.marca.toLowerCase() === filtros.marca.toLowerCase());
    }
    if (filtros.localizacao) {
      carros = carros.filter((c) => c.localizacao === filtros.localizacao);
    }
    if (filtros.status) {
      carros = carros.filter((c) => c.status === filtros.status.toUpperCase());
    }

    return carros;
  }

  listarDisponiveis() {
    return carrosRepository.findDisponiveis();
  }

  buscarPorId(id) {
    const carro = carrosRepository.findById(id);
    if (!carro) {
      throw new AppError(`Carro com id '${id}' nao encontrado.`, 404);
    }
    return carro;
  }

  atualizarStatus(id, status) {
    const statusValidos = ['DISPONIVEL', 'RESERVADO'];
    if (!statusValidos.includes(status)) {
      throw new AppError(`Status invalido: ${status}. Valores aceitos: ${statusValidos.join(', ')}`, 400);
    }
    const carro = carrosRepository.updateStatus(id, status);
    if (!carro) {
      throw new AppError(`Carro com id '${id}' nao encontrado.`, 404);
    }
    return carro;
  }
}

module.exports = new CarrosService();
