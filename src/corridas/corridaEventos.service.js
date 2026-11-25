'use strict';
/**
 * corridaEventos.service.js — Construção e consulta autorizada da linha do tempo
 * cronológica de acontecimentos reais de uma corrida.
 *
 * Princípios:
 *  - Eventos novos são gravados atomicamente nas transações/operações reais do backend.
 *  - Para corridas anteriores à criação da tabela `corrida_eventos`, reconstrói
 *    APENAS marcos cujos timestamps reais estejam efetivamente persistidos na tabela
 *    `corridas` — sem jamais inventar horários ou acontecimentos inexistentes.
 *  - Elimina duplicidades por tipo/chave e devolve eventos em ordem cronológica.
 *  - Carregamento sob demanda (`GET /api/corridas/:id/linha-do-tempo`), respeitando
 *    integralmente o isolamento de permissões por perfil (`ADMINISTRADOR`, `MOTORISTA`, `USUARIO`).
 */

const corridaEventosRepository = require('./corridaEventos.repository');
const corridasRepository = require('./corridas.repository');
const Corrida = require('./Corrida');
const AppError = require('../utils/AppError');
const {
  TIPO_EVENTO_CORRIDA,
  ORIGEM_CANCELAMENTO,
  BUSINESS_TIMEZONE,
} = require('../utils/constants');
const {
  foiExpiradaAutomaticamente,
  classificarPontualidadeCorrida,
} = require('./indicadorAtraso');

