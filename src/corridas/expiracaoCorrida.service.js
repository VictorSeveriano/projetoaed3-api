'use strict';

const corridasRepository = require('./corridas.repository');
const notificacoesService = require('../notificacoes/notificacoes.service');
const { despacharNotificacaoSemFalhar } = require('../notificacoes/despachoNotificacao');
const {
  TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN,
  ORIGEM_CANCELAMENTO,
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
} = require('../utils/constants');

/**
 * ExpiracaoCorridaService — Processamento de corridas expiradas sem aceite e
 * corridas confirmadas cujo prazo de confirmação de embarque expirou, além do
 * ciclo de vida do monitoramento periódico iniciado pelo servidor.
 */
class ExpiracaoCorridaService {
  constructor() {
    this._expiracaoTimer = null;
    this._monitoramentoAtivo = false;
    this._ultimaVerificacaoExpiracaoMs = 0;
    this._expiracaoEmAndamento = null;
  }

  /**
   * Cancela automaticamente corridas SOLICITADAS (sem motorista) vencidas e
   * corridas CONFIRMADAS sem confirmação de embarque no prazo.
   */
  async cancelarCorridasExpiradas(agora = new Date(), { forcar = false } = {}) {
    if (this._expiracaoEmAndamento) {
      return this._expiracaoEmAndamento;
    }

    if (!forcar && process.env.NODE_ENV !== 'test') {
      const ts = Date.now();
      if (ts - this._ultimaVerificacaoExpiracaoMs < 10000) {
        return [];
      }
      this._ultimaVerificacaoExpiracaoMs = ts;
    }

    const execucao = (async () => {
      let vencidas = [];
      if (typeof corridasRepository.cancelarSolicitadasVencidas === 'function') {
        try {
          vencidas = (await corridasRepository.cancelarSolicitadasVencidas(agora)) || [];
        } catch (e) {
          console.error('[ExpiracaoCorridaService] Falha ao cancelar corridas expiradas:', e.message);
        }

        for (const c of vencidas) {
          if (c.usuarioId && typeof notificacoesService.notificarPassageiroExpiracao === 'function') {
            await despacharNotificacaoSemFalhar(
              'ExpiracaoCorridaService',
              `expiracao ${c.id}: notificar passageiro`,
              () =>
                notificacoesService.notificarPassageiroExpiracao(c.usuarioId, {
                  corridaId:   c.id,
                  origemNome:  c.origemNome,
                  destinoNome: c.destinoNome,
                })
            );
          }
        }
      }

      await this._cancelarConfirmadasSemEmbarque(agora);

      return vencidas;
    })();

    this._expiracaoEmAndamento = execucao;
    try {
      return await execucao;
    } finally {
      if (this._expiracaoEmAndamento === execucao) {
        this._expiracaoEmAndamento = null;
      }
    }
  }

  /**
   * Cancela automaticamente corridas CONFIRMADAS cujo prazo de confirmação de embarque
   * expirou sem nenhuma confirmação (nem do motorista, nem do passageiro).
   * @private
   */
  async _cancelarConfirmadasSemEmbarque(agora) {
    if (typeof corridasRepository.findConfirmadasComPrazoVencido !== 'function') return [];
    const toleranciaMs = TOLERANCIA_CONFIRMACAO_EMBARQUE_MIN * 60 * 1000;
    let candidatas = [];
    try {
      candidatas = (await corridasRepository.findConfirmadasComPrazoVencido(agora, toleranciaMs)) || [];
    } catch (e) {
      console.error('[ExpiracaoCorridaService] Falha ao buscar corridas sem confirmacao de embarque:', e.message);
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
        console.error(`[ExpiracaoCorridaService] Falha ao cancelar corrida ${c.id} sem confirmacao:`, e.message);
        continue;
      }
      if (!corrida) continue;
      canceladas.push(corrida);

      const destinatarios = [c.usuarioId, c.motoristaId].filter(Boolean);
      for (const destinatarioId of destinatarios) {
        await despacharNotificacaoSemFalhar(
          'ExpiracaoCorridaService',
          `cancelamento automatico ${c.id}: notificar ${destinatarioId}`,
          () =>
            notificacoesService.notificarAtualizacaoCorrida(destinatarioId, {
              corridaId: c.id,
              titulo: 'Corrida cancelada automaticamente',
              mensagem: `A corrida de ${c.origemNome} para ${c.destinoNome} foi cancelada. Motivo: ${MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO}`,
            })
        );
      }
    }
    return canceladas;
  }

  iniciarMonitoramentoExpiracao(intervaloMs = 30 * 1000) {
    if (this._expiracaoTimer || process.env.NODE_ENV === 'test') return;
    const intervalo = Number.isFinite(intervaloMs) && intervaloMs > 0 ? intervaloMs : 30 * 1000;
    this._monitoramentoAtivo = true;
    this.cancelarCorridasExpiradas().catch(() => {});
    this._expiracaoTimer = setInterval(() => {
      if (!this._monitoramentoAtivo) return;
      this.cancelarCorridasExpiradas().catch(() => {});
    }, intervalo);
    if (typeof this._expiracaoTimer.unref === 'function') {
      this._expiracaoTimer.unref();
    }
  }

  pararMonitoramentoExpiracao() {
    this._monitoramentoAtivo = false;
    if (this._expiracaoTimer) {
      clearInterval(this._expiracaoTimer);
      this._expiracaoTimer = null;
    }
  }
}

module.exports = new ExpiracaoCorridaService();
