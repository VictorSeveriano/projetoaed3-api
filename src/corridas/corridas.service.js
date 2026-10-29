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
  TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN,
  EXTENSAO_A_CAMINHO_MIN,
  LIMITES_MOTIVO_CANCELAMENTO,
  ORIGEM_CANCELAMENTO,
  SITUACAO_MOTORISTA,
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
} = require('../utils/constants');
const {
  TARIFAS_KM,
  determinarFaixaHorario,
  calcularValorCorrida,
  validarDadosCriacaoCorrida,
} = require('./corridas.validador');

class CorridasService {
  constructor() {
    this._expiracaoTimer = null;
    this._ultimaVerificacaoExpiracaoMs = 0;
  }

  static get TARIFAS_KM() {
    return TARIFAS_KM;
  }

  static _determinarFaixaHorario(dataHorario) {
    return determinarFaixaHorario(dataHorario);
  }

  /**
   * Cancela automaticamente corridas SOLICITADAS (sem motorista) cujo dataHorario já chegou/passou.
   * Notifica o passageiro de cada corrida expirada sem propagar falhas de notificação.
   */
  async cancelarCorridasExpiradas(agora = new Date(), { forcar = false } = {}) {
    if (typeof corridasRepository.cancelarSolicitadasVencidas !== 'function') {
      return [];
    }

    if (!forcar && process.env.NODE_ENV !== 'test') {
      const ts = Date.now();
      if (ts - this._ultimaVerificacaoExpiracaoMs < 10000) {
        return [];
      }
      this._ultimaVerificacaoExpiracaoMs = ts;
    }

    let vencidas = [];
    try {
      vencidas = (await corridasRepository.cancelarSolicitadasVencidas(agora)) || [];
    } catch (e) {
      console.error('[CorridasService] Falha ao cancelar corridas expiradas:', e.message);
      return [];
    }

    for (const c of vencidas) {
      if (c.usuarioId && typeof notificacoesService.notificarPassageiroExpiracao === 'function') {
        await this._notificarSemFalhar(`expiracao ${c.id}: notificar passageiro`, () =>
          notificacoesService.notificarPassageiroExpiracao(c.usuarioId, {
            corridaId:   c.id,
            origemNome:  c.origemNome,
            destinoNome: c.destinoNome,
          })
        );
      }
    }

    await this._cancelarConfirmadasSemEmbarque(agora);

    return vencidas;
  }

  /**
   * Cancela automaticamente corridas CONFIRMADAS cujo prazo de confirmação de embarque expirou
   * sem nenhuma confirmação (nem do motorista, nem do passageiro). Idempotente e atômico por corrida:
   * o prazo e o estado são reavaliados dentro da transação, então uma corrida em que o motorista
   * acabou de informar "a caminho" (prazo estendido) ou confirmou embarque não é cancelada.
   */
  async _cancelarConfirmadasSemEmbarque(agora) {
    if (typeof corridasRepository.findConfirmadasComPrazoVencido !== 'function') return [];
    const toleranciaMs = TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN * 60 * 1000;
    let candidatas = [];
    try {
      candidatas = (await corridasRepository.findConfirmadasComPrazoVencido(agora, toleranciaMs)) || [];
    } catch (e) {
      console.error('[CorridasService] Falha ao buscar corridas sem confirmacao de embarque:', e.message);
      return [];
    }

    const canceladas = [];
    for (const c of candidatas) {
      let corrida = null;
      try {
        corrida = await corridasRepository.cancelarConfirmadaComMotivo(c.id, {
          canceladoPor: ORIGEM_CANCELAMENTO.SISTEMA,
          motivo: MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
          apenasSePrazoVencidoAte: agora,
          toleranciaMs,
        }, agora);
      } catch (e) {
        console.error(`[CorridasService] Falha ao cancelar corrida ${c.id} sem confirmacao:`, e.message);
        continue;
      }
      if (!corrida) continue; // já tratada por outra execução/ação concorrente
      canceladas.push(corrida);

      const destinatarios = [c.usuarioId, c.motoristaId].filter(Boolean);
      for (const destinatarioId of destinatarios) {
        await this._notificarSemFalhar(`cancelamento automatico ${c.id}: notificar ${destinatarioId}`, () =>
          notificacoesService.notificarAtualizacaoCorrida(destinatarioId, {
            corridaId: c.id,
            titulo: 'Corrida cancelada automaticamente',
            mensagem: `A corrida de ${c.origemNome} para ${c.destinoNome} foi cancelada. Motivo: ${MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO}`,
          }));
      }
    }
    return canceladas;
  }

  // ---------- Confirmação de embarque ----------

