'use strict';
/**
 * corridas.service.js — Coordenação do núcleo central de corridas:
 *   - Listagem e consulta com autorização
 *   - Cálculo tarifário e validação de criação
 *   - Solicitação com verificação de disponibilidade por classe
 *   - Aceite e recusa pelo motorista
 */

const corridasRepository = require('./corridas.repository');
const veiculosRepository = require('../veiculos/veiculos.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const notificacoesService = require('../notificacoes/notificacoes.service');
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const expiracaoCorridaService = require('./expiracaoCorrida.service');
const Corrida = require('./Corrida');
const { buscarCorridaAutorizada } = require('./corridas.acesso');
const AppError = require('../utils/AppError');
const { readCache } = require('../utils/readCache');
const { STATUS_CORRIDA, BUSINESS_TIMEZONE } = require('../utils/constants');
const {
  TARIFAS_KM,
  determinarFaixaHorario,
  calcularValorCorrida,
  validarDadosCriacaoCorrida,
} = require('./corridas.validador');

const CACHE_TTL_CORRIDAS_MS = 15000;

function invalidarCachesPosMutacaoCorrida() {
  readCache.invalidarPrefixo('corridas:');
  readCache.invalidarPrefixo('dashboard:');
  readCache.invalidarPrefixo('veiculos:');
  readCache.invalidarPrefixo('motoristas:');
  readCache.invalidarPrefixo('notificacoes:');
}

class CorridasService {
  static get TARIFAS_KM() {
    return TARIFAS_KM;
  }

  static _determinarFaixaHorario(dataHorario) {
    return determinarFaixaHorario(dataHorario);
  }

  async listarTodas() {
    if (typeof expiracaoCorridaService.dispararVerificacaoEmBackground === 'function') {
      await expiracaoCorridaService.dispararVerificacaoEmBackground();
    } else {
      await expiracaoCorridaService.cancelarCorridasExpiradas();
    }
    return readCache.obterOuCarregar(
      'corridas:todas',
      CACHE_TTL_CORRIDAS_MS,
      () => corridasRepository.findAll()
    );
  }

  async listarPorPerfil(usuarioId, perfil, status) {
    if (typeof expiracaoCorridaService.dispararVerificacaoEmBackground === 'function') {
      await expiracaoCorridaService.dispararVerificacaoEmBackground();
    } else {
      await expiracaoCorridaService.cancelarCorridasExpiradas();
    }

    const chave = `corridas:perfil:${perfil}:${usuarioId}:${status || 'ALL'}`;
    return readCache.obterOuCarregar(chave, CACHE_TTL_CORRIDAS_MS, async () => {
      if (perfil === 'ADMINISTRADOR') {
        const todas = await corridasRepository.findAll(status || null);
        return status ? todas.filter((c) => c.status === status) : todas;
      }
      if (perfil === 'MOTORISTA') {
        const [motorista, corridas] = await Promise.all([
          motoristasRepository.findByUsuarioId(usuarioId),
          status
            ? corridasRepository.findByMotoristaIdAndStatus(usuarioId, status)
            : corridasRepository.findByMotoristaId(usuarioId),
        ]);
        if (!motorista) return [];
        return corridas;
      }
      return status
        ? corridasRepository.findByUsuarioIdAndStatus(usuarioId, status)
        : corridasRepository.findByUsuarioId(usuarioId);
    });
  }

  async buscarPorId(id, usuarioLogado = null) {
    const { registro } = await buscarCorridaAutorizada(id, usuarioLogado);
    return registro;
  }

  calcularValor(params) {
    return calcularValorCorrida(params);
  }

  /**
   * Cria uma nova corrida validando classe, disponibilidade de veículo e valor.
   */
  async criar(dados, usuarioLogado = null) {
    if (!usuarioLogado) {
      throw new AppError('Acesso negado. É necessário estar autenticado para criar uma corrida.', 401);
    }

    const usuarioId = usuarioLogado.id;
    const v = validarDadosCriacaoCorrida(dados);

    const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
    const veiculosDaClasse = veiculosDisponiveis.filter((ve) => ve.classe === v.classe);

    if (veiculosDaClasse.length === 0) {
      throw new AppError(
        `Nao ha veiculos da classe ${v.classe} disponiveis. Selecione outra classe ou tente novamente mais tarde.`,
        409
      );
    }

    const dataHorarioEfetivo = v.dataHorario.toISOString();
    const valor = this.calcularValor({
      distanciaKm: v.distanciaKm,
      classe: v.classe,
      dataHorario: dataHorarioEfetivo,
    });

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

    await this._notificarMotoristasElegiveis(novaCorrida, veiculosDaClasse);
    invalidarCachesPosMutacaoCorrida();

    return novaCorrida;
  }

  /** @private */
  async _notificarMotoristasElegiveis(corrida, veiculosDaClassePreCarregados = null) {
    let usuarioIds = [];
    try {
      const veiculosDaClasse = Array.isArray(veiculosDaClassePreCarregados)
        ? veiculosDaClassePreCarregados
        : (await veiculosRepository.findDisponiveis()).filter((v) => v.classe === corrida.classe);

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

    await Promise.all(
      usuarioIds.map((usuarioId) =>
        despacharNotificacaoSemFalhar(
          'CorridasService',
          `nova corrida ${corrida.id} -> motorista ${usuarioId}`,
          async () => {
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
          }
        )
      )
    );
  }

  /**
   * Motorista aceita uma corrida de forma atômica.
   */
  async aceitar(corridaId, motoristaUsuarioId) {
    const registro = await corridasRepository.findById(corridaId);
    if (!registro) throw new AppError('Corrida nao encontrada.', 404);

    const corrida = Corrida.garantirInstancia(registro);
    if (!corrida.estaSolicitada()) {
      throw new AppError(
        'Esta corrida ja foi assumida ou nao esta disponivel para aceite.',
        409
      );
    }

    const agora = new Date();
    if (corrida.estaExpiradaParaAceite(agora)) {
      await expiracaoCorridaService.cancelarCorridasExpiradas(agora, { forcar: true });
      throw new AppError(
        'Esta corrida expirou e foi cancelada automaticamente pois passou do horario agendado.',
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

    await Promise.all([
      despacharNotificacaoSemFalhar(
        'CorridasService',
        `aceite ${corridaId}: atualizar acao do motorista`,
        () => notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'ACEITA')
      ),
      despacharNotificacaoSemFalhar(
        'CorridasService',
        `aceite ${corridaId}: notificar passageiro`,
        () =>
          notificacoesService.notificarPassageiroAceite(corrida.usuarioId, {
            corridaId,
            origemNome:  corrida.origemNome,
            destinoNome: corrida.destinoNome,
          })
      ),
    ]);

    invalidarCachesPosMutacaoCorrida();
    return corridaAtualizada;
  }

  /**
   * Motorista recusa uma corrida.
   */
  async recusar(corridaId, motoristaUsuarioId) {
    const registro = await corridasRepository.findById(corridaId);
    if (!registro) throw new AppError('Corrida nao encontrada.', 404);

    const corrida = Corrida.garantirInstancia(registro);
    if (!corrida.estaSolicitada()) {
      throw new AppError('Esta corrida nao esta mais disponivel.', 409);
    }

    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);

    await notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'RECUSADA');
    readCache.invalidarPrefixo('notificacoes:');

    return { message: 'Corrida recusada com sucesso.' };
  }
}

module.exports = new CorridasService();
