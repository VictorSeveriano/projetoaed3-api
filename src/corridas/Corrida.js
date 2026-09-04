/**
 * Corrida — Modelo da entidade central do sistema ReservaCar.
 *
 * A Corrida representa uma solicitacao de transporte pelo usuario:
 *   - Origem: onde o usuario esta (ou quer partir)
 *   - Destino: onde o usuario quer chegar
 *   - Rota: o trajeto otimizado escolhido
 *   - Veiculo: o recurso alocado para atender a corrida
 *
 * Esta classe e preparada para futura migracao ao banco de dados.
 * Todos os campos seguem nomes e tipos adequados para mapeamento ORM.
 *
 * STATUS possiveis:
 *   PENDENTE    — corrida solicitada, aguardando veiculo
 *   CONFIRMADA  — veiculo alocado, corrida confirmada
 *   EM_ANDAMENTO — corrida em execucao
 *   FINALIZADA  — corrida concluida
 *   CANCELADA   — corrida cancelada pelo usuario ou sistema
 */
class Corrida {
  /**
   * @param {object} dados - Dados da corrida
   * @param {string} dados.id
   * @param {string} dados.usuarioId
   * @param {string} dados.veiculoId
   * @param {string} dados.origemNome    - Nome do local de origem (do grafo ou geocodificado)
   * @param {string} dados.destinoNome   - Nome do local de destino
   * @param {number} dados.origemLat     - Latitude da origem
   * @param {number} dados.origemLng     - Longitude da origem
   * @param {number} dados.destinoLat    - Latitude do destino
   * @param {number} dados.destinoLng    - Longitude do destino
   * @param {string[]} dados.rotaCaminho - Sequencia de locais da rota escolhida
   * @param {number} dados.distanciaKm
   * @param {number} dados.duracaoMin
   * @param {number} dados.valor         - Valor estimado da corrida em R$
   * @param {string} dados.dataHorario   - ISO 8601: quando a corrida esta agendada
   * @param {string} dados.status
   * @param {string} dados.criadaEm      - ISO 8601: quando a corrida foi criada
   */
  constructor(dados) {
    this.id = dados.id;
    this.usuarioId = dados.usuarioId;
    this.veiculoId = dados.veiculoId || null;

    // Origem e destino com informacoes completas
    this.origemNome = dados.origemNome;
    this.destinoNome = dados.destinoNome;
    this.origemLat = dados.origemLat || null;
    this.origemLng = dados.origemLng || null;
    this.destinoLat = dados.destinoLat || null;
    this.destinoLng = dados.destinoLng || null;

    // Rota selecionada pelo usuario
    this.rotaCaminho = dados.rotaCaminho || [];
    this.distanciaKm = dados.distanciaKm || 0;
    this.duracaoMin = dados.duracaoMin || 0;

    // Financeiro
    this.valor = dados.valor || 0;

    // Agendamento e rastreamento
    this.dataHorario = dados.dataHorario || new Date().toISOString();
    this.status = dados.status || 'CONFIRMADA';
    this.criadaEm = dados.criadaEm || new Date().toISOString();
  }

  /**
   * Retorna representacao resumida para exibicao.
   * @returns {object}
   */
  toResumo() {
    return {
      id: this.id,
      origemNome: this.origemNome,
      destinoNome: this.destinoNome,
      distanciaKm: this.distanciaKm,
      duracaoMin: this.duracaoMin,
      valor: this.valor,
      status: this.status,
      dataHorario: this.dataHorario,
    };
  }
}

module.exports = Corrida;
