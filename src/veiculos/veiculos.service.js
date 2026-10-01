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
const { ADMIN_ID }         = require('../utils/constants');

class VeiculosService {
  /**
   * Determina a classe do serviço baseada no porte do veículo.
   * @param {string} porte
   * @returns {string} BASICO, NORMAL ou PREMIUM
   */
  _determinarClasseServico(porte) {
    const p = (porte || '').toLowerCase();
    if (p === 'pequeno') return 'BASICO';
    if (p === 'medio')   return 'NORMAL';
    if (p === 'grande')  return 'PREMIUM';
    return 'NORMAL'; // Fallback
  }

  async listarPendentes() {
    const lista = await veiculosRepository.findByStatusAprovacao('PENDENTE');
    return Promise.all(lista.map((v) => this._enriquecer(v)));
  }

  async listarTodos(filtros = {}) {
    const lista = await veiculosRepository.findAll(filtros);
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

    const PORTES_VALIDOS = ['Pequeno', 'Medio', 'Grande'];
    const pStr = (porte || '').trim();
    const pValido = PORTES_VALIDOS.find(p => p.toLowerCase() === pStr.toLowerCase());
    if (!pValido) {
      throw new AppError('Porte inválido. Use Pequeno, Medio ou Grande.', 400);
    }

    const classe = this._determinarClasseServico(porte);

    const novoVeiculo = await veiculosRepository.create({
      modelo, marca, ano, placa, porte: pValido, classe,
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

  async atualizar(id, dados, usuarioLogado) {
    if (!usuarioLogado) throw new AppError('Acesso negado.', 401);
    
    const veiculo = await veiculosRepository.findById(id);
    if (!veiculo) throw new AppError('Veículo não encontrado.', 404);

    if (usuarioLogado.perfil !== 'ADMINISTRADOR' && veiculo.motoristaId !== usuarioLogado.id) {
      throw new AppError('Acesso negado. Você só pode alterar seu próprio veículo.', 403);
    }

    if (dados.porte) {
      const PORTES_VALIDOS = ['Pequeno', 'Medio', 'Grande'];
      const pStr = (dados.porte || '').trim();
      const pValido = PORTES_VALIDOS.find(p => p.toLowerCase() === pStr.toLowerCase());
      
      if (!pValido) {
        throw new AppError('Porte inválido. Use Pequeno, Medio ou Grande.', 400);
      }
      if (pValido !== veiculo.porte) {
        dados.porte = pValido;
        dados.classe = this._determinarClasseServico(pValido);
      }
    }
    
    // Filtra campos não permitidos para edição por esta rota
    const camposPermitidos = ['marca', 'modelo', 'ano', 'placa', 'cor', 'porte', 'classe'];
    const dadosLimpos = Object.keys(dados)
      .filter(key => camposPermitidos.includes(key))
      .reduce((obj, key) => {
        obj[key] = dados[key];
        return obj;
      }, {});
    
    return this._enriquecer(await veiculosRepository.update(id, dadosLimpos));
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
