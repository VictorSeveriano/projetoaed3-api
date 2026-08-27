const reservas = require('../data/reservas.data');
const { v4: uuidv4 } = { v4: () => Date.now().toString(36) + Math.random().toString(36).substr(2) };

/**
 * ReservasRepository — Camada de acesso a dados de reservas.
 */
class ReservasRepository {
  findAll() {
    return [...reservas];
  }

  findById(id) {
    return reservas.find((r) => r.id === id) || null;
  }

  findByUsuario(usuarioId) {
    return reservas.filter((r) => r.usuarioId === usuarioId);
  }

  findByCarro(carroId) {
    return reservas.filter((r) => r.carroId === carroId && r.status === 'ATIVA');
  }

  create(dados) {
    const novaReserva = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      ...dados,
      status: 'ATIVA',
      criadaEm: new Date().toISOString(),
    };
    reservas.push(novaReserva);
    return novaReserva;
  }

  updateStatus(id, status) {
    const index = reservas.findIndex((r) => r.id === id);
    if (index === -1) return null;
    reservas[index].status = status;
    reservas[index].atualizadaEm = new Date().toISOString();
    return reservas[index];
  }

  delete(id) {
    const index = reservas.findIndex((r) => r.id === id);
    if (index === -1) return false;
    reservas.splice(index, 1);
    return true;
  }
}

module.exports = new ReservasRepository();
