const motoistasRepository = require('./motoristas.repository');
const authRepository = require('../auth/auth.repository');
const corridasRepository = require('../corridas/corridas.repository');
const carrosRepository = require('../carros/carros.repository');
const notificacoesService = require('../notificacoes/notificacoes.service');
const AppError = require('../utils/AppError');

/**
 * MotoristasService — Regras de negócio do módulo de motoristas.
 *
 * Cobre:
 * - Solicitação de cadastro (motorista → PENDENTE)
 * - Aprovação / rejeição (administrador)
 * - Consultas: perfil, corridas, veículo (próprio motorista)
 * - Consultas admin: todos, pendentes, online
 *
 * Regra inegociável: filtragem por motoristaId sempre no backend.
 */

// Id do administrador principal — em produção viria do token JWT.
// Aqui é constante pois há apenas um admin no mock.
const ADMIN_ID = '1';

class MotoristasService {
  // ----- Consultas admin -----

  /**
   * Lista todos os motoristas enriquecidos com dados do usuário.
   * Uso: tela "Motoristas cadastrados" (admin).
   * @returns {object[]}
   */
  listarTodos() {
    const todos = motoistasRepository.findAll();
    return todos.map((m) => this._enriquecer(m));
  }

  /**
   * Lista motoristas filtrados por statusCadastro.
   * @param {string} [statusCadastro] - se omitido retorna todos
   * @returns {object[]}
   */
  listarPorStatus(statusCadastro) {
    const lista = statusCadastro
      ? motoistasRepository.findByStatusCadastro(statusCadastro)
      : motoistasRepository.findAll();
    return lista.map((m) => this._enriquecer(m));
  }

  /**
   * Lista motoristas APROVADOS e ONLINE.
   * Uso: tela "Motoristas online" (admin).
   * @returns {object[]}
   */
  listarOnline() {
    return motoistasRepository.findByStatusPresenca('ONLINE').map((m) => this._enriquecer(m));
  }

  // ----- Fluxo de solicitação -----

  /**
   * Cria solicitação de cadastro de motorista.
   * statusCadastro inicia como PENDENTE.
   * Notifica o administrador.
   * @param {string} usuarioId
   * @param {string} cnh
   * @returns {object}
   */
  solicitar(usuarioId, cnh) {
    const usuario = authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);
    if (usuario.perfil !== 'MOTORISTA') throw new AppError('Apenas usuários com perfil MOTORISTA podem solicitar cadastro.', 403);

    // Impede duplicata de solicitação
    const jaExiste = motoistasRepository.findByUsuarioId(usuarioId);
    if (jaExiste) throw new AppError('Já existe uma solicitação de motorista para este usuário.', 409);

    if (!cnh || cnh.trim().length < 11) {
      throw new AppError('CNH inválida. Informe o número completo (11 dígitos).', 400);
    }

    const novoMotorista = motoistasRepository.create({ usuarioId, cnh: cnh.trim() });

    // Notifica o administrador
    notificacoesService.notificarSolicitacaoMotorista(ADMIN_ID, {
      nomeMotorista: usuario.nome,
      motoristaId: novoMotorista.id,
    });

    return novoMotorista;
  }

  /**
   * Aprova um motorista (admin).
   * @param {string} id - id do registro de motorista
   * @returns {object}
   */
  aprovar(id) {
    const m = motoistasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'APROVADO') throw new AppError('Motorista já está aprovado.', 409);
    return this._enriquecer(motoistasRepository.updateStatusCadastro(id, 'APROVADO'));
  }

  /**
   * Rejeita um motorista (admin). Mantém o registro para histórico.
   * @param {string} id
   * @returns {object}
   */
  rejeitar(id) {
    const m = motoistasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'REJEITADO') throw new AppError('Motorista já está rejeitado.', 409);
    return this._enriquecer(motoistasRepository.updateStatusCadastro(id, 'REJEITADO'));
  }

  // ----- Consultas do próprio motorista -----

  /**
   * Retorna dados do motorista pelo usuarioId (uso pelo próprio motorista).
   * @param {string} usuarioId
   * @returns {object}
   */
  buscarPorUsuarioId(usuarioId) {
    const usuario = authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);
    if (usuario.perfil !== 'MOTORISTA') throw new AppError('Usuário não é motorista.', 403);

    const motorista = motoistasRepository.findByUsuarioId(usuarioId);
    if (!motorista) return null; // Ainda não solicitou cadastro

    return this._enriquecer(motorista);
  }

  /**
   * Retorna dados do motorista pelo id do registro (uso admin).
   * @param {string} id
   * @returns {object}
   */
  buscarPorId(id) {
    const m = motoistasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    return this._enriquecer(m);
  }

  /**
   * Lista corridas do motorista — filtragem no backend.
   * @param {string} usuarioId
   * @returns {Corrida[]}
   */
  listarCorridas(usuarioId) {
    return corridasRepository.findByMotoristaId(usuarioId);
  }

  /**
   * Retorna o veículo associado ao motorista.
   * @param {string} usuarioId
   * @returns {object|null}
   */
  buscarVeiculo(usuarioId) {
    return carrosRepository.findByMotoristaId(usuarioId);
  }

  // ----- Privado -----

  /**
   * Enriquece o objeto motorista com dados do usuário (sem senha).
   * Evita duplicar campos no mock; em banco seria um JOIN.
   * @param {object} motorista
   * @returns {object}
   */
  _enriquecer(motorista) {
    if (!motorista) return null;
    const usuario = authRepository.encontrarPorId(motorista.usuarioId);
    const { senha, ...dadosUsuario } = usuario || {};
    const veiculo = carrosRepository.findByMotoristaId(motorista.usuarioId);
    return {
      ...motorista,
      usuario: dadosUsuario || null,
      veiculo: veiculo || null,
    };
  }
}

module.exports = new MotoristasService();
