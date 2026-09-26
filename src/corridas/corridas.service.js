'use strict';
/**
 * corridas.service.js — Regras de negócios de corridas.
 *
 * Responsabilidades:
 *   - Validação de classe e formaPagamento
 *   - Verificação de disponibilidade de veículos por classe
 *   - Criação de corridas com notificação aos motoristas elegíveis
 *   - Aceite e recusa de corrida pelo motorista (com prevenção de duplo aceite)
 *   - Confirmação de pagamento e finalização
 *   - Cancelamento
 */

const corridasRepository   = require('./corridas.repository');
const veiculosRepository   = require('../veiculos/veiculos.repository');
const motoristasRepository = require('../motoristas/motoristas.repository');
const notificacoesService  = require('../notificacoes/notificacoes.service');
const AppError             = require('../utils/AppError');

const CLASSES_VALIDAS         = ['BASICO', 'NORMAL', 'PREMIUM'];
const FORMAS_PAGAMENTO_VALIDAS = ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX'];

class CorridasService {
  /**
   * Tarifa base por km por classe de veículo (R$/km).
   * Valores zerados nesta etapa (tarifação futura).
   */
  static get TARIFAS_KM() {
    return {
      BASICO:  0.00,
      NORMAL:  0.00,
      PREMIUM: 0.00,
      default: 0.00,
    };
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
      // Busca pelo id do motorista (vinculado ao usuarioId)
      const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
      if (!motorista) return [];
      return status
        ? corridasRepository.findByMotoristaIdAndStatus(motorista.id, status)
        : corridasRepository.findByMotoristaId(motorista.id);
    }
    // USUARIO (passageiro)
    return status
      ? corridasRepository.findByUsuarioIdAndStatus(usuarioId, status)
      : corridasRepository.findByUsuarioId(usuarioId);
  }

  async buscarPorId(id) {
    const corrida = await corridasRepository.findById(id);
    if (!corrida) throw new AppError('Corrida ' + id + ' nao encontrada.', 404);
    return corrida;
  }

  /**
   * Calcula o valor estimado da corrida.
   */
  calcularValor({ distanciaKm, classe }) {
    const tarifa = CorridasService.TARIFAS_KM[classe] || CorridasService.TARIFAS_KM.default;
    return parseFloat((distanciaKm * tarifa).toFixed(2));
  }

  /**
   * Cria uma nova corrida.
   * Valida classe solicitada, disponibilidade de veículo da classe,
   * forma de pagamento e notifica motoristas elegíveis.
   */
  async criar(dados) {
    const {
      usuarioId,
      origemNome, destinoNome,
      origemLat, origemLng, destinoLat, destinoLng,
      origemEndereco, destinoEndereco,
      rotaCaminho, rotasAlternativas,
      polyline, distanciaKm, duracaoMin, dataHorario,
      classe, formaPagamento,
    } = dados;

    if (!usuarioId || !origemNome || !destinoNome) {
      throw new AppError('usuarioId, origemNome e destinoNome sao obrigatorios.', 400);
    }
    if (!distanciaKm || distanciaKm <= 0) {
      throw new AppError('Distancia invalida para a corrida.', 400);
    }
    if (duracaoMin != null && duracaoMin <= 0) {
      throw new AppError('Duracao invalida para a corrida.', 400);
    }

    // Validação da classe
    const classeNorm = (classe || 'NORMAL').toUpperCase();
    if (!CLASSES_VALIDAS.includes(classeNorm)) {
      throw new AppError('Classe invalida. Use BASICO, NORMAL ou PREMIUM.', 400);
    }

    // Validação da forma de pagamento
    const formaPagamentoNorm = (formaPagamento || 'DINHEIRO').toUpperCase();
    if (!FORMAS_PAGAMENTO_VALIDAS.includes(formaPagamentoNorm)) {
      throw new AppError('Forma de pagamento invalida. Use DINHEIRO, CARTAO_DEBITO, CARTAO_CREDITO ou PIX.', 400);
    }

    // Verificar disponibilidade de veículo da classe solicitada
    const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
    const veiculosDaClasse = veiculosDisponiveis.filter((v) => v.classe === classeNorm);

    if (veiculosDaClasse.length === 0) {
      throw new AppError(
        `Nao ha veiculos da classe ${classeNorm} disponiveis. Selecione outra classe ou tente novamente mais tarde.`,
        409
      );
    }

    const valor = this.calcularValor({ distanciaKm, classe: classeNorm });

    const novaCorrida = await corridasRepository.create({
      usuarioId,
      origemNome,
      destinoNome,
      origemLat:          origemLat     || null,
      origemLng:          origemLng     || null,
      destinoLat:         destinoLat    || null,
      destinoLng:         destinoLng    || null,
      origemEndereco:     origemEndereco  || null,
      destinoEndereco:    destinoEndereco || null,
      rotaCaminho:        rotaCaminho   || [origemNome, destinoNome],
      rotasAlternativas:  rotasAlternativas || [],
      polyline:           polyline      || null,
      distanciaKm,
      duracaoMin:         duracaoMin    || null,
      valor,
      classe:             classeNorm,
      formaPagamento:     formaPagamentoNorm,
      dataHorario:        dataHorario   || new Date().toISOString(),
      status:             'SOLICITADA',
    });

    // Notificar motoristas elegíveis para a classe solicitada
    await this._notificarMotoristasElegiveis(novaCorrida);

    return novaCorrida;
  }

  /**
   * Notifica todos os motoristas APROVADOS com veículo DISPONIVEL da classe solicitada.
   * @private
   */
  async _notificarMotoristasElegiveis(corrida) {
    try {
      const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
      const veiculosDaClasse = veiculosDisponiveis.filter((v) => v.classe === corrida.classe);

      // veiculo.motoristaId = ID do registro Motorista (não do usuario)
      const motoristaIds = [...new Set(
        veiculosDaClasse
          .filter((v) => v.motoristaId)
          .map((v) => v.motoristaId)
      )];

      for (const motoristaId of motoristaIds) {
        // Buscar por ID do registro Motorista
        const motorista = await motoristasRepository.findById(motoristaId);
        if (!motorista || motorista.statusCadastro !== 'APROVADO') continue;
        // motorista.usuarioId = ID do usuário (para notificar)
        if (!motorista.usuarioId) continue;

        const dataFormatada = new Date(corrida.dataHorario).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });

        await notificacoesService.notificarNovaCorrida(motorista.usuarioId, {
          corridaId:   corrida.id,
          classe:      corrida.classe,
          origemNome:  corrida.origemNome,
          destinoNome: corrida.destinoNome,
          dataFormatada,
          distanciaKm: corrida.distanciaKm,
        });
      }
    } catch (e) {
      // Não falhar a criação da corrida por erro na notificação
      console.error('[CorridasService] Erro ao notificar motoristas:', e.message);
    }
  }


  /**
   * Motorista aceita uma corrida.
   * Valida que a corrida ainda está disponível (SOLICITADA) e que o motorista é elegível.
   * Prevenção de duplo aceite: usa transação implícita — apenas o primeiro aceite é processado.
   */
  async aceitar(corridaId, motoristaUsuarioId) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);

    if (corrida.status !== 'SOLICITADA') {
      throw new AppError(
        'Esta corrida ja foi assumida ou nao esta disponivel para aceite.',
        409
      );
    }

    // Validar motorista
    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);
    if (motorista.statusCadastro !== 'APROVADO') {
      throw new AppError('Apenas motoristas aprovados podem aceitar corridas.', 403);
    }

    // Verificar veículo elegível — findByMotoristaId usa o ID do registro Motorista
    const veiculo = await veiculosRepository.findByMotoristaId(motorista.id);
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

    // Aceitar: associar motorista e veículo, mudar status para CONFIRMADA
    const corridaAtualizada = await corridasRepository.aceitarCorrida(
      corridaId,
      motorista.id,
      veiculo.id
    );

    if (!corridaAtualizada) {
      // Ocorreu corrida de dados — outro motorista aceitou primeiro
      throw new AppError('Esta corrida ja foi assumida por outro motorista.', 409);
    }

    // Atualizar status do veículo
    await veiculosRepository.updateStatus(veiculo.id, 'EM_CORRIDA');

    // Marcar notificação do motorista como ACEITA
    await notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'ACEITA');

    // Notificar o passageiro
    await notificacoesService.notificarPassageiroAceite(corrida.usuarioId, {
      corridaId,
      origemNome:  corrida.origemNome,
      destinoNome: corrida.destinoNome,
    });

    return corridaAtualizada;
  }

  /**
   * Motorista recusa uma corrida.
   * Apenas atualiza a notificação — a corrida permanece SOLICITADA para outros motoristas.
   */
  async recusar(corridaId, motoristaUsuarioId) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);

    if (corrida.status !== 'SOLICITADA') {
      throw new AppError('Esta corrida nao esta mais disponivel.', 409);
    }

    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);

    // Marcar notificação como RECUSADA — a corrida fica disponível para outros
    await notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'RECUSADA');

    return { message: 'Corrida recusada com sucesso.' };
  }

  async cancelar(id) {
    const corrida = await this.buscarPorId(id);

    if (corrida.status === 'CANCELADA') {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const corridaAtualizada = await corridasRepository.updateStatus(id, 'CANCELADA');

    if (corrida.veiculoId) {
      try {
        await veiculosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* veículo pode não existir — ok */ }
    }

    return corridaAtualizada;
  }

  /**
   * Motorista confirma pagamento e finaliza a corrida.
   * A corrida só é FINALIZADA após confirmação do recebimento do pagamento.
   */
  async confirmarPagamentoEFinalizar(id, motoristaUsuarioId) {
    const corrida = await this.buscarPorId(id);

    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.status === 'CANCELADA') {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }
    if (corrida.status === 'SOLICITADA') {
      throw new AppError('A corrida ainda nao foi aceita por um motorista.', 409);
    }

    // Validar que é o motorista correto (se fornecido)
    if (motoristaUsuarioId) {
      const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
      if (motorista && corrida.motoristaId && corrida.motoristaId !== motorista.id) {
        throw new AppError('Voce nao e o motorista responsavel por esta corrida.', 403);
      }
    }

    const corridaFinalizada = await corridasRepository.updateStatus(id, 'FINALIZADA');

    if (corrida.veiculoId) {
      try {
        await veiculosRepository.updateStatus(corrida.veiculoId, 'DISPONIVEL');
      } catch (e) { /* ok */ }
    }

    // Notificar o passageiro que a corrida foi finalizada
    if (corrida.usuarioId) {
      try {
        await notificacoesService.notificarPassageiroFinalizacao(corrida.usuarioId, {
          corridaId: id,
          origemNome:  corrida.origemNome,
          destinoNome: corrida.destinoNome,
        });
      } catch (e) { /* ok */ }
    }

    return corridaFinalizada;
  }

  /**
   * @deprecated Use confirmarPagamentoEFinalizar para o fluxo correto.
   * Mantido para compatibilidade com admin que pode finalizar diretamente.
   */
  async finalizar(id) {
    return this.confirmarPagamentoEFinalizar(id, null);
  }
}

module.exports = new CorridasService();
