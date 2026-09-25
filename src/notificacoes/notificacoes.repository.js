const notificacoesData = require('../data/notificacoes.data');

/**
 * NotificacoesRepository — Acesso aos dados de notificações.
 * Sem WebSocket nesta etapa: notificações são consultadas por polling.
 * Para banco: substituir os métodos por queries ORM/SQL.
 */
class NotificacoesRepository {
  constructor() {
    this._notificacoes = [...notificacoesData];
    this._nextId = this._notificacoes.length + 1;
  }

  /**
   * Notificações de um destinatário, mais recentes primeiro.
   * @param {string} destinatarioId
   * @returns {object[]}
   */
  findByDestinatario(destinatarioId) {
    return this._notificacoes
      .filter((n) => n.destinatarioId === destinatarioId)
      .sort((a, b) => new Date(b.criadaEm) - new Date(a.criadaEm));
  }

  /**
   * Notificações não lidas de um destinatário.
   * @param {string} destinatarioId
   * @returns {object[]}
   */
  findNaoLidas(destinatarioId) {
    return this._notificacoes.filter(
      (n) => n.destinatarioId === destinatarioId && !n.lida
    );
  }

  /**
   * Cria nova notificação.
   * @param {object} dados
   * @returns {object}
   */
  create(dados) {
    const nova = {
      id: 'n' + String(this._nextId++),
      destinatarioId: dados.destinatarioId,
      tipo: dados.tipo,
      titulo: dados.titulo,
      mensagem: dados.mensagem,
      lida: false,
      criadaEm: new Date().toISOString(),
      referenciaId: dados.referenciaId || null,
    };
    this._notificacoes.push(nova);
    return nova;
  }

  /**
   * Marca uma notificação como lida.
   * @param {string} id
   * @returns {object|null}
   */
  marcarLida(id) {
    const n = this._notificacoes.find((n) => n.id === id);
    if (!n) return null;
    n.lida = true;
    return n;
  }

  /**
   * Marca todas as notificações de um destinatário como lidas.
   * @param {string} destinatarioId
   */
  marcarTodasLidas(destinatarioId) {
    this._notificacoes
      .filter((n) => n.destinatarioId === destinatarioId)
      .forEach((n) => { n.lida = true; });
  }
}

module.exports = new NotificacoesRepository();
