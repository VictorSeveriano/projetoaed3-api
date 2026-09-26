/**
 * Corrida — Entidade central do sistema de corridas.
 *
 * Representa uma solicitação de transporte pelo usuário:
 *   - Origem: ponto de partida (endereço livre, CEP ou GPS)
 *   - Destino: ponto de chegada
 *   - Rota: trajeto selecionado (geometria real da malha viária via Google Routes API)
 *   - Veículo: recurso alocado pelo backend para atender a corrida
 *   - Classe: BASICO, NORMAL ou PREMIUM (selecionada pelo passageiro)
 *   - FormaPagamento: DINHEIRO, CARTAO_DEBITO, CARTAO_CREDITO ou PIX
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
   * @param {object}   dados
   * @param {string}   dados.id
   * @param {string}   dados.usuarioId
   * @param {string}   [dados.motoristaId]        - ID do motorista responsável
   * @param {string}   [dados.veiculoId]          - ID do veículo alocado
   * @param {string}   dados.origemNome           - Nome/endereço de exibição da origem
   * @param {string}   dados.destinoNome          - Nome/endereço de exibição do destino
   * @param {number}   [dados.origemLat]          - Latitude da origem
   * @param {number}   [dados.origemLng]          - Longitude da origem
   * @param {number}   [dados.destinoLat]         - Latitude do destino
   * @param {number}   [dados.destinoLng]         - Longitude do destino
   * @param {object}   [dados.origemEndereco]     - Endereço estruturado da origem
   * @param {object}   [dados.destinoEndereco]    - Endereço estruturado do destino
   * @param {string[]} [dados.rotaCaminho]        - Sequência de nomes dos pontos da rota
   * @param {Array}    [dados.rotasAlternativas]  - Todas as rotas retornadas pela API
   * @param {string}   [dados.polyline]           - Encoded polyline da rota
   * @param {number}   dados.distanciaKm          - Distância em km
   * @param {number}   [dados.duracaoMin]         - Duração estimada em minutos
   * @param {number}   dados.valor                - Valor da corrida em R$
   * @param {string}   [dados.classe]             - Classe desejada: BASICO, NORMAL ou PREMIUM
   * @param {string}   [dados.formaPagamento]     - Forma de pagamento: DINHEIRO, CARTAO_DEBITO, CARTAO_CREDITO, PIX
   * @param {string}   [dados.dataHorario]        - ISO 8601: quando a corrida está agendada
   * @param {string}   [dados.status]             - Ver STATUS possíveis acima
   * @param {string}   [dados.criadaEm]           - ISO 8601: quando a corrida foi criada
   */
  constructor(dados) {
    this.id = dados.id;
    this.usuarioId = dados.usuarioId;
    this.motoristaId = dados.motoristaId || null;
    this.veiculoId = dados.veiculoId || null;

    // Origem e destino — nome para exibição
    this.origemNome = dados.origemNome;
    this.destinoNome = dados.destinoNome;

    // Coordenadas geográficas
    this.origemLat = dados.origemLat || null;
    this.origemLng = dados.origemLng || null;
    this.destinoLat = dados.destinoLat || null;
    this.destinoLng = dados.destinoLng || null;

    // Endereços estruturados (retornados pelo ViaCEP + Nominatim)
    this.origemEndereco = dados.origemEndereco || null;
    this.destinoEndereco = dados.destinoEndereco || null;

    // Rota selecionada
    this.rotaCaminho = dados.rotaCaminho || [];
    this.polyline = dados.polyline || null;
    this.rotasAlternativas = dados.rotasAlternativas || [];

    // Métricas da rota
    this.distanciaKm = dados.distanciaKm || 0;
    this.duracaoMin = dados.duracaoMin || null;

    // Financeiro
    this.valor = dados.valor || 0;

    // Classe de serviço solicitada pelo passageiro: BASICO, NORMAL ou PREMIUM
    this.classe = dados.classe || 'NORMAL';

    // Forma de pagamento (pagamento ocorre presencialmente — sem dados financeiros sensíveis)
    this.formaPagamento = dados.formaPagamento || 'DINHEIRO';

    // Temporal
    this.dataHorario = dados.dataHorario || new Date().toISOString();
    this.status = dados.status || 'SOLICITADA';
    this.criadaEm = dados.criadaEm || new Date().toISOString();
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
    };
  }
}

module.exports = Corrida;
