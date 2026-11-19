'use strict';

/**
 * estrategiasNotificacao.js — Estratégias polimórficas de construção de notificações.
 *
 * Separa a definição de tipo, destinatário, conteúdo e metadados de ciclo de vida
 * da persistência e da camada de consulta de NotificacoesService.
 */
class EstrategiaNotificacao {
  constructor(tipo) {
    this.tipo = tipo;
  }

  /**
   * Monta o payload padronizado pronto para persistência no repositório.
   */
  construir(destinatarioId, dados) {
    const conteudo = this.montarConteudo(dados);
    const payload = {
      destinatarioId,
      tipo: this.tipo,
      titulo: conteudo.titulo,
      mensagem: conteudo.mensagem,
      referenciaId: conteudo.referenciaId,
    };
    if (conteudo.acaoMotorista !== undefined) {
      payload.acaoMotorista = conteudo.acaoMotorista;
    }
    return payload;
  }

  /** @protected */
  // eslint-disable-next-line no-unused-vars
  montarConteudo(dados) {
    throw new Error('Subclasse deve implementar montarConteudo(dados).');
  }
}

class EstrategiaSolicitacaoAdmin extends EstrategiaNotificacao {
  constructor(tipo, formatador) {
    super(tipo);
    this._formatador = formatador;
  }

  montarConteudo(dados) {
    return this._formatador(dados);
  }
}

class EstrategiaNovaCorrida extends EstrategiaNotificacao {
  constructor() {
    super('NOVA_CORRIDA');
  }

  montarConteudo({ corridaId, classe, origemNome, destinoNome, dataFormatada, distanciaKm }) {
    return {
      titulo: 'Nova corrida disponível',
      mensagem: `Classe: ${classe}\nOrigem: ${origemNome}\nDestino: ${destinoNome}\nData/Hora: ${dataFormatada}\nDistância: ${distanciaKm} km`,
      referenciaId: corridaId,
      acaoMotorista: 'PENDENTE',
    };
  }
}

class EstrategiaAtualizacaoCorrida extends EstrategiaNotificacao {
  constructor(formatador) {
    super('ATUALIZACAO_CORRIDA');
    this._formatador = formatador;
  }

  montarConteudo(dados) {
    const { titulo, mensagem } = this._formatador(dados);
    return {
      titulo,
      mensagem,
      referenciaId: dados.corridaId,
    };
  }
}

const ESTRATEGIAS_NOTIFICACAO = Object.freeze({
  SOLICITACAO_MOTORISTA: new EstrategiaSolicitacaoAdmin('SOLICITACAO_MOTORISTA', (dados) => ({
    titulo: 'Nova solicitação de motorista',
    mensagem: `${dados.nomeMotorista} solicitou cadastro como motorista.`,
    referenciaId: dados.motoristaId,
  })),
  SOLICITACAO_VEICULO: new EstrategiaSolicitacaoAdmin('SOLICITACAO_VEICULO', (dados) => ({
    titulo: 'Veículo pendente de aprovação',
    mensagem: `${dados.nomeMotorista} cadastrou ${dados.modeloVeiculo} — aguarda aprovação.`,
    referenciaId: dados.veiculoId,
  })),
  NOVA_CORRIDA: new EstrategiaNovaCorrida(),
  CORRIDA_ACEITA: new EstrategiaAtualizacaoCorrida(({ origemNome, destinoNome }) => ({
    titulo: 'Sua corrida foi aceita!',
    mensagem: `Um motorista aceitou sua corrida de ${origemNome} para ${destinoNome}. Aguarde o motorista chegar ao local de origem.`,
  })),
  CORRIDA_FINALIZADA: new EstrategiaAtualizacaoCorrida(({ origemNome, destinoNome }) => ({
    titulo: 'Corrida finalizada',
    mensagem: `Sua corrida de ${origemNome} para ${destinoNome} foi concluída e o pagamento confirmado.`,
  })),
  CORRIDA_EXPIRADA: new EstrategiaAtualizacaoCorrida(({ origemNome, destinoNome }) => ({
    titulo: 'Corrida cancelada automaticamente',
    mensagem: `Sua corrida de ${origemNome} para ${destinoNome} foi cancelada automaticamente pois nenhum motorista a aceitou até o horário agendado.`,
  })),
  ATUALIZACAO_CORRIDA: new EstrategiaAtualizacaoCorrida(({ titulo, mensagem }) => ({
    titulo,
    mensagem,
  })),
});

module.exports = {
  EstrategiaNotificacao,
  EstrategiaSolicitacaoAdmin,
  EstrategiaNovaCorrida,
  EstrategiaAtualizacaoCorrida,
  ESTRATEGIAS_NOTIFICACAO,
};
