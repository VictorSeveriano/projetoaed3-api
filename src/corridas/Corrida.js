/**
 * Corrida — Entidade central do sistema de corridas.
 *
 * Representa uma solicitação de transporte pelo usuário:
 *   - Origem: ponto de partida (endereço livre, CEP ou GPS)
 *   - Destino: ponto de chegada
 *   - Rota: trajeto selecionado (geometria real da malha viária via Google Routes API)
 *   - Veículo: recurso alocado pelo backend para atender a corrida
 *
 * Estrutura preparada para futura migração ao banco de dados.
 * Todos os campos seguem nomes e tipos adequados para mapeamento ORM.
 *
 * STATUS possíveis:
 *   SOLICITADA   — corrida criada pelo usuário, aguardando início
 *   CONFIRMADA   — veículo alocado, corrida confirmada pelo sistema
 *   EM_ANDAMENTO — corrida em execução
 *   FINALIZADA   — corrida concluída com sucesso
 *   CANCELADA    — corrida cancelada pelo usuário ou sistema
 */
class Corrida {
  /**
   * @param {object}   dados
   * @param {string}   dados.id
   * @param {string}   dados.usuarioId
   * @param {string}   [dados.motoristaId]        - ID do usuário com perfil MOTORISTA responsável pela corrida
   * @param {string}   [dados.veiculoId]          - ID do veículo alocado (null se nenhum disponível)
   * @param {string}   dados.origemNome           - Nome/endereço de exibição da origem
   * @param {string}   dados.destinoNome          - Nome/endereço de exibição do destino
   * @param {number}   [dados.origemLat]          - Latitude da origem
   * @param {number}   [dados.origemLng]          - Longitude da origem
   * @param {number}   [dados.destinoLat]         - Latitude do destino
   * @param {number}   [dados.destinoLng]         - Longitude do destino
   * @param {object}   [dados.origemEndereco]     - Endereço estruturado da origem (ViaCEP)
   * @param {object}   [dados.destinoEndereco]    - Endereço estruturado do destino
   * @param {string[]} [dados.rotaCaminho]        - Sequência de nomes dos pontos da rota selecionada
   * @param {Array}    [dados.rotasAlternativas]  - Todas as rotas retornadas pela API (para histórico)
   * @param {string}   [dados.polyline]           - Encoded polyline da rota (geometria real da malha viária)
   * @param {number}   dados.distanciaKm          - Distância em km (dado real da Google Routes API)
   * @param {number}   [dados.duracaoMin]         - Duração estimada em minutos
   * @param {number}   dados.valor                - Valor da corrida em R$ (calculado pelo backend)
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

    // Coordenadas geográficas (necessárias para reconstrução futura sem re-geocodificar)
    this.origemLat = dados.origemLat || null;
    this.origemLng = dados.origemLng || null;
    this.destinoLat = dados.destinoLat || null;
    this.destinoLng = dados.destinoLng || null;

    // Endereços estruturados (retornados pelo ViaCEP + Nominatim)
    this.origemEndereco = dados.origemEndereco || null;
    this.destinoEndereco = dados.destinoEndereco || null;

    // Rota selecionada
    this.rotaCaminho = dados.rotaCaminho || [];
    // polyline: geometria real da rota (encodedPolyline da Google Routes API)
    // Preservada para reconstrução visual futura sem nova consulta à API externa
    this.polyline = dados.polyline || null;
    // Rotas alternativas retornadas pela API — mantidas para histórico/auditoria
    this.rotasAlternativas = dados.rotasAlternativas || [];

    // Métricas da rota (dados reais da Google Routes API)
    this.distanciaKm = dados.distanciaKm || 0;
    this.duracaoMin = dados.duracaoMin || null;

    // Financeiro — calculado pelo backend com base na distância e categoria do veículo
    this.valor = dados.valor || 0;

    // Temporal
    this.dataHorario = dados.dataHorario || new Date().toISOString();
    // SOLICITADA é o status inicial: o usuário solicitou a corrida, aguardando processamento
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
      status: this.status,
      dataHorario: this.dataHorario,
      criadaEm: this.criadaEm,
    };
  }
}

module.exports = Corrida;

