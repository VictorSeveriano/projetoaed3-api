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
   * Tarifa base por km por classe de veículo (R$/km) dependendo da faixa de horário.
   * 05:00–12:59 → manha
   * 13:00–18:59 → tarde
   * 19:00–04:59 → noite
   */
  static get TARIFAS_KM() {
    return {
      BASICO:  { manha: 1.50, tarde: 2.00, noite: 2.50 },
      NORMAL:  { manha: 2.00, tarde: 2.50, noite: 3.00 },
      PREMIUM: { manha: 2.50, tarde: 3.00, noite: 3.50 },
      default: { manha: 2.00, tarde: 2.50, noite: 3.00 },
    };
  }

  /**
   * Determina a faixa de horário baseada no dataHorario da corrida.
   * Extrai a hora diretamente da string ISO sem conversão de timezone,
   * garantindo que o horário local escolhido pelo usuário seja respeitado
   * independentemente do TZ do servidor.
   *
   * Aceita strings no formato:
   *   - "2026-10-01T13:05:00.000Z"  → extrai hora 13 (campo T + HH)
   *   - "2026-10-01T13:05"          → extrai hora 13
   *   - Date object                  → usa getHours() como fallback
   */
  static _determinarFaixaHorario(dataHorario) {
    let hora;

    if (typeof dataHorario === 'string' && dataHorario.includes('T')) {
      // Extrai a parte de hora diretamente da string ISO: "YYYY-MM-DDTHH:mm..."
      // Isso evita qualquer conversão de timezone
      const horaStr = dataHorario.split('T')[1].split(':')[0];
      hora = parseInt(horaStr, 10);
    } else {
      // Fallback para Date object
      const data = new Date(dataHorario);
      if (isNaN(data.getTime())) {
        throw new Error('dataHorario invalido para calculo de faixa horaria');
      }
      hora = data.getHours();
    }

    if (isNaN(hora) || hora < 0 || hora > 23) {
      throw new Error('Hora invalida extraida de dataHorario: ' + dataHorario);
    }

    if (hora >= 5 && hora < 13) return 'manha'; // 05:00 até 12:59
    if (hora >= 13 && hora < 19) return 'tarde'; // 13:00 até 18:59
    return 'noite'; // 19:00 até 04:59
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
        ? corridasRepository.findByMotoristaIdAndStatus(usuarioId, status)
        : corridasRepository.findByMotoristaId(usuarioId);
    }
    // USUARIO (passageiro)
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

  /**
   * Calcula o valor da corrida usando a regra de: distanciaKm * tarifa por km da classe e horario.
   * Valida todas as entradas e nunca retorna NaN, null, undefined, Infinity ou 0
   * quando a distância é positiva e a classe/data são válidas.
   *
   * @throws {AppError} se qualquer entrada for inválida
   */
  calcularValor({ distanciaKm, classe, dataHorario }) {
    // Validar distanciaKm
    const distancia = Number(distanciaKm);
    if (!Number.isFinite(distancia) || distancia <= 0) {
      throw new AppError(
        'distanciaKm invalido: deve ser um numero positivo. Recebido: ' + distanciaKm,
        400
      );
    }

    // Validar classe
    if (!classe || typeof classe !== 'string') {
      throw new AppError('classe invalida: deve ser BASICO, NORMAL ou PREMIUM. Recebido: ' + classe, 400);
    }
    const classeNorm = classe.toUpperCase();
    if (!CLASSES_VALIDAS.includes(classeNorm)) {
      throw new AppError(
        'classe invalida: deve ser BASICO, NORMAL ou PREMIUM. Recebido: ' + classe,
        400
      );
    }

    // Validar dataHorario
    if (!dataHorario) {
      throw new AppError('dataHorario e obrigatorio para calcular o valor da corrida.', 400);
    }

    // Determinar faixa (pode lançar erro internamente)
    let faixa;
    try {
      faixa = CorridasService._determinarFaixaHorario(dataHorario);
    } catch (e) {
      throw new AppError('dataHorario invalido: ' + e.message, 400);
    }

    const tarifasClasse = CorridasService.TARIFAS_KM[classeNorm];
    const tarifa = tarifasClasse[faixa];

    // Verificação defensiva da tarifa
    if (!tarifa || !Number.isFinite(tarifa) || tarifa <= 0) {
      throw new AppError(
        'Tarifa nao encontrada para classe ' + classeNorm + ' na faixa ' + faixa,
        500
      );
    }

    const valor = parseFloat((distancia * tarifa).toFixed(2));

    // Verificação final do resultado
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new AppError(
        'Valor calculado invalido: ' + valor + ' para distancia=' + distancia + ' classe=' + classeNorm,
        500
      );
    }

    return valor;
  }

  /**
   * Cria uma nova corrida.
   * Valida classe solicitada, disponibilidade de veículo da classe,
   * forma de pagamento e notifica motoristas elegíveis.
   */
  async criar(dados, usuarioLogado = null) {
    const {
      usuarioId,
      origemNome, destinoNome,
      origemLat, origemLng, destinoLat, destinoLng,
      origemEndereco, destinoEndereco,
      rotaCaminho, rotasAlternativas,
      polyline, distanciaKm, duracaoMin, dataHorario,
      classe, formaPagamento,
    } = dados;

    if (!usuarioLogado) {
      throw new AppError('Acesso negado. É necessário estar autenticado para criar uma corrida.', 401);
    }

    if (usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioId !== usuarioLogado.id) {
        throw new AppError('Você não tem permissão para criar uma corrida para outro usuário.', 403);
      }
    }

    if (!usuarioId || !origemNome || !destinoNome) {
      throw new AppError('usuarioId, origemNome e destinoNome sao obrigatorios.', 400);
    }

    // Coerce distanciaKm para numero e valida
    const distanciaKmNum = Number(distanciaKm);
    if (!Number.isFinite(distanciaKmNum) || distanciaKmNum <= 0) {
      throw new AppError('Distancia invalida para a corrida. Valor recebido: ' + distanciaKm, 400);
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

    const dataHorarioEfetivo = dataHorario || new Date().toISOString();
    // Backend sempre recalcula o valor — nunca confia no valor enviado pelo frontend
    const valor = this.calcularValor({ distanciaKm: distanciaKmNum, classe: classeNorm, dataHorario: dataHorarioEfetivo });

    // Validação final: valor calculado deve ser positivo
    if (!Number.isFinite(valor) || valor <= 0) {
      throw new AppError('Nao foi possivel calcular um valor valido para esta corrida.', 500);
    }

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
      distanciaKm:        distanciaKmNum,
      duracaoMin:         duracaoMin    || null,
      valor,
      classe:             classeNorm,
      formaPagamento:     formaPagamentoNorm,
      dataHorario:        dataHorarioEfetivo,
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

      // veiculo.motoristaId = ID do usuário
      const usuarioIds = [...new Set(
        veiculosDaClasse
          .filter((v) => v.motoristaId)
          .map((v) => v.motoristaId)
      )];

      for (const usuarioId of usuarioIds) {
        // Buscar por ID do usuário
        const motorista = await motoristasRepository.findByUsuarioId(usuarioId);
        if (!motorista || motorista.statusCadastro !== 'APROVADO') continue;

        const dataFormatada = new Date(corrida.dataHorario).toLocaleString('pt-BR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        });

        await notificacoesService.notificarNovaCorrida(usuarioId, {
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

    // Verificar veículo elegível — findByMotoristaId usa o ID do usuário do Motorista
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

    // Aceitar: associar motorista (usuarioId) e veículo, mudar status para CONFIRMADA
    const corridaAtualizada = await corridasRepository.aceitarCorrida(
      corridaId,
      motorista.usuarioId,
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

  async cancelar(id, usuarioLogado = null) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

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
  async confirmarPagamentoEFinalizar(id, usuarioLogado = null) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

    if (corrida.status === 'FINALIZADA') {
      throw new AppError('Esta corrida ja esta finalizada.', 409);
    }
    if (corrida.status === 'CANCELADA') {
      throw new AppError('Nao e possivel finalizar uma corrida cancelada.', 409);
    }
    if (corrida.status === 'SOLICITADA') {
      throw new AppError('A corrida ainda nao foi aceita por um motorista.', 409);
    }

    if (usuarioLogado && usuarioLogado.perfil !== 'ADMINISTRADOR') {
      if (usuarioLogado.perfil !== 'MOTORISTA') {
        throw new AppError('Apenas motoristas ou administradores podem confirmar pagamento e finalizar.', 403);
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
  async finalizar(id, usuarioLogado = null) {
    return this.confirmarPagamentoEFinalizar(id, usuarioLogado);
  }
}

module.exports = new CorridasService();
