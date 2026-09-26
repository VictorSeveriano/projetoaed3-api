'use strict';
/**
 * motoristas.service.js — Regras de negócio do módulo de motoristas.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 * Preserva toda a lógica de negócio original.
 */

const motoristasRepository = require('./motoristas.repository');
const authRepository       = require('../auth/auth.repository');
const corridasRepository   = require('../corridas/corridas.repository');
const veiculosRepository   = require('../veiculos/veiculos.repository');
const notificacoesService  = require('../notificacoes/notificacoes.service');
const AppError             = require('../utils/AppError');

// Id do administrador principal.
// Em produção viria do token JWT.
// Após a migration, o admin tem UUID fixo.
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';

class MotoristasService {
  // ----- Consultas admin -----

  async listarTodos() {
    const todos = await motoristasRepository.findAll();
    return Promise.all(todos.map((m) => this._enriquecer(m)));
  }

  async listarPorStatus(statusCadastro) {
    const lista = statusCadastro
      ? await motoristasRepository.findByStatusCadastro(statusCadastro)
      : await motoristasRepository.findAll();
    return Promise.all(lista.map((m) => this._enriquecer(m)));
  }

  async listarOnline() {
    const lista = await motoristasRepository.findByStatusPresenca('ONLINE');
    return Promise.all(lista.map((m) => this._enriquecer(m)));
  }

  // ----- Fluxo de solicitação -----

  async solicitar(usuarioId, cnh) {
    const usuario = await authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);
    if (usuario.perfil !== 'MOTORISTA') {
      throw new AppError('Apenas usuários com perfil MOTORISTA podem solicitar cadastro.', 403);
    }

    const jaExiste = await motoristasRepository.findByUsuarioId(usuarioId);
    if (jaExiste) throw new AppError('Já existe uma solicitação de motorista para este usuário.', 409);

    if (!cnh) {
      throw new AppError('CNH é obrigatória.', 400);
    }
    const { validarCNH, normalizarCNH } = require('../utils/validators');
    const cnhNorm = normalizarCNH(cnh);

    if (!validarCNH(cnhNorm)) {
      throw new AppError('CNH inválida.', 400);
    }

    if (await motoristasRepository.existsByCnh(cnhNorm)) {
      throw new AppError('CNH já cadastrada no sistema.', 409);
    }

    const novoMotorista = await motoristasRepository.create({ usuarioId, cnh: cnhNorm });

    await notificacoesService.notificarSolicitacaoMotorista(ADMIN_ID, {
      nomeMotorista: usuario.nome,
      motoristaId:   novoMotorista.id,
    });

    return novoMotorista;
  }

  async aprovar(id) {
    const m = await motoristasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'APROVADO') throw new AppError('Motorista já está aprovado.', 409);
    return this._enriquecer(await motoristasRepository.updateStatusCadastro(id, 'APROVADO'));
  }

  async rejeitar(id) {
    const m = await motoristasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'REJEITADO') throw new AppError('Motorista já está rejeitado.', 409);
    return this._enriquecer(await motoristasRepository.updateStatusCadastro(id, 'REJEITADO'));
  }

  // ----- Consultas do próprio motorista -----

  async buscarPorUsuarioId(usuarioId) {
    const usuario = await authRepository.encontrarPorId(usuarioId);
    if (!usuario) throw new AppError('Usuário não encontrado.', 404);
    if (usuario.perfil !== 'MOTORISTA') throw new AppError('Usuário não é motorista.', 403);

    const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
    if (!motorista) return null;

    return this._enriquecer(motorista);
  }

  async buscarPorId(id) {
    const m = await motoristasRepository.findById(id);
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    return this._enriquecer(m);
  }

  async listarCorridas(usuarioId) {
    return corridasRepository.findByMotoristaId(usuarioId);
  }

  async buscarVeiculo(usuarioId) {
    return veiculosRepository.findByMotoristaId(usuarioId);
  }

  // ----- Privado -----

  /**
   * Enriquece o objeto motorista com dados do usuário (sem senha).
   * Em banco equivale a um JOIN.
   */
  async _enriquecer(motorista) {
    if (!motorista) return null;
    const usuario = await authRepository.encontrarPorId(motorista.usuarioId);
    const { senha, ...dadosUsuario } = usuario || {};
    const veiculo = await veiculosRepository.findByMotoristaId(motorista.usuarioId);
    return {
      ...motorista,
      usuario: dadosUsuario || null,
      veiculo: veiculo      || null,
    };
  }
}

module.exports = new MotoristasService();
