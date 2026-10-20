'use strict';
/**
 * corridas.service.js — Regras de negócios e fluxo operacional de corridas.
 *
 * Responsabilidades:
 *   - Consulta de corridas por perfil com autorização
 *   - Verificação de disponibilidade de veículos por classe
 *   - Criação de corridas com notificação aos motoristas elegíveis
 *   - Aceite e recusa de corrida pelo motorista (com prevenção de duplo aceite e de dupla alocação de veículo)
 *   - Confirmação de pagamento e finalização
 *   - Cancelamento
 *
 * Política de notificações: uma notificação é um efeito colateral. Se ela falhar DEPOIS de a operação
 * de negócio ter sido confirmada (corrida criada/aceita/finalizada), a falha é registrada em log com
 * contexto e a operação NÃO é revertida nem retorna erro ao cliente.
 */

const corridasRepository   = require('./corridas.repository');
const veiculosRepository   = require('../veiculos/veiculos.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const notificacoesService  = require('../notificacoes/notificacoes.service');
const AppError             = require('../utils/AppError');
const {
  STATUS_CORRIDA,
  BUSINESS_TIMEZONE,
} = require('../utils/constants');
const {
  TARIFAS_KM,
  determinarFaixaHorario,
  calcularValorCorrida,
  validarDadosCriacaoCorrida,
} = require('./corridas.validador');

class CorridasService {
  static get TARIFAS_KM() {
    return TARIFAS_KM;
  }

  static _determinarFaixaHorario(dataHorario) {
    return determinarFaixaHorario(dataHorario);
  }

  async listarTodas() {
    return corridasRepository.findAll();
  }

  async listarPorPerfil(usuarioId, perfil, status) {
    if (perfil === 'ADMINISTRADOR') {
      const todas = await corridasRepository.findAll();
      return status ? todas.filter((c) => c.status === status) : todas;
    }
    if (perfil === 'MOTORISTA') {
      const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
      if (!motorista) return [];
      return status
        ? corridasRepository.findByMotoristaIdAndStatus(usuarioId, status)
        : corridasRepository.findByMotoristaId(usuarioId);
    }
    return status
      ? corridasRepository.findByUsuarioIdAndStatus(usuarioId, status)
      : corridasRepository.findByUsuarioId(usuarioId);
  }

  async buscarPorId(id, usuarioLogado = null) {
    const corrida = await corridasRepository.findById(id);
    if (!corrida) throw new AppError('Corrida ' + id + ' nao encontrada.', 404);
    
    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.perfil === 'MOTORISTA') {
        if (!corrida.motoristaId || corrida.motoristaId !== usuarioLogado.id) {
          throw new AppError('Voce nao tem permissao para acessar esta corrida.', 403);
        }
      } else if (usuarioLogado.perfil === 'USUARIO') {
        if (corrida.usuarioId !== usuarioLogado.id) {
          throw new AppError('Voce nao tem permissao para acessar esta corrida.', 403);
        }
      }
    }
    
    return corrida;
  }

  calcularValor(params) {
    return calcularValorCorrida(params);
  }

  _validarDadosCriacao(dados) {
    return validarDadosCriacaoCorrida(dados);
  }

  /**
   * Cria uma nova corrida.
   * Valida classe solicitada, disponibilidade de veículo da classe,
   * forma de pagamento e notifica motoristas elegíveis.
   * O proprietário é SEMPRE o usuário autenticado (usuarioLogado.id).
   */
  async criar(dados, usuarioLogado = null) {
    if (!usuarioLogado) {
      throw new AppError('Acesso negado. É necessário estar autenticado para criar uma corrida.', 401);
    }

    const usuarioId = usuarioLogado.id;
    const v = this._validarDadosCriacao(dados);

    // Verificar disponibilidade de veículo da classe solicitada
    const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
    const veiculosDaClasse = veiculosDisponiveis.filter((ve) => ve.classe === v.classe);

    if (veiculosDaClasse.length === 0) {
      throw new AppError(
        `Nao ha veiculos da classe ${v.classe} disponiveis. Selecione outra classe ou tente novamente mais tarde.`,
        409
      );
    }

    const dataHorarioEfetivo = v.dataHorario.toISOString();
    // Backend sempre recalcula o valor — nunca confia no valor enviado pelo frontend
    const valor = this.calcularValor({ distanciaKm: v.distanciaKm, classe: v.classe, dataHorario: dataHorarioEfetivo });

    if (!Number.isFinite(valor) || valor <= 0) {
      throw new AppError('Nao foi possivel calcular um valor valido para esta corrida.', 500);
    }

    const novaCorrida = await corridasRepository.create({
      usuarioId,
      origemNome:         v.origemNome,
      destinoNome:        v.destinoNome,
      origemLat:          v.origemLat,
      origemLng:          v.origemLng,
      destinoLat:         v.destinoLat,
      destinoLng:         v.destinoLng,
      origemEndereco:     v.origemEndereco,
      destinoEndereco:    v.destinoEndereco,
      rotaCaminho:        v.rotaCaminho,
      rotasAlternativas:  v.rotasAlternativas,
      polyline:           v.polyline,
      distanciaKm:        v.distanciaKm,
      duracaoMin:         v.duracaoMin,
      valor,
      classe:             v.classe,
      formaPagamento:     v.formaPagamento,
      dataHorario:        dataHorarioEfetivo,
      status:             STATUS_CORRIDA.SOLICITADA,
    });

    // Corrida já persistida: falha na notificação não a desfaz
    await this._notificarMotoristasElegiveis(novaCorrida);

    return novaCorrida;
  }

  /**
   * Executa uma notificação pós-commit sem propagar falhas.
   * @private
   */
  async _notificarSemFalhar(contexto, fn) {
    try {
      await fn();
      return true;
    } catch (e) {
      console.error(`[CorridasService] Falha ao enviar notificacao (${contexto}):`, e.message);
      return false;
    }
  }

  /**
   * Notifica todos os motoristas APROVADOS com veículo DISPONIVEL da classe solicitada.
   * @private
   */
  async _notificarMotoristasElegiveis(corrida) {
    let usuarioIds = [];
    try {
      const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
      const veiculosDaClasse = veiculosDisponiveis.filter((v) => v.classe === corrida.classe);

      usuarioIds = [...new Set(
        veiculosDaClasse
          .filter((v) => v.motoristaId)
          .map((v) => v.motoristaId)
      )];
    } catch (e) {
      console.error(`[CorridasService] Falha ao listar motoristas elegiveis (corrida ${corrida.id}):`, e.message);
      return;
    }

    const dataFormatada = new Date(corrida.dataHorario).toLocaleString('pt-BR', {
      timeZone: BUSINESS_TIMEZONE,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    for (const usuarioId of usuarioIds) {
      await this._notificarSemFalhar(`nova corrida ${corrida.id} -> motorista ${usuarioId}`, async () => {
        const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
        if (!motorista || motorista.statusCadastro !== 'APROVADO') return;

        await notificacoesService.notificarNovaCorrida(usuarioId, {
          corridaId:   corrida.id,
          classe:      corrida.classe,
          origemNome:  corrida.origemNome,
          destinoNome: corrida.destinoNome,
          dataFormatada,
          distanciaKm: corrida.distanciaKm,
        });
      });
    }
  }

  /**
   * Motorista aceita uma corrida de forma atômica.
   */
  async aceitar(corridaId, motoristaUsuarioId) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);

    if (corrida.status !== STATUS_CORRIDA.SOLICITADA) {
      throw new AppError(
        'Esta corrida ja foi assumida ou nao esta disponivel para aceite.',
        409
      );
    }

    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);
    if (motorista.statusCadastro !== 'APROVADO') {
      throw new AppError('Apenas motoristas aprovados podem aceitar corridas.', 403);
    }

    const veiculo = await veiculosRepository.findByMotoristaId(motorista.usuarioId);
    if (!veiculo) throw new AppError('Motorista sem veiculo cadastrado.', 409);
    if (veiculo.statusAprovacao !== 'APROVADO') {
      throw new AppError('O veiculo do motorista nao esta aprovado.', 409);
    }
    if (veiculo.status !== 'DISPONIVEL') {
      throw new AppError('O veiculo nao esta disponivel.', 409);
    }
    if (veiculo.classe !== corrida.classe) {
      throw new AppError(
        `A classe do seu veiculo (${veiculo.classe}) nao corresponde a classe solicitada (${corrida.classe}).`,
        409
      );
    }

    const resultado = await corridasRepository.aceitarComReservaDeVeiculo(
      corridaId,
      motorista.usuarioId,
      veiculo.id
    );

    if (!resultado || !resultado.ok) {
      switch (resultado && resultado.motivo) {
        case 'CORRIDA_INDISPONIVEL':
          throw new AppError('Esta corrida ja foi assumida por outro motorista.', 409);
        case 'VEICULO_COM_CORRIDA_ATIVA':
          throw new AppError('O veiculo ja esta alocado a outra corrida ativa.', 409);
        default:
          throw new AppError('O veiculo nao esta disponivel.', 409);
      }
    }
    const corridaAtualizada = resultado.corrida;

    await this._notificarSemFalhar(`aceite ${corridaId}: atualizar acao do motorista`, () =>
      notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'ACEITA'));

    await this._notificarSemFalhar(`aceite ${corridaId}: notificar passageiro`, () =>
      notificacoesService.notificarPassageiroAceite(corrida.usuarioId, {
        corridaId,
        origemNome:  corrida.origemNome,
        destinoNome: corrida.destinoNome,
      }));

    return corridaAtualizada;
  }

  /**
   * Motorista recusa uma corrida.
   */
  async recusar(corridaId, motoristaUsuarioId) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);

    if (corrida.status !== STATUS_CORRIDA.SOLICITADA) {
      throw new AppError('Esta corrida nao esta mais disponivel.', 409);
    }

    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);

    await notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'RECUSADA');

    return { message: 'Corrida recusada com sucesso.' };
  }

  /**
   * Cancela a corrida e libera o veículo (se houver) na mesma transação.
   */
  async cancelar(id, usuarioLogado = null) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

    if (corrida.status === STATUS_CORRIDA.CANCELADA) {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const corridaAtualizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(id, 'cancelar');
    if (!corridaAtualizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    return corridaAtualizada;
  }

  /**
   * Motorista confirma pagamento e finaliza a corrida.
   */
  async confirmarPagamentoEFinalizar(id, usuarioLogado = null) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

    if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.CANCELADA) {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.SOLICITADA) {
      throw new AppError('A corrida ainda nao foi aceita por um motorista.', 409);
    }

    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.perfil !== 'MOTORISTA') {
        throw new AppError('Apenas motoristas ou administradores podem confirmar pagamento e finalizar.', 403);
      }
    }

    const corridaFinalizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(id, 'finalizar');
    if (!corridaFinalizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    if (corrida.usuarioId) {
      await this._notificarSemFalhar(`finalizacao ${id}: notificar passageiro`, () =>
        notificacoesService.notificarPassageiroFinalizacao(corrida.usuarioId, {
          corridaId: id,
          origemNome:  corrida.origemNome,
          destinoNome: corrida.destinoNome,
        }));
    }

    return corridaFinalizada;
  }

  /**
   * @deprecated Use confirmarPagamentoEFinalizar para o fluxo correto.
   */
  async finalizar(id, usuarioLogado = null) {
    return this.confirmarPagamentoEFinalizar(id, usuarioLogado);
  }
}

module.exports = new CorridasService();