function formatarInstanteCurto(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('pt-BR', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function rotuloResponsavelPorPerfil(perfil, nome) {
  const mapaPerfil = {
    USUARIO: 'Passageiro',
    PASSAGEIRO: 'Passageiro',
    MOTORISTA: 'Motorista',
    ADMINISTRADOR: 'Administrador',
    SISTEMA: 'Sistema automático',
  };
  const base = mapaPerfil[perfil] || 'Sistema';
  if (nome && perfil !== 'SISTEMA') {
    return `${nome} (${base})`;
  }
  return nome || base;
}

class CorridaEventosService {
  /**
   * Registra um evento sem lançar erro fatal fora de transação quando invocado
   * após operações não transacionais, ou propaga dentro de transação quando desejado.
   */
  async registrarSeguro(dados, db) {
    try {
      return await corridaEventosRepository.registrarEvento(dados, db);
    } catch (err) {
      console.error(
        `[CorridaEventosService] Falha ao registrar evento ${dados?.tipo} na corrida ${dados?.corridaId}:`,
        err.message
      );
      return null;
    }
  }

  /**
   * Mescla os eventos persistidos em `corrida_eventos` com eventuais marcos reais
   * já gravados nas colunas de `corridas` (para compatibilidade com corridas pré-existentes),
   * sem duplicar eventos e sem inventar timestamps ausentes.
   */
  construirLinhaDoTempo(corrida, eventosPersistidos = []) {
    const listaPersistida = Array.isArray(eventosPersistidos) ? eventosPersistidos : [];
    const tiposPresentes = new Set(listaPersistida.map((e) => e.tipo));

    const eventosNormalizados = listaPersistida.map((ev) => ({
      id: ev.id,
      tipo: ev.tipo,
      titulo: ev.titulo,
      descricao: ev.descricao,
      dataHorario: ev.criadoEm,
      autorId: ev.autorId || null,
      autorPerfil: ev.autorPerfil || 'SISTEMA',
      autorNome: ev.autorNome || null,
      responsavel: rotuloResponsavelPorPerfil(ev.autorPerfil, ev.autorNome),
      metadados: ev.metadados || null,
    }));

    const nomePassageiro = corrida.passageiro?.nome || null;
    const nomeMotorista = corrida.motorista?.nome || null;
    const descricaoVeiculo = corrida.veiculo
      ? `${corrida.veiculo.marca} ${corrida.veiculo.modelo}${corrida.veiculo.placa ? ` (${corrida.veiculo.placa})` : ''}`
      : null;

    // 1. Solicitação (persistido em corrida.criadaEm)
    if (!tiposPresentes.has(TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA) && corrida.criadaEm) {
      eventosNormalizados.push({
        id: `sintetico-solicitacao-${corrida.id}`,
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA,
        titulo: 'Corrida solicitada',
        descricao: `Solicitação registrada de ${corrida.origemNome} para ${corrida.destinoNome} (classe ${corrida.classe || 'NORMAL'}).`,
        dataHorario: corrida.criadaEm,
        autorId: corrida.usuarioId || null,
        autorPerfil: 'USUARIO',
        autorNome: nomePassageiro,
        responsavel: rotuloResponsavelPorPerfil('USUARIO', nomePassageiro),
        metadados: {
          classe: corrida.classe || 'NORMAL',
          formaPagamento: corrida.formaPagamento || 'DINHEIRO',
          distanciaKm: corrida.distanciaKm,
          duracaoPrevistaMin: corrida.duracaoMin ?? null,
          valor: corrida.valor,
          dataHorarioProgramado: corrida.dataHorario,
        },
      });
    }

    // 2. Aceitação (somente se corrida.aceitaEm estiver efetivamente persistido)
    if (!tiposPresentes.has(TIPO_EVENTO_CORRIDA.CORRIDA_ACEITA) && corrida.aceitaEm) {
      eventosNormalizados.push({
        id: `sintetico-aceite-${corrida.id}`,
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_ACEITA,
        titulo: 'Corrida aceita pelo motorista',
        descricao: descricaoVeiculo
          ? `Motorista aceitou a corrida com o veículo ${descricaoVeiculo}.`
          : 'Motorista aceitou a solicitação de corrida.',
        dataHorario: corrida.aceitaEm,
        autorId: corrida.motoristaId || null,
        autorPerfil: 'MOTORISTA',
        autorNome: nomeMotorista,
        responsavel: rotuloResponsavelPorPerfil('MOTORISTA', nomeMotorista),
        metadados: {
          veiculoId: corrida.veiculoId || null,
          veiculo: descricaoVeiculo,
        },
      });
    }

    // 3. Motorista a caminho (somente se corrida.motoristaACaminhoEm estiver persistido)
    if (!tiposPresentes.has(TIPO_EVENTO_CORRIDA.MOTORISTA_A_CAMINHO) && corrida.motoristaACaminhoEm) {
      const prazoFmt = formatarInstanteCurto(corrida.prazoConfirmacaoEm);
      eventosNormalizados.push({
        id: `sintetico-a-caminho-${corrida.id}`,
        tipo: TIPO_EVENTO_CORRIDA.MOTORISTA_A_CAMINHO,
        titulo: 'Motorista a caminho',
        descricao: prazoFmt
          ? `Motorista informou estar a caminho do local de embarque. Prazo de confirmação estendido até ${prazoFmt}.`
          : 'Motorista informou estar a caminho do local de embarque.',
        dataHorario: corrida.motoristaACaminhoEm,
        autorId: corrida.motoristaId || null,
        autorPerfil: 'MOTORISTA',
        autorNome: nomeMotorista,
        responsavel: rotuloResponsavelPorPerfil('MOTORISTA', nomeMotorista),
        metadados: {
          prazoConfirmacaoEm: corrida.prazoConfirmacaoEm || null,
        },
      });
    }

    // 4. Embarque confirmado pelo motorista / Início da corrida
    if (
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.EMBARQUE_MOTORISTA_CONFIRMADO) &&
      corrida.embarqueMotoristaConfirmado === true &&
      corrida.embarqueMotoristaEm
    ) {
      eventosNormalizados.push({
        id: `sintetico-embarque-motorista-${corrida.id}`,
        tipo: TIPO_EVENTO_CORRIDA.EMBARQUE_MOTORISTA_CONFIRMADO,
        titulo: 'Embarque confirmado e corrida iniciada',
        descricao: 'O motorista confirmou o embarque no local de origem e iniciou o deslocamento.',
        dataHorario: corrida.embarqueMotoristaEm,
        autorId: corrida.motoristaId || null,
        autorPerfil: 'MOTORISTA',
        autorNome: nomeMotorista,
        responsavel: rotuloResponsavelPorPerfil('MOTORISTA', nomeMotorista),
        metadados: null,
      });
    }

    // 5. Resposta de embarque do passageiro
    if (
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.EMBARQUE_PASSAGEIRO_CONFIRMADO) &&
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.PASSAGEIRO_NAO_EMBARCOU) &&
      corrida.embarquePassageiroEm &&
      corrida.embarquePassageiroConfirmado !== null &&
      corrida.embarquePassageiroConfirmado !== undefined
    ) {
      const confirmou = corrida.embarquePassageiroConfirmado === true;
      eventosNormalizados.push({
        id: `sintetico-embarque-passageiro-${corrida.id}`,
        tipo: confirmou
          ? TIPO_EVENTO_CORRIDA.EMBARQUE_PASSAGEIRO_CONFIRMADO
          : TIPO_EVENTO_CORRIDA.PASSAGEIRO_NAO_EMBARCOU,
        titulo: confirmou
          ? 'Embarque confirmado pelo passageiro'
          : 'Passageiro informou aguardar embarque',
        descricao: confirmou
          ? 'O passageiro confirmou que embarcou no veículo.'
          : 'O passageiro registrou que ainda não havia embarcado.',
        dataHorario: corrida.embarquePassageiroEm,
        autorId: corrida.usuarioId || null,
        autorPerfil: 'USUARIO',
        autorNome: nomePassageiro,
        responsavel: rotuloResponsavelPorPerfil('USUARIO', nomePassageiro),
        metadados: { embarqueConfirmado: confirmou },
      });
    }

    // 6. Finalização (somente se finalizadaEm estiver efetivamente persistido)
    if (
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA) &&
      corrida.status === 'FINALIZADA' &&
      corrida.finalizadaEm
    ) {
      eventosNormalizados.push({
        id: `sintetico-finalizacao-${corrida.id}`,
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA,
        titulo: 'Pagamento confirmado e corrida finalizada',
        descricao: `Viagem concluída e pagamento (${corrida.formaPagamento || 'DINHEIRO'}) confirmado.`,
        dataHorario: corrida.finalizadaEm,
        autorId: corrida.motoristaId || null,
        autorPerfil: 'MOTORISTA',
        autorNome: nomeMotorista,
        responsavel: rotuloResponsavelPorPerfil('MOTORISTA', nomeMotorista),
        metadados: {
          valor: corrida.valor,
          formaPagamento: corrida.formaPagamento || 'DINHEIRO',
        },
      });
    }

    // 7. Cancelamento ou Expiração automática (somente se canceladaEm estiver persistido)
    if (
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.CORRIDA_CANCELADA) &&
      !tiposPresentes.has(TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA) &&
      corrida.status === 'CANCELADA' &&
      corrida.canceladaEm
    ) {
      const expirada = foiExpiradaAutomaticamente(corrida);
      const canceladoPor = corrida.canceladoPor || ORIGEM_CANCELAMENTO.SISTEMA;
      const perfilAutor =
        canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA
          ? 'MOTORISTA'
          : canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO
            ? 'USUARIO'
            : expirada
              ? 'SISTEMA'
              : 'ADMINISTRADOR';
      const nomeAutor =
        perfilAutor === 'MOTORISTA'
          ? nomeMotorista
          : perfilAutor === 'USUARIO'
            ? nomePassageiro
            : expirada
              ? 'Sistema automático'
              : 'Administração';

      eventosNormalizados.push({
        id: `sintetico-encerramento-${corrida.id}`,
        tipo: expirada ? TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA : TIPO_EVENTO_CORRIDA.CORRIDA_CANCELADA,
        titulo: expirada
          ? 'Expiração automática da corrida'
          : canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA
            ? 'Corrida cancelada pelo motorista'
            : canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO
              ? 'Corrida cancelada pelo passageiro'
              : 'Corrida cancelada',
        descricao: corrida.motivoCancelamento
          ? `${corrida.motivoCancelamento}`
          : 'Corrida cancelada antes da conclusão.',
        dataHorario: corrida.canceladaEm,
        autorId:
          perfilAutor === 'MOTORISTA'
            ? corrida.motoristaId
            : perfilAutor === 'USUARIO'
              ? corrida.usuarioId
              : null,
        autorPerfil: perfilAutor,
        autorNome: nomeAutor,
        responsavel: rotuloResponsavelPorPerfil(perfilAutor, nomeAutor),
        metadados: {
          canceladoPor,
          motivoCancelamento: corrida.motivoCancelamento || null,
          expiracaoAutomatica: expirada,
        },
      });
    }

    // Ordenação estritamente cronológica
    const prioridadeDesempate = {
      [TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA]: 1,
      [TIPO_EVENTO_CORRIDA.CORRIDA_ACEITA]: 2,
      [TIPO_EVENTO_CORRIDA.MOTORISTA_A_CAMINHO]: 3,
      [TIPO_EVENTO_CORRIDA.EMBARQUE_MOTORISTA_CONFIRMADO]: 4,
      [TIPO_EVENTO_CORRIDA.CORRIDA_INICIADA]: 5,
      [TIPO_EVENTO_CORRIDA.PASSAGEIRO_NAO_EMBARCOU]: 6,
      [TIPO_EVENTO_CORRIDA.EMBARQUE_PASSAGEIRO_CONFIRMADO]: 7,
      [TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA]: 8,
      [TIPO_EVENTO_CORRIDA.CORRIDA_CANCELADA]: 9,
      [TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA]: 10,
    };

    eventosNormalizados.sort((a, b) => {
      const tA = new Date(a.dataHorario).getTime();
      const tB = new Date(b.dataHorario).getTime();
      if (tA !== tB) return tA - tB;
      return (prioridadeDesempate[a.tipo] || 99) - (prioridadeDesempate[b.tipo] || 99);
    });

    return eventosNormalizados;
  }

  /**
   * Consulta sob demanda os detalhes enriquecidos e a linha do tempo de uma corrida,
   * aplicando rigorosamente as regras de autorização por perfil.
   */
  async obterDetalhesComLinhaDoTempo(corridaId, usuarioLogado) {
    if (!usuarioLogado) {
      throw new AppError('Autenticação obrigatória.', 401);
    }

    const registroDetalhado =
      typeof corridasRepository.findDetalhadaById === 'function'
        ? await corridasRepository.findDetalhadaById(corridaId)
        : await corridasRepository.findById(corridaId);

    if (!registroDetalhado) {
      throw new AppError(`Corrida ${corridaId} nao encontrada.`, 404);
    }

    const corrida = Corrida.garantirInstancia(registroDetalhado);
    if (!corrida.podeSerAcessadaPor(usuarioLogado)) {
      throw new AppError('Voce nao tem permissao para acessar esta corrida.', 403);
    }

    const eventosPersistidos = await corridaEventosRepository.listarPorCorridaId(corridaId);
    const linhaDoTempo = this.construirLinhaDoTempo(registroDetalhado, eventosPersistidos);
    const pontualidade = classificarPontualidadeCorrida(registroDetalhado);

    return {
      corrida: {
        ...registroDetalhado,
        pontualidade,
        duracaoEfetivaMin: pontualidade.duracaoEfetivaMin,
      },
      eventos: linhaDoTempo,
    };
  }
}

module.exports = new CorridaEventosService();
