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
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const AppError             = require('../utils/AppError');
const { readCache }        = require('../utils/readCache');
const { ADMIN_ID }         = require('../utils/constants');
const { validarCNH, normalizarCNH } = require('../utils/validators');

const CACHE_TTL_MOTORISTAS_MS = 20000;

function invalidarCachesMotoristas() {
  readCache.invalidarPrefixo('motoristas:');
  readCache.invalidarPrefixo('veiculos:');
  readCache.invalidarPrefixo('usuarios:');
}

class MotoristasService {
  // ----- Consultas admin -----

  async listarPorStatus(statusCadastro) {
    const chave = `motoristas:status:${statusCadastro || 'ALL'}`;
    return readCache.obterOuCarregar(chave, CACHE_TTL_MOTORISTAS_MS, async () => {
      const lista = statusCadastro
        ? await motoristasRepository.findByStatusCadastro(statusCadastro)
        : await motoristasRepository.findAll();
      return Promise.all(lista.map((m) => this._enriquecer(m)));
    });
  }

  async listarOnline() {
    return readCache.obterOuCarregar('motoristas:online', CACHE_TTL_MOTORISTAS_MS, async () => {
      const lista = await motoristasRepository.findByStatusPresenca('ONLINE');
      return Promise.all(lista.map((m) => this._enriquecer(m)));
    });
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
    const cnhNorm = normalizarCNH(cnh);

    if (!validarCNH(cnhNorm)) {
      throw new AppError('CNH inválida.', 400);
    }

    if (await motoristasRepository.existsByCnh(cnhNorm)) {
      throw new AppError('CNH já cadastrada no sistema.', 409);
    }

    const novoMotorista = await motoristasRepository.create({ usuarioId, cnh: cnhNorm });

    await despacharNotificacaoSemFalhar(
      'MotoristasService',
      `solicitacao motorista ${novoMotorista.id}`,
      () =>
        notificacoesService.notificarSolicitacaoMotorista(ADMIN_ID, {
          nomeMotorista: usuario.nome,
          motoristaId:   novoMotorista.id,
        })
    );

    invalidarCachesMotoristas();
    return novoMotorista;
  }

  async _encontrarPorIdOuUsuario(id, { apenasResumo = false } = {}) {
    if (process.env.NODE_ENV !== 'test') {
      if (apenasResumo && typeof motoristasRepository.findResumoByIdOuUsuarioId === 'function') {
        return motoristasRepository.findResumoByIdOuUsuarioId(id);
      }
      if (typeof motoristasRepository.findByIdOuUsuarioId === 'function') {
        return motoristasRepository.findByIdOuUsuarioId(id);
      }
    }
    return (await motoristasRepository.findById(id)) || (await motoristasRepository.findByUsuarioId(id));
  }

