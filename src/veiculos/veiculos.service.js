const carrosRepository = require('../carros/carros.repository');
const motoistasRepository = require('../motoristas/motoristas.repository');
const authRepository = require('../auth/auth.repository');
const notificacoesService = require('../notificacoes/notificacoes.service');
const AppError = require('../utils/AppError');

const ADMIN_ID = '1';

/**
 * VeiculosService — Regras de negócio de cadastro e aprovação de veículos.
 *
 * Fluxo:
 * Motorista APROVADO cadastra veículo → status PENDENTE
 * Admin aprova → status DISPONIVEL (pronto para corridas)
 * Admin rejeita → status REJEITADO (mantido para histórico)
 *
 * Veículo PENDENTE ou REJEITADO não pode ser alocado em corridas.
 */
class VeiculosService {
  /**
   * (Regra removida: A classe é definida manualmente pelo admin)
   */

  /**
   * Lista veículos pendentes de aprovação (admin).
   * @returns {object[]}
   */
  listarPendentes() {
    return carrosRepository.findByStatusAprovacao('PENDENTE').map((v) => this._enriquecer(v));
  }

  /**
   * Lista todos os veículos (admin).
   * @param {object} [filtros]
   * @returns {object[]}
   */
  listarTodos(filtros = {}) {
    let lista = carrosRepository.findAll();
    if (filtros.status) lista = lista.filter((v) => v.status === filtros.status.toUpperCase() || v.statusAprovacao === filtros.status.toUpperCase());
    if (filtros.motoristaId) lista = lista.filter((v) => v.motoristaId === filtros.motoristaId);
    return lista.map((v) => this._enriquecer(v));
  }

  /**
   * Cadastra novo veículo para um motorista APROVADO.
   * Inicia com status PENDENTE — não pode ser usado em corridas até aprovação.
   * @param {string} usuarioId - usuarioId do motorista autenticado
   * @param {object} dados - { modelo, marca, ano, placa, categoria, tarifaBase? }
   * @returns {object}
   */
  cadastrar(usuarioId, dados) {
    const usuario = authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);

    const motorista = motoistasRepository.findByUsuarioId(usuarioId);
    if (!motorista) throw new AppError('Solicitação de motorista não encontrada.', 404);
    if (motorista.statusCadastro !== 'APROVADO') {
      throw new AppError('Apenas motoristas aprovados podem cadastrar veículos.', 403);
    }

    // Impede múltiplos veículos PENDENTE ou DISPONIVEL para o mesmo motorista
    const veiculoExistente = carrosRepository.findByMotoristaId(usuarioId);
    if (veiculoExistente && ['PENDENTE', 'DISPONIVEL', 'EM_CORRIDA'].includes(veiculoExistente.status)) {
      throw new AppError('Você já possui um veículo cadastrado. Aguarde aprovação ou entre em contato com o administrador.', 409);
    }

    const { modelo, marca, ano, placa, porte } = dados;
    if (!modelo || !marca || !ano || !placa || !porte) {
      throw new AppError('modelo, marca, ano, placa e porte são obrigatórios.', 400);
    }

    const novoVeiculo = carrosRepository.create({
      modelo, marca, ano, placa, porte,
      motoristaId: usuarioId,
    });

    // Notifica o administrador
    notificacoesService.notificarSolicitacaoVeiculo(ADMIN_ID, {
      nomeMotorista: usuario.nome,
      veiculoId: novoVeiculo.id,
      modeloVeiculo: `${marca} ${modelo}`,
    });

    return novoVeiculo;
  }

  /**
   * Aprova veículo (admin) e define classe.
   * @param {string} id
   * @param {string} classe - BASICO, NORMAL ou PREMIUM
   * @returns {object}
   */
  aprovar(id, classe) {
    if (!['BASICO', 'NORMAL', 'PREMIUM'].includes(classe)) {
      throw new AppError('Classe de serviço inválida. Deve ser BASICO, NORMAL ou PREMIUM.', 400);
    }
    const v = carrosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    if (v.statusAprovacao === 'APROVADO') {
      throw new AppError('Veículo já está aprovado.', 409);
    }
    return this._enriquecer(carrosRepository.updateStatusAprovacao(id, 'APROVADO', classe));
  }

  /**
   * Edita a classe do veículo.
   */
  editarClasse(id, classe) {
    if (!['BASICO', 'NORMAL', 'PREMIUM'].includes(classe)) {
      throw new AppError('Classe de serviço inválida.', 400);
    }
    const v = carrosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    return this._enriquecer(carrosRepository.updateClasse(id, classe));
  }

  /**
   * Rejeita veículo (admin). Registro mantido para histórico.
   * @param {string} id
   * @returns {object}
   */
  rejeitar(id) {
    const v = carrosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    if (v.statusAprovacao === 'REJEITADO') throw new AppError('Veículo já está rejeitado.', 409);
    return this._enriquecer(carrosRepository.updateStatusAprovacao(id, 'REJEITADO'));
  }

  /** Enriquece veículo com dados do motorista (sem senha). */
  _enriquecer(veiculo) {
    if (!veiculo) return null;
    if (!veiculo.motoristaId) return { ...veiculo, motorista: null };
    const usuario = authRepository.encontrarPorId(veiculo.motoristaId);
    const { senha, ...dadosUsuario } = usuario || {};
    const motoristaRecord = motoistasRepository.findByUsuarioId(veiculo.motoristaId);
    return { ...veiculo, motorista: dadosUsuario ? { ...dadosUsuario, cnh: motoristaRecord?.cnh } : null };
  }
}

module.exports = new VeiculosService();
