'use strict';
/**
 * corridas.service.js — Regras de negócios de corridas.
 *
 * Responsabilidades:
 *   - Validação de classe e formaPagamento
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
  CLASSES_VALIDAS,
  FORMAS_PAGAMENTO_VALIDAS,
  STATUS_CORRIDA,
  BUSINESS_TIMEZONE,
} = require('../utils/constants');
const {
  ausente,
  exigirTexto,
  exigirNumeroPositivo,
  numeroPositivoOpcional,
  latitudeOpcional,
  longitudeOpcional,
  enumOpcional,
  lerDataHorario,
  horaNoFusoDoNegocio,
} = require('../utils/inputValidators');

const NOME_LOCAL_MAX = 255; // varchar(255) em corridas.origem_nome / destino_nome

const ehObjetoSimples = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

class CorridasService {
  /**
   * Tarifa base por km por classe de veículo (R$/km) dependendo da faixa de horário.
   * Faixas definidas no fuso do negócio (America/Sao_Paulo):
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
   * Determina a faixa tarifária de um instante.
   *
   * Contrato de dataHorario (frontend ⇄ backend): string ISO 8601 que representa um INSTANTE.
   * O frontend envia `new Date(valorDoInput).toISOString()` (ex.: "2026-10-01T17:00:00.000Z").
   * A hora relevante para a tarifa é a hora no fuso do negócio (BUSINESS_TIMEZONE = America/Sao_Paulo),
   * e NÃO a hora UTC contida na string. Strings sem offset são interpretadas como horário de parede
   * do fuso do negócio. Instâncias de Date também são aceitas (uso interno).
   *
   * @returns {'manha'|'tarde'|'noite'}
   */
  static _determinarFaixaHorario(dataHorario) {
    let instante;
    if (dataHorario instanceof Date) {
      if (Number.isNaN(dataHorario.getTime())) {
        throw new Error('dataHorario invalido para calculo de faixa horaria');
      }
      instante = dataHorario;
    } else {
      instante = lerDataHorario(dataHorario);
    }

    const hora = horaNoFusoDoNegocio(instante, BUSINESS_TIMEZONE);
    if (Number.isNaN(hora) || hora < 0 || hora > 23) {
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
    // Validar distanciaKm (sem coerção cega: booleanos, arrays, objetos, '' e NaN/Infinity são rejeitados)
    const distancia = exigirNumeroPositivo(distanciaKm, 'distanciaKm');

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
    if (ausente(dataHorario) || dataHorario === '') {
      throw new AppError('dataHorario e obrigatorio para calcular o valor da corrida.', 400);
    }

    // Determinar faixa (lança AppError 400 para datas inválidas)
    const faixa = CorridasService._determinarFaixaHorario(dataHorario);

    const tarifasClasse = CorridasService.TARIFAS_KM[classeNorm];
    const tarifa = tarifasClasse[faixa];

    // Verificação defensiva da tarifa
    if (!tarifa || !Number.isFinite(tarifa) || tarifa <= 0) {
      throw new AppError(
        'Tarifa nao encontrada para classe ' + classeNorm + ' na faixa ' + faixa,
        500
      );
    }

    const bruto = distancia * tarifa;
    if (!Number.isFinite(bruto)) {
      throw new AppError('distanciaKm invalido: valor fora do intervalo suportado.', 400);
    }

    const valor = parseFloat(bruto.toFixed(2));

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
   * Valida e normaliza o payload de criação. Retorna somente valores normalizados
   * (nunca reaproveita o valor bruto recebido). Lança AppError 400 em entradas inválidas.
   * Observação: `usuarioId`, `status`, `valor`, `motoristaId` e `veiculoId` enviados pelo cliente são ignorados.
   */
  _validarDadosCriacao(dados) {
    if (!ehObjetoSimples(dados)) {
      throw new AppError('Corpo da requisicao invalido.', 400);
    }

    const origemNome  = exigirTexto(dados.origemNome, 'origemNome', { max: NOME_LOCAL_MAX });
    const destinoNome = exigirTexto(dados.destinoNome, 'destinoNome', { max: NOME_LOCAL_MAX });

    const distanciaKm = exigirNumeroPositivo(dados.distanciaKm, 'distanciaKm');
    // duracaoMin é opcional; coluna Int → quando informada deve ser inteiro positivo
    const duracaoMin  = numeroPositivoOpcional(dados.duracaoMin, 'duracaoMin', { inteiro: true });

    const classe         = enumOpcional(dados.classe, 'Classe', CLASSES_VALIDAS, 'NORMAL');
    const formaPagamento = enumOpcional(dados.formaPagamento, 'Forma de pagamento', FORMAS_PAGAMENTO_VALIDAS, 'DINHEIRO');

    const dataHorario = ausente(dados.dataHorario) ? new Date() : lerDataHorario(dados.dataHorario);

    const origemLat  = latitudeOpcional(dados.origemLat, 'origemLat');
    const origemLng  = longitudeOpcional(dados.origemLng, 'origemLng');
    const destinoLat = latitudeOpcional(dados.destinoLat, 'destinoLat');
    const destinoLng = longitudeOpcional(dados.destinoLng, 'destinoLng');

    let polyline = null;
    if (!ausente(dados.polyline)) {
      if (typeof dados.polyline !== 'string') throw new AppError('polyline invalida: deve ser um texto.', 400);
      polyline = dados.polyline;
    }

    let rotaCaminho = [origemNome, destinoNome];
    if (!ausente(dados.rotaCaminho)) {
      if (!Array.isArray(dados.rotaCaminho) || dados.rotaCaminho.some((p) => typeof p !== 'string')) {
        throw new AppError('rotaCaminho invalido: deve ser uma lista de textos.', 400);
      }
      rotaCaminho = dados.rotaCaminho;
    }

    let rotasAlternativas = [];
    if (!ausente(dados.rotasAlternativas)) {
      if (!Array.isArray(dados.rotasAlternativas) || dados.rotasAlternativas.some((r) => !ehObjetoSimples(r))) {
        throw new AppError('rotasAlternativas invalido: deve ser uma lista de objetos.', 400);
      }
      rotasAlternativas = dados.rotasAlternativas;
    }

    const enderecos = {};
    for (const campo of ['origemEndereco', 'destinoEndereco']) {
      if (ausente(dados[campo])) {
        enderecos[campo] = null;
      } else if (!ehObjetoSimples(dados[campo])) {
        throw new AppError(`${campo} invalido: deve ser um objeto.`, 400);
      } else {
        enderecos[campo] = dados[campo];
      }
    }

    return {
      origemNome, destinoNome, distanciaKm, duracaoMin, classe, formaPagamento, dataHorario,
      origemLat, origemLng, destinoLat, destinoLng,
      polyline, rotaCaminho, rotasAlternativas, ...enderecos,
    };
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

    // Validação final: valor calculado deve ser positivo
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

    // Corrida já persistida: falha na notificação não a desfaz (ver política no topo do arquivo)
    await this._notificarMotoristasElegiveis(novaCorrida);

    return novaCorrida;
  }

  /**
   * Executa uma notificação pós-commit sem propagar falhas.
   * Registra o erro com contexto (somente identificadores; sem dados pessoais).
   * @returns {Promise<boolean>} true se enviada
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
   * Falha de um destinatário não impede os demais.
   * @private
   */
  async _notificarMotoristasElegiveis(corrida) {
    let usuarioIds = [];
    try {
      const veiculosDisponiveis = await veiculosRepository.findDisponiveis();
      const veiculosDaClasse = veiculosDisponiveis.filter((v) => v.classe === corrida.classe);

      // veiculo.motoristaId = ID do usuário
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

    for (const usuarioId of usuarioIds) {
      await this._notificarSemFalhar(`nova corrida ${corrida.id} -> motorista ${usuarioId}`, async () => {
        // Buscar por ID do usuário
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
      });
    }
  }


  /**
   * Motorista aceita uma corrida.
   * Valida que a corrida ainda está disponível (SOLICITADA) e que o motorista é elegível.
   * As leituras abaixo servem apenas para mensagens de erro claras; a garantia real contra
   * duplo aceite e dupla alocação de veículo é dada pela transação com UPDATEs condicionais
   * em corridasRepository.aceitarComReservaDeVeiculo.
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

    // Aceitar de forma atômica: reserva o veículo (→ EM_CORRIDA) e confirma a corrida na mesma transação
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

    // Pós-commit: notificações não revertem o aceite (falhas são registradas em log)
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
   * Apenas atualiza a notificação — a corrida permanece SOLICITADA para outros motoristas.
   */
  async recusar(corridaId, motoristaUsuarioId) {
    const corrida = await corridasRepository.findById(corridaId);
    if (!corrida) throw new AppError('Corrida nao encontrada.', 404);

    if (corrida.status !== STATUS_CORRIDA.SOLICITADA) {
      throw new AppError('Esta corrida nao esta mais disponivel.', 409);
    }

    const motorista = await motoristasRepository.findByUsuarioId(motoristaUsuarioId);
    if (!motorista) throw new AppError('Perfil de motorista nao encontrado.', 404);

    // Marcar notificação como RECUSADA — a corrida fica disponível para outros
    await notificacoesService.atualizarAcaoMotorista(corridaId, motorista.usuarioId, 'RECUSADA');

    return { message: 'Corrida recusada com sucesso.' };
  }

  /**
   * Cancela a corrida e libera o veículo (se houver) na mesma transação.
   * Quem pode cancelar segue buscarPorId (dono, motorista da corrida ou administrador).
   */
  async cancelar(id, usuarioLogado = null) {
    const corrida = await this.buscarPorId(id, usuarioLogado);

    if (corrida.status === STATUS_CORRIDA.CANCELADA) {
      throw new AppError('Esta corrida ja esta cancelada.', 409);
    }
    if (corrida.status === STATUS_CORRIDA.FINALIZADA) {
      throw new AppError('Nao e possivel cancelar uma corrida finalizada.', 409);
    }

    const corridaAtualizada = await corridasRepository.transicionarComLiberacaoDeVeiculo(id, 'cancelar');
    if (!corridaAtualizada) {
      throw new AppError('O estado da corrida foi alterado por outra operacao. Atualize e tente novamente.', 409);
    }

    return corridaAtualizada;
  }

  /**
   * Motorista confirma pagamento e finaliza a corrida.
   * A corrida só é FINALIZADA após confirmação do recebimento do pagamento.
   * Finalização e liberação do veículo ocorrem na mesma transação.
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

    // Pós-commit: notificar o passageiro (falha não reverte a finalização)
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
   * Mantido para compatibilidade com admin que pode finalizar diretamente.
   */
  async finalizar(id, usuarioLogado = null) {
    return this.confirmarPagamentoEFinalizar(id, usuarioLogado);
  }
}

module.exports = new CorridasService();
