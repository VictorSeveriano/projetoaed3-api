'use strict';
/**
 * veiculos.service.js — Regras de negócio de cadastro e aprovação de veículos.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 * Preserva toda a lógica de negócio original.
 *
 * ADMIN_ID atualizado para o UUID fixo do administrador (migration 002).
 */

const veiculosRepository   = require('./veiculos.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const authRepository       = require('../auth/auth.repository');
const notificacoesService  = require('../notificacoes/notificacoes.service');
const AppError             = require('../utils/AppError');

const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

class VeiculosService {
  /**
   * Determina a classe do serviço baseada no porte do veículo.
   * @param {string} porte
   * @returns {string} BASICO, NORMAL ou PREMIUM
   */
  _determinarClasseServico(porte) {
    const p = (porte || '').toUpperCase();
    if (['HATCH', 'SEDAN COMPACTO', 'PEQUENO'].includes(p))  return 'BASICO';
    if (['SEDAN MEDIO', 'SUV COMPACTO', 'MEDIO'].includes(p)) return 'NORMAL';
    if (['SUV GRANDE', 'LUXO', 'GRANDE'].includes(p))         return 'PREMIUM';
    return 'NORMAL'; // Fallback
  }

  async listarPendentes() {
    const lista = await veiculosRepository.findByStatusAprovacao('PENDENTE');
    return Promise.all(lista.map((v) => this._enriquecer(v)));
  }

  async listarTodos(filtros = {}) {
    let lista = await veiculosRepository.findAll();
    if (filtros.status) {
      const s = filtros.status.toUpperCase();
      lista = lista.filter((v) => v.status === s || v.statusAprovacao === s);
    }
    if (filtros.motoristaId) {
      lista = lista.filter((v) => v.motoristaId === filtros.motoristaId);
    }
    return Promise.all(lista.map((v) => this._enriquecer(v)));
  }

  async cadastrar(usuarioId, dados) {
    const usuario = await authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);

    const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
    if (!motorista) throw new AppError('Solicitação de motorista não encontrada.', 404);
    if (motorista.statusCadastro !== 'APROVADO') {
      throw new AppError('Apenas motoristas aprovados podem cadastrar veículos.', 403);
    }

    const veiculoExistente = await veiculosRepository.findByMotoristaId(usuarioId);
    if (veiculoExistente && ['PENDENTE', 'DISPONIVEL', 'EM_CORRIDA'].includes(veiculoExistente.status)) {
      throw new AppError(
        'Você já possui um veículo cadastrado. Aguarde aprovação ou entre em contato com o administrador.',
        409
      );
    }

    const {
      modelo, marca, ano, placa, porte,
      possuiArCondicionado, possuiExtintor, possuiCintoSeguranca,
      documentacaoRegularizada, cor, quilometragem, quantidadePassageiros,
    } = dados;

    if (!modelo || !marca || !ano || !placa || !porte) {
      throw new AppError('modelo, marca, ano, placa e porte são obrigatórios.', 400);
    }

    const classe = this._determinarClasseServico(porte);

    const novoVeiculo = await veiculosRepository.create({
      modelo, marca, ano, placa, porte, classe,
      possuiArCondicionado:     !!possuiArCondicionado,
      possuiExtintor:           !!possuiExtintor,
      possuiCintoSeguranca:     !!possuiCintoSeguranca,
      documentacaoRegularizada: !!documentacaoRegularizada,
      cor:                      cor || '',
      quilometragem:            quilometragem || 0,
      quantidadePassageiros:    quantidadePassageiros || 4,
      motoristaId:              usuarioId,
    });

    await notificacoesService.notificarSolicitacaoVeiculo(ADMIN_ID, {
      nomeMotorista:  usuario.nome,
      veiculoId:      novoVeiculo.id,
      modeloVeiculo:  `${marca} ${modelo}`,
    });

    return novoVeiculo;
  }

  async aprovar(id) {
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    if (v.statusAprovacao === 'APROVADO') throw new AppError('Veículo já está aprovado.', 409);
    const classe = this._determinarClasseServico(v.porte);
    return this._enriquecer(await veiculosRepository.updateStatusAprovacao(id, 'APROVADO', classe));
  }

  async editarClasse(id, classe) {
    if (!['BASICO', 'NORMAL', 'PREMIUM'].includes(classe)) {
      throw new AppError('Classe de serviço inválida.', 400);
    }
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    return this._enriquecer(await veiculosRepository.updateClasse(id, classe));
  }

  async rejeitar(id) {
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    if (v.statusAprovacao === 'REJEITADO') throw new AppError('Veículo já está rejeitado.', 409);
    return this._enriquecer(await veiculosRepository.updateStatusAprovacao(id, 'REJEITADO'));
  }

  /** Enriquece veículo com dados do motorista (sem senha). */
  async _enriquecer(veiculo) {
    if (!veiculo) return null;
    if (!veiculo.motoristaId) return { ...veiculo, motorista: null };
    const usuario = await authRepository.encontrarPorId(veiculo.motoristaId);
    const { senha, ...dadosUsuario } = usuario || {};
    const motoristaRecord = await motoristasRepository.findByUsuarioId(veiculo.motoristaId);
    return {
      ...veiculo,
      motorista: dadosUsuario
        ? { ...dadosUsuario, cnh: motoristaRecord?.cnh }
        : null,
    };
  }
}

module.exports = new VeiculosService();
