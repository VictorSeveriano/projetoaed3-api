'use strict';

const {
  STATUS_CORRIDA,
  STATUS_CORRIDA_ATIVOS,
  SITUACAO_MOTORISTA,
  TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN,
} = require('../utils/constants');

/**
 * Corrida — Entidade central do sistema de corridas.
 *
 * Concentra o modelo e as invariantes puras do domínio (estados, janelas de
 * confirmação, regras de transição por perfil e posse), sem depender de banco
 * de dados, HTTP ou serviços externos.
 *
 * STATUS possíveis:
 *   SOLICITADA   — corrida criada pelo usuário, aguardando motorista aceitar
 *   CONFIRMADA   — motorista aceitou, corrida confirmada
 *   EM_ANDAMENTO — corrida em execução
 *   FINALIZADA   — corrida concluída e pagamento confirmado pelo motorista
 *   CANCELADA    — corrida cancelada pelo usuário ou sistema
 */
class Corrida {
  /**
   * @param {object} dados
   */
  constructor(dados) {
    this.id = dados.id;
    this.usuarioId = dados.usuarioId;
    this.motoristaId = dados.motoristaId || null;
    this.veiculoId = dados.veiculoId || null;
    this.veiculo = dados.veiculo || null;

    // Origem e destino — nome para exibição
    this.origemNome = dados.origemNome;
    this.destinoNome = dados.destinoNome;

    // Coordenadas geográficas
    this.origemLat = dados.origemLat ?? null;
    this.origemLng = dados.origemLng ?? null;
    this.destinoLat = dados.destinoLat ?? null;
    this.destinoLng = dados.destinoLng ?? null;

    // Endereços estruturados (retornados pelo ViaCEP + Nominatim)
    this.origemEndereco = dados.origemEndereco || null;
    this.destinoEndereco = dados.destinoEndereco || null;

    // Rota selecionada
    this.rotaCaminho = dados.rotaCaminho || [];
    this.polyline = dados.polyline || null;
    this.rotasAlternativas = dados.rotasAlternativas || [];

    // Métricas da rota
    this.distanciaKm = dados.distanciaKm || 0;
    this.duracaoMin = dados.duracaoMin ?? null;

    // Financeiro
    this.valor = dados.valor || 0;

    // Classe de serviço solicitada pelo passageiro: BASICO, NORMAL ou PREMIUM
    this.classe = dados.classe || 'NORMAL';

    // Forma de pagamento (pagamento ocorre presencialmente — sem dados financeiros sensíveis)
    this.formaPagamento = dados.formaPagamento || 'DINHEIRO';

    // Temporal
    Object.defineProperty(this, '_temDataHorarioInformada', {
      value: Boolean(dados.dataHorario),
      enumerable: false,
    });
    this.dataHorario = dados.dataHorario || new Date().toISOString();
    this.status = dados.status || STATUS_CORRIDA.SOLICITADA;
    this.criadaEm = dados.criadaEm || new Date().toISOString();

    // Confirmação de embarque
    this.embarqueMotoristaConfirmado = dados.embarqueMotoristaConfirmado ?? null;
    this.embarqueMotoristaEm = dados.embarqueMotoristaEm ?? null;
    this.embarquePassageiroConfirmado = dados.embarquePassageiroConfirmado ?? null;
    this.embarquePassageiroEm = dados.embarquePassageiroEm ?? null;
    this.situacaoMotorista = dados.situacaoMotorista ?? null;
    this.motoristaACaminhoEm = dados.motoristaACaminhoEm ?? null;
    this.prazoConfirmacaoEm = dados.prazoConfirmacaoEm ?? null;

    // Cancelamento
    this.motivoCancelamento = dados.motivoCancelamento ?? null;
    this.canceladoPor = dados.canceladoPor ?? null;
    this.canceladaEm = dados.canceladaEm ?? null;
  }

  /** Garante uma instância de domínio `Corrida` a partir de um registro cru ou instância existente. */
  static garantirInstancia(dados) {
    if (!dados) return null;
    return dados instanceof Corrida ? dados : new Corrida(dados);
  }

  estaSolicitada() {
    return this.status === STATUS_CORRIDA.SOLICITADA;
  }

  estaConfirmada() {
    return this.status === STATUS_CORRIDA.CONFIRMADA;
  }

  estaEmAndamento() {
    return this.status === STATUS_CORRIDA.EM_ANDAMENTO;
  }

  estaFinalizada() {
    return this.status === STATUS_CORRIDA.FINALIZADA;
  }

