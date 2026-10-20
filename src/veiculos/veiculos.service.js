'use strict';
/**
 * veiculos.service.js — Regras de negócio de cadastro e aprovação de veículos.
 *
 * Todos os métodos são async para suportar o repositório PostgreSQL.
 * Preserva toda a lógica de negócio original.
 *
 * ADMIN_ID atualizado para o UUID fixo do administrador (migration 002).
 *
 * Regras de porte/classe:
 *  - O porte é OBRIGATÓRIO no cadastro e deve ser Pequeno, Medio ou Grande (sem valor padrão).
 *  - Somente o ADMINISTRADOR pode alterar o porte de um veículo já cadastrado.
 *  - A classe é derivada do porte (Pequeno→BASICO, Medio→NORMAL, Grande→PREMIUM); porte desconhecido
 *    é rejeitado (400) — não existe fallback para NORMAL.
 *  - Ao alterar o porte, porte e classe são persistidos no MESMO UPDATE (operação atômica).
 *  - A classe só pode ser alterada manualmente pela rota administrativa /veiculos/:id/classe.
 */

const veiculosRepository   = require('./veiculos.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const authRepository       = require('../auth/auth.repository');
const notificacoesService  = require('../notificacoes/notificacoes.service');
const AppError             = require('../utils/AppError');
const {
  ADMIN_ID,
  PORTES_VALIDOS,
  PORTE_PARA_CLASSE,
  CLASSES_VALIDAS,
  STATUS_APROVACAO_VEICULO,
  STATUS_VEICULO,
} = require('../utils/constants');
const { exigirPorte } = require('../utils/inputValidators');

class VeiculosService {
  /**
   * Determina a classe do serviço baseada no porte do veículo.
   * Valida o porte ANTES de mapear: porte ausente/inválido lança AppError 400 (nunca vira NORMAL).
   * @param {string} porte
   * @returns {string} BASICO, NORMAL ou PREMIUM
   * @throws {AppError} 400 se o porte não for reconhecido
   */
  _determinarClasseServico(porte) {
    const porteCanonico = exigirPorte(porte, PORTES_VALIDOS);
    return PORTE_PARA_CLASSE[porteCanonico];
  }

  async listarPendentes() {
    const lista = await veiculosRepository.findByStatusAprovacao(STATUS_APROVACAO_VEICULO.PENDENTE);
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
    } = dados || {};

    if (!modelo || !marca || !ano || !placa) {
      throw new AppError('modelo, marca, ano, placa e porte são obrigatórios.', 400);
    }

    // Porte obrigatório e válido (ausente/nulo/vazio/desconhecido → 400). Sem porte padrão.
    const pValido = exigirPorte(porte, PORTES_VALIDOS);
    const classe = this._determinarClasseServico(pValido);

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

    try {
      await notificacoesService.notificarSolicitacaoVeiculo(ADMIN_ID, {
        nomeMotorista:  usuario.nome,
        veiculoId:      novoVeiculo.id,
        modeloVeiculo:  `${marca} ${modelo}`,
      });
    } catch (error) {
      console.error('[VeiculosService] Falha ao notificar cadastro de veículo:', error.message);
    }

    return novoVeiculo;
  }

  async aprovar(id) {
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    this._garantirNaoExcluido(v);
    if (v.statusAprovacao === STATUS_APROVACAO_VEICULO.APROVADO) throw new AppError('Veículo já está aprovado.', 409);

    const classe = this._determinarClasseServico(v.porte);
    return this._enriquecer(await veiculosRepository.updateStatusAprovacao(id, STATUS_APROVACAO_VEICULO.APROVADO, classe));
  }

  async editarClasse(id, classe) {
    if (typeof classe !== 'string' || !CLASSES_VALIDAS.includes(classe)) {
      throw new AppError('Classe de serviço inválida.', 400);
    }
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    this._garantirNaoExcluido(v);
    return this._enriquecer(await veiculosRepository.updateClasse(id, classe));
  }

  async rejeitar(id) {
    const v = await veiculosRepository.findById(id);
    if (!v) throw new AppError('Veículo não encontrado.', 404);
    this._garantirNaoExcluido(v);
    if (v.statusAprovacao === STATUS_APROVACAO_VEICULO.REJEITADO) throw new AppError('Veículo já está rejeitado.', 409);
    return this._enriquecer(await veiculosRepository.updateStatusAprovacao(id, STATUS_APROVACAO_VEICULO.REJEITADO));
  }

  async excluir(id, usuarioLogado) {
    if (!usuarioLogado || usuarioLogado.perfil !== 'MOTORISTA') {
      throw new AppError('Apenas motoristas podem excluir veículos.', 403);
    }

    const veiculo = await veiculosRepository.findById(id);
    if (!veiculo || veiculo.statusAprovacao === STATUS_APROVACAO_VEICULO.EXCLUIDO) {
      throw new AppError('Veículo não encontrado.', 404);
    }
    if (veiculo.motoristaId !== usuarioLogado.id) {
      throw new AppError('Acesso negado. Você só pode excluir seu próprio veículo.', 403);
    }
    if (veiculo.status === STATUS_VEICULO.EM_CORRIDA) {
      throw new AppError('Não é possível excluir um veículo que está em uma corrida.', 409);
    }

    return this._enriquecer(await veiculosRepository.softDelete(id));
  }

  async atualizar(id, dados, usuarioLogado) {
    if (!usuarioLogado) throw new AppError('Acesso negado.', 401);
    
    const veiculo = await veiculosRepository.findById(id);
    if (!veiculo) throw new AppError('Veículo não encontrado.', 404);
    this._garantirNaoExcluido(veiculo);

    const isAdmin = usuarioLogado.perfil === 'ADMINISTRADOR';
    if (!isAdmin && veiculo.motoristaId !== usuarioLogado.id) {
      throw new AppError('Acesso negado. Você só pode alterar seu próprio veículo.', 403);
    }

    if (dados === null || typeof dados !== 'object' || Array.isArray(dados)) {
      throw new AppError('Corpo da requisição inválido.', 400);
    }

    // `classe` NÃO é permitida aqui: só é alterada via porte (recalculada) ou pela rota administrativa /classe.
    const camposPermitidos = ['marca', 'modelo', 'ano', 'placa', 'cor', 'porte', 'quilometragem', 'quantidadePassageiros', 'possuiArCondicionado', 'possuiExtintor', 'possuiCintoSeguranca', 'documentacaoRegularizada'];
    const dadosLimpos = Object.keys(dados)
      .filter(key => camposPermitidos.includes(key))
      .reduce((obj, key) => {
        obj[key] = dados[key];
        return obj;
      }, {});

    if (Object.prototype.hasOwnProperty.call(dadosLimpos, 'porte')) {
      if (!isAdmin) {
        throw new AppError('Apenas administradores podem alterar o porte do veículo.', 403);
      }
      const novoPorte = exigirPorte(dadosLimpos.porte, PORTES_VALIDOS);
      dadosLimpos.porte = novoPorte;
      dadosLimpos.classe = this._determinarClasseServico(novoPorte);
    }
    
    const atualizado = await veiculosRepository.update(id, dadosLimpos);
    if (!atualizado) throw new AppError('Veículo não encontrado.', 404);
    return this._enriquecer(atualizado);
  }

  _garantirNaoExcluido(veiculo) {
    if (veiculo.statusAprovacao === STATUS_APROVACAO_VEICULO.EXCLUIDO) {
      throw new AppError('Veículo não encontrado.', 404);
    }
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