  async aprovar(id) {
    const m = await this._encontrarPorIdOuUsuario(id, { apenasResumo: true });
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'APROVADO') throw new AppError('Motorista já está aprovado.', 409);
    const atualizado = await motoristasRepository.updateStatusCadastro(m.id, 'APROVADO');
    if (typeof notificacoesService.marcarSolicitacaoMotoristaLida === 'function') {
      await notificacoesService.marcarSolicitacaoMotoristaLida([m.id, m.usuarioId]);
    }
    invalidarCachesMotoristas();
    return this._enriquecer(atualizado);
  }

  async rejeitar(id) {
    const m = await this._encontrarPorIdOuUsuario(id, { apenasResumo: true });
    if (!m) throw new AppError('Motorista não encontrado.', 404);
    if (m.statusCadastro === 'REJEITADO') throw new AppError('Motorista já está rejeitado.', 409);
    const atualizado = await motoristasRepository.updateStatusCadastro(m.id, 'REJEITADO');
    if (typeof notificacoesService.marcarSolicitacaoMotoristaLida === 'function') {
      await notificacoesService.marcarSolicitacaoMotoristaLida([m.id, m.usuarioId]);
    }
    invalidarCachesMotoristas();
    return this._enriquecer(atualizado);
  }

  async atualizar(id, dados, usuarioLogado) {
    if (!usuarioLogado) throw new AppError('Acesso negado.', 401);
    const motorista = await this.obterMotoristaAutorizado(
      id,
      usuarioLogado,
      'Acesso negado. Você só pode alterar seus próprios dados.'
    );

    if (dados.cnh) {
      const cnhNorm = normalizarCNH(dados.cnh);
      if (!validarCNH(cnhNorm)) {
        throw new AppError('CNH inválida.', 400);
      }
      if (cnhNorm !== motorista.cnh) {
        const existente = await motoristasRepository.existsByCnh(cnhNorm);
        if (existente) {
          throw new AppError('CNH já cadastrada no sistema.', 409);
        }
        await motoristasRepository.updateCnh(motorista.id, cnhNorm);
        motorista.cnh = cnhNorm;
      }
    }

    invalidarCachesMotoristas();
    return this._enriquecer(motorista);
  }

  // ----- Consultas do próprio motorista -----

  /**
   * Busca um motorista por ID (do registro de motorista ou do usuário) e valida que o usuário
   * autenticado é ADMINISTRADOR ou o próprio dono do registro de motorista.
   */
  async obterMotoristaAutorizado(
    id,
    usuarioLogado = null,
    mensagemNegado = 'Voce nao tem permissao para acessar este motorista.',
    { apenasResumo = false } = {}
  ) {
    const m = await this._encontrarPorIdOuUsuario(id, { apenasResumo });
    if (!m) throw new AppError('Motorista não encontrado.', 404);

    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (m.usuarioId !== usuarioLogado.id) {
        throw new AppError(mensagemNegado, 403);
      }
    }
    return m;
  }

  async buscarPorUsuarioId(usuarioId, usuarioLogado = null) {
    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.id !== usuarioId) {
        throw new AppError('Voce nao tem permissao para acessar este perfil.', 403);
      }
    }

    return readCache.obterOuCarregar(`motoristas:perfil:${usuarioId}`, CACHE_TTL_MOTORISTAS_MS, async () => {
      // Consulta motorista já com usuário e veículo em 1 único JOIN, evitando segunda consulta ao authRepository
      const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
      if (motorista && motorista._enriquecidoPreCarregado?.usuario) {
        if (motorista._enriquecidoPreCarregado.usuario.perfil !== 'MOTORISTA') {
          throw new AppError('Usuário não é motorista.', 403);
        }
        return this._enriquecer(motorista);
      }

      const usuario = await authRepository.encontrarPorId(usuarioId);
      if (!usuario) throw new AppError('Usuário não encontrado.', 404);
      if (usuario.perfil !== 'MOTORISTA') throw new AppError('Usuário não é motorista.', 403);

      if (!motorista) return null;
      return this._enriquecer(motorista);
    });
  }

  async buscarPorId(id, usuarioLogado = null) {
    const m = await this.obterMotoristaAutorizado(
      id,
      usuarioLogado,
      'Voce nao tem permissao para acessar este motorista.'
    );
    return this._enriquecer(m);
  }

  async listarCorridas(id, usuarioLogado = null) {
    const m = await this.obterMotoristaAutorizado(
      id,
      usuarioLogado,
      'Voce nao tem permissao para acessar as corridas deste motorista.',
      { apenasResumo: true }
    );
    return corridasRepository.findByMotoristaId(m.usuarioId);
  }

  async buscarVeiculo(id, usuarioLogado = null) {
    const m = await this.obterMotoristaAutorizado(
      id,
      usuarioLogado,
      'Voce nao tem permissao para acessar o veiculo deste motorista.',
      { apenasResumo: true }
    );
    return veiculosRepository.findByMotoristaId(m.usuarioId);
  }

  // ----- Privado -----

  /**
   * Enriquece o objeto motorista com dados do usuário (sem senha).
   * Em banco equivale a um JOIN.
   */
  async _enriquecer(motorista) {
    if (!motorista) return null;
    if (motorista._enriquecidoPreCarregado !== undefined) {
      return {
        ...motorista,
        usuario: motorista._enriquecidoPreCarregado.usuario || null,
        veiculo: motorista._enriquecidoPreCarregado.veiculo || null,
      };
    }
    const [usuario, veiculo] = await Promise.all([
      authRepository.encontrarPorId(motorista.usuarioId),
      veiculosRepository.findByMotoristaId(motorista.usuarioId),
    ]);
    const { senha, ...dadosUsuario } = usuario || {};
    return {
      ...motorista,
      usuario: dadosUsuario || null,
      veiculo: veiculo      || null,
    };
  }
}

module.exports = new MotoristasService();
