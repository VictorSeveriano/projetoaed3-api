const authRepository = require('../auth/auth.repository');
const corridasRepository = require('../corridas/corridas.repository');
const carrosRepository = require('../carros/carros.repository');
const AppError = require('../utils/AppError');

/**
 * MotoristasService — Consulta de dados do motorista e suas corridas.
 *
 * Responsabilidade: retornar apenas dados do próprio motorista autenticado.
 * A filtragem por motoristaId ocorre aqui — nunca no frontend.
 */
class MotoristasService {
  /**
   * Retorna dados do motorista sem senha.
   * @param {string} id
   * @returns {object}
   */
  buscarPorId(id) {
    const user = authRepository.encontrarPorId(id);
    if (!user) throw new AppError('Motorista não encontrado.', 404);
    if (user.perfil !== 'MOTORISTA') throw new AppError('Usuário não é motorista.', 403);
    const { senha, ...dadosSeguros } = user;
    return dadosSeguros;
  }

  /**
   * Lista corridas do motorista autenticado.
   * @param {string} motoristaId
   * @returns {Corrida[]}
   */
  listarCorridas(motoristaId) {
    return corridasRepository.findByMotoristaId(motoristaId);
  }

  /**
   * Retorna o veículo associado ao motorista.
   * @param {string} motoristaId
   * @returns {object|null}
   */
  buscarVeiculo(motoristaId) {
    return carrosRepository.findByMotoristaId(motoristaId);
  }
}

module.exports = new MotoristasService();