  /** Valida e normaliza o motivo de cancelamento (trim, mínimo e máximo). */
  _validarMotivo(motivo) {
    const limpo = typeof motivo === 'string' ? motivo.trim() : '';
    if (!limpo) throw new AppError('Informe o motivo do cancelamento.', 400);
    if (limpo.length < LIMITES_MOTIVO_CANCELAMENTO.MIN) {
      throw new AppError(`O motivo deve ter ao menos ${LIMITES_MOTIVO_CANCELAMENTO.MIN} caracteres.`, 400);
    }
    if (limpo.length > LIMITES_MOTIVO_CANCELAMENTO.MAX) {
      throw new AppError(`O motivo deve ter no máximo ${LIMITES_MOTIVO_CANCELAMENTO.MAX} caracteres.`, 400);
    }
    return limpo;
  }

  /** Garante que a corrida está aceita/ativa e que o horário agendado já chegou. */
  _validarJanelaDeEmbarque(corrida, agora) {
    if (corrida.status === STATUS_CORRIDA.CANCELADA) {
      throw new AppError('Esta corrida foi cancelada e não pode mais ser confirmada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
      throw new AppError('Esta corrida já foi concluída.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.SOLICITADA) {
      throw new AppError('Esta corrida ainda não foi aceita por um motorista.', 409);
    }
    const agendada = new Date(corrida.dataHorario);
    if (Number.isNaN(agendada.getTime()) || agendada > agora) {
      throw new AppError('A confirmação de embarque só é possível a partir do horário agendado.', 400);
    }
  }

  _prazoVigente(corrida) {
    if (corrida.prazoConfirmacaoEm) return new Date(corrida.prazoConfirmacaoEm);
    return new Date(new Date(corrida.dataHorario).getTime() + TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN * 60 * 1000);
  }

  /**
   * Decisões do motorista vinculado: CONFIRMAR_EMBARQUE | ESTOU_A_CAMINHO | NAO_VOU_EMBARCAR (+ motivo).
   * Idempotente: repetir a mesma decisão devolve o estado atual sem duplicar notificações.
   */
  async registrarEmbarqueMotorista(corridaId, usuarioLogado, { acao, motivo } = {}) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);
    if (!usuarioLogado || corrida.motoristaId !== usuarioLogado.id) {
      throw new AppError('Apenas o motorista vinculado a esta corrida pode registrar esta decisão.', 403);
    }

    const agora = new Date();
    const origem = `${corrida.origemNome} para ${corrida.destinoNome}`;
    const conflito = () => new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    const notificarPassageiro = (titulo, mensagem, ctx) =>
      this._notificarSemFalhar(`embarque ${corridaId}: ${ctx}`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.usuarioId, { corridaId, titulo, mensagem }));