  estaCancelada() {
    return this.status === STATUS_CORRIDA.CANCELADA;
  }

  estaAtiva() {
    return STATUS_CORRIDA_ATIVOS.includes(this.status);
  }

  embarqueMotoristaFoiConfirmado() {
    return this.embarqueMotoristaConfirmado === true;
  }

  embarquePassageiroFoiConfirmado() {
    return this.embarquePassageiroConfirmado === true;
  }

  motoristaEstaACaminho() {
    return this.estaConfirmada() && this.situacaoMotorista === SITUACAO_MOTORISTA.A_CAMINHO;
  }

  estaAguardandoConfirmacaoEmbarque() {
    return this.estaConfirmada() && !this.embarqueMotoristaFoiConfirmado();
  }

  pertenceAoPassageiro(usuarioId) {
    return Boolean(usuarioId && this.usuarioId === usuarioId);
  }

  pertenceAoMotorista(motoristaUsuarioId) {
    return Boolean(motoristaUsuarioId && this.motoristaId === motoristaUsuarioId);
  }

  podeSerAcessadaPor(usuarioLogado) {
    if (!usuarioLogado || usuarioLogado.perfil === 'ADMINISTRADOR') return true;
    if (usuarioLogado.perfil === 'MOTORISTA') return this.pertenceAoMotorista(usuarioLogado.id);
    if (usuarioLogado.perfil === 'USUARIO') return this.pertenceAoPassageiro(usuarioLogado.id);
    return true;
  }

  podeSerCanceladaPor(perfil) {
    if (this.estaCancelada() || this.estaFinalizada()) return false;
    if (perfil === 'MOTORISTA' || perfil === 'USUARIO') {
      return !this.estaEmAndamento() && !this.embarqueMotoristaFoiConfirmado();
    }
    return true;
  }

  podeSerFinalizada() {
    return this.estaConfirmada() || this.estaEmAndamento();
  }

  horarioAgendadoJaChegou(agora = new Date()) {
    const agendada = new Date(this.dataHorario);
    return !Number.isNaN(agendada.getTime()) && agendada <= agora;
  }

  estaDentroDaJanelaConfirmacao(agora = new Date()) {
    return (this.estaConfirmada() || this.estaEmAndamento()) && this.horarioAgendadoJaChegou(agora);
  }

  prazoConfirmacaoVigente(toleranciaMin = TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN) {
    if (this.prazoConfirmacaoEm) return new Date(this.prazoConfirmacaoEm);
    return new Date(new Date(this.dataHorario).getTime() + toleranciaMin * 60 * 1000);
  }

  estaExpiradaParaAceite(agora = new Date()) {
    if (!this.estaSolicitada() || !this._temDataHorarioInformada) return false;
    const dataAgendada = new Date(this.dataHorario);
    if (Number.isNaN(dataAgendada.getTime()) || dataAgendada > agora) return false;
    const dataCriacao = this.criadaEm ? new Date(this.criadaEm) : null;
    return !dataCriacao || Number.isNaN(dataCriacao.getTime()) || dataCriacao <= dataAgendada;
  }

  trajetoDescricao() {
    return `${this.origemNome} para ${this.destinoNome}`;
  }

  /**
   * Retorna representação resumida para exibição em listas.
   * @returns {object}
   */
  toResumo() {
    return {
      id: this.id,
      usuarioId: this.usuarioId,
      motoristaId: this.motoristaId,
      veiculoId: this.veiculoId,
      veiculo: this.veiculo,
      origemNome: this.origemNome,
      destinoNome: this.destinoNome,
      distanciaKm: this.distanciaKm,
      duracaoMin: this.duracaoMin,
      valor: this.valor,
      classe: this.classe,
      formaPagamento: this.formaPagamento,
      status: this.status,
      dataHorario: this.dataHorario,
      criadaEm: this.criadaEm,
      embarqueMotoristaConfirmado: this.embarqueMotoristaConfirmado,
      embarqueMotoristaEm: this.embarqueMotoristaEm,
      embarquePassageiroConfirmado: this.embarquePassageiroConfirmado,
      embarquePassageiroEm: this.embarquePassageiroEm,
      situacaoMotorista: this.situacaoMotorista,
      motoristaACaminhoEm: this.motoristaACaminhoEm,
      prazoConfirmacaoEm: this.prazoConfirmacaoEm,
      motivoCancelamento: this.motivoCancelamento,
      canceladoPor: this.canceladoPor,
      canceladaEm: this.canceladaEm,
    };
  }
}

module.exports = Corrida;