    switch (acao) {
      case 'CONFIRMAR_EMBARQUE': {
        if (corrida.embarqueMotoristaConfirmado === true) return corrida; // idempotente
        this._validarJanelaDeEmbarque(corrida, agora);
        const atualizada = await corridasRepository.confirmarEmbarqueMotorista(corridaId, usuarioLogado.id, agora);
        if (!atualizada) throw conflito();
        await notificarPassageiro('Embarque confirmado',
          `O motorista confirmou o seu embarque na corrida de ${origem}. Boa viagem!`, 'confirmacao');
        return atualizada;
      }

      case 'ESTOU_A_CAMINHO': {
        if (corrida.situacaoMotorista === SITUACAO_MOTORISTA.A_CAMINHO) return corrida; // idempotente
        this._validarJanelaDeEmbarque(corrida, agora);
        if (corrida.status !== STATUS_CORRIDA.CONFIRMADA) {
          throw new AppError('Esta corrida não está aguardando confirmação de embarque.', 409);
        }
        // Extensão única e limitada: máx(prazo vigente, agora) + EXTENSAO_A_CAMINHO_MIN
        const base = Math.max(this._prazoVigente(corrida).getTime(), agora.getTime());
        const novoPrazo = new Date(base + EXTENSAO_A_CAMINHO_MIN * 60 * 1000);
        const atualizada = await corridasRepository.registrarMotoristaACaminho(corridaId, usuarioLogado.id, novoPrazo, agora);
        if (!atualizada) {
          const atual = await corridasRepository.findById(corridaId);
          if (atual && atual.situacaoMotorista === SITUACAO_MOTORISTA.A_CAMINHO) return atual;
          throw conflito();
        }
        await notificarPassageiro('Motorista a caminho',
          `O motorista informou que está a caminho para realizar sua corrida (${origem}). Acompanhe as atualizações na área Minhas corridas.`, 'a caminho');
        return atualizada;
      }

      case 'NAO_VOU_EMBARCAR': {
        const motivoLimpo = this._validarMotivo(motivo);
        if (corrida.status === STATUS_CORRIDA.CANCELADA && corrida.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA) {
          return corrida; // idempotente: já cancelada por esta mesma ação
        }
        this._validarJanelaDeEmbarque(corrida, agora);
        if (corrida.status !== STATUS_CORRIDA.CONFIRMADA || corrida.embarqueMotoristaConfirmado === true) {
          throw new AppError('Não é possível cancelar uma corrida cujo embarque já foi confirmado.', 409);
        }
        const cancelada = await corridasRepository.cancelarConfirmadaComMotivo(corridaId, {
          canceladoPor: ORIGEM_CANCELAMENTO.MOTORISTA,
          motivo: motivoLimpo,
          motoristaUsuarioId: usuarioLogado.id,
          situacaoMotorista: SITUACAO_MOTORISTA.NAO_EMBARCAR,
        }, agora);
        if (!cancelada) {
          const atual = await corridasRepository.findById(corridaId);
          if (atual && atual.status === STATUS_CORRIDA.CANCELADA && atual.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA) return atual;
          throw conflito();
        }
        await notificarPassageiro('Corrida cancelada pelo motorista',
          `O motorista cancelou a corrida de ${origem}. Motivo: ${motivoLimpo}`, 'cancelamento');
        return cancelada;
      }

      default:
        throw new AppError('Ação inválida. Use CONFIRMAR_EMBARQUE, ESTOU_A_CAMINHO ou NAO_VOU_EMBARCAR.', 400);
    }
  }

  /**
   * Resposta do passageiro vinculado: CONFIRMAR_EMBARQUE | NAO_EMBARQUEI.
   * Registra apenas a coluna do passageiro (nunca altera a do motorista).
   * NAO_EMBARQUEI com cancelarViagem=true cancela a corrida (canceladoPor = PASSAGEIRO).
   */
  async registrarEmbarquePassageiro(corridaId, usuarioLogado, { acao, cancelarViagem = false, motivo } = {}) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);
    if (!usuarioLogado || corrida.usuarioId !== usuarioLogado.id) {
      throw new AppError('Apenas o passageiro desta corrida pode registrar esta confirmação.', 403);
    }

    const agora = new Date();
    const origem = `${corrida.origemNome} para ${corrida.destinoNome}`;
    const conflito = () => new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    const notificarMotorista = (titulo, mensagem, ctx) => {
      if (!corrida.motoristaId) return Promise.resolve();
      return this._notificarSemFalhar(`embarque ${corridaId}: ${ctx}`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.motoristaId, { corridaId, titulo, mensagem }));
    };

    if (acao === 'CONFIRMAR_EMBARQUE') {
      if (corrida.embarquePassageiroConfirmado === true) return corrida; // idempotente
      this._validarJanelaDeEmbarque(corrida, agora);
      const atualizada = await corridasRepository.registrarEmbarquePassageiro(corridaId, usuarioLogado.id, true, agora);
      if (!atualizada) throw conflito();
      await notificarMotorista('Embarque confirmado pelo passageiro',
        `O passageiro confirmou que embarcou na corrida de ${origem}.`, 'confirmacao passageiro');
      return atualizada;
    }

    if (acao === 'NAO_EMBARQUEI') {
      if (cancelarViagem === true) {
        const motivoLimpo = this._validarMotivo(motivo);
        if (corrida.status === STATUS_CORRIDA.CANCELADA && corrida.canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO) {
          return corrida; // idempotente
        }
        this._validarJanelaDeEmbarque(corrida, agora);
        if (corrida.status !== STATUS_CORRIDA.CONFIRMADA || corrida.embarqueMotoristaConfirmado === true) {
          throw new AppError('Não é possível cancelar por este fluxo: o embarque já foi confirmado.', 409);
        }
        const cancelada = await corridasRepository.cancelarConfirmadaComMotivo(corridaId, {
          canceladoPor: ORIGEM_CANCELAMENTO.PASSAGEIRO,
          motivo: motivoLimpo,
          passageiroId: usuarioLogado.id,
        }, agora);
        if (!cancelada) {
          const atual = await corridasRepository.findById(corridaId);
          if (atual && atual.status === STATUS_CORRIDA.CANCELADA && atual.canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO) return atual;
          throw conflito();
        }
        await notificarMotorista('Corrida cancelada pelo passageiro',
          `O passageiro cancelou a corrida de ${origem}. Motivo: ${motivoLimpo}`, 'cancelamento passageiro');
        return cancelada;
      }

      if (corrida.embarquePassageiroConfirmado === false) return corrida; // idempotente
      this._validarJanelaDeEmbarque(corrida, agora);
      const atualizada = await corridasRepository.registrarEmbarquePassageiro(corridaId, usuarioLogado.id, false, agora);
      if (!atualizada) throw conflito();
      await notificarMotorista('Passageiro ainda não embarcou',
        `O passageiro informou que ainda não embarcou na corrida de ${origem}.`, 'nao embarcou passageiro');
      return atualizada;
    }

    throw new AppError('Ação inválida. Use CONFIRMAR_EMBARQUE ou NAO_EMBARQUEI.', 400);
  }

  iniciarMonitoramentoExpiracao(intervaloMs = 30 * 1000) {
    if (this._expiracaoTimer || process.env.NODE_ENV === 'test') return;
    this.cancelarCorridasExpiradas().catch(() => {});
    this._expiracaoTimer = setInterval(() => {
      this.cancelarCorridasExpiradas().catch(() => {});
    }, intervaloMs);
    if (typeof this._expiracaoTimer.unref === 'function') {
      this._expiracaoTimer.unref();
    }
  }

  pararMonitoramentoExpiracao() {
    if (this._expiracaoTimer) {
      clearInterval(this._expiracaoTimer);
      this._expiracaoTimer = null;
    }
  }

  async listarTodas() {
    await this.cancelarCorridasExpiradas();
    return corridasRepository.findAll();
  }

  async listarPorPerfil(usuarioId, perfil, status) {
    await this.cancelarCorridasExpiradas();
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

    await Promise.all(
      usuarioIds.map((usuarioId) =>
        this._notificarSemFalhar(`nova corrida ${corrida.id} -> motorista ${usuarioId}`, async () => {
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
        })
      )
    );
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

    const agora = new Date();
    const dataAgendada = corrida.dataHorario ? new Date(corrida.dataHorario) : null;
    const dataCriacao = corrida.criadaEm ? new Date(corrida.criadaEm) : null;
    if (
      dataAgendada &&
      !Number.isNaN(dataAgendada.getTime()) &&
      dataAgendada <= agora &&
      (!dataCriacao || dataCriacao <= dataAgendada)
    ) {
      await this.cancelarCorridasExpiradas(agora, { forcar: true });
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
   * - Motorista: exige motivo obrigatório, apenas corridas CONFIRMADA vinculadas a ele, e notifica o passageiro.
   * - Passageiro: apenas corridas próprias (SOLICITADA ou CONFIRMADA), aceita motivo e notifica o motorista se vinculado.
   */
  async cancelar(id, usuarioLogado = null, dados = {}) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

    if (corrida.status === STATUS_CORRIDA.CANCELADA) {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const perfil = usuarioLogado?.perfil;
    if (perfil === 'MOTORISTA' || perfil === 'USUARIO') {
      if (corrida.status === STATUS_CORRIDA.EM_ANDAMENTO || corrida.embarqueMotoristaConfirmado === true) {
        throw new AppError('Nao e possivel cancelar uma corrida cujo embarque ja foi confirmado e esta em andamento.', 409);
      }
    }

    let motivoLimpo = null;
    if (perfil === 'MOTORISTA') {
      motivoLimpo = this._validarMotivo(dados?.motivo);
    } else if (dados && dados.motivo !== undefined && dados.motivo !== null && String(dados.motivo) !== '') {
      motivoLimpo = this._validarMotivo(dados.motivo);
    }

    const canceladoPor = perfil === 'MOTORISTA'
      ? ORIGEM_CANCELAMENTO.MOTORISTA
      : perfil === 'USUARIO'
        ? ORIGEM_CANCELAMENTO.PASSAGEIRO
        : ORIGEM_CANCELAMENTO.SISTEMA;

    const agora = new Date();
    const metadados = {
      canceladoPor,
      canceladaEm: agora,
      ...(motivoLimpo ? { motivoCancelamento: motivoLimpo } : {}),
      ...(perfil === 'MOTORISTA' ? { situacaoMotorista: SITUACAO_MOTORISTA.NAO_EMBARCAR, embarqueMotoristaConfirmado: false, embarqueMotoristaEm: agora } : {}),
    };

    const corridaAtualizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(id, 'cancelar', metadados);
    if (!corridaAtualizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    const trajeto = `${corrida.origemNome} para ${corrida.destinoNome}`;

    if (canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA && corrida.usuarioId) {
      await this._notificarSemFalhar(`cancelamento motorista ${id}: notificar passageiro`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.usuarioId, {
          corridaId: id,
          titulo: 'Corrida cancelada pelo motorista',
          mensagem: `O motorista cancelou a corrida de ${trajeto}. Motivo: ${motivoLimpo}`,
        })
      );
    } else if (canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO && corrida.motoristaId) {
      await this._notificarSemFalhar(`cancelamento passageiro ${id}: notificar motorista`, () =>
        notificacoesService.notificarAtualizacaoCorrida(corrida.motoristaId, {
          corridaId: id,
          titulo: 'Corrida cancelada pelo passageiro',
          mensagem: `O passageiro cancelou a corrida de ${trajeto}.${motivoLimpo ? ` Motivo: ${motivoLimpo}.` : ''} Consulte os detalhes e a situação atual na área Minhas corridas.`,
        })
      );
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
