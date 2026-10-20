'use strict';
/**
 * saneamentoCorridasAtivas.js — Diagnóstico e saneamento explícito, seguro e auditável
 * de corridas ativas conflitantes associadas ao mesmo veículo.
 *
 * Princípios de integridade (Seção 3):
 * 1. NUNCA marca corridas duplicadas como FINALIZADA ou CANCELADA sem comprovação,
 *    pois isso criaria histórico falso de conclusão/cancelamento.
 * 2. Determina a corrida titular do veículo priorizando:
 *    - status 'EM_ANDAMENTO' sobre 'CONFIRMADA' (corrida já iniciada fisicamente);
 *    - menor timestamp `criadaEm` (a corrida que reservou o veículo primeiro).
 * 3. Para corridas excedentes em estado 'CONFIRMADA' (ainda não iniciadas, fruto de
 *    duplo aceite legado em veículo já ocupado), reverte apenas a reserva inválida do
 *    veículo (status -> 'SOLICITADA', motoristaId -> null, veiculoId -> null),
 *    preservando a solicitação da corrida e registrando trilha completa em `auditoria`.
 * 4. Para corridas excedentes em estado 'EM_ANDAMENTO' (conflito ambíguo de duas
 *    viagens em andamento no mesmo veículo), NÃO modifica automaticamente sem
 *    resolução explícita e justificativa auditada: registra diagnóstico pendente
 *    em `auditoria` e retorna na lista `naoResolvidos`.
 */

const prismaDefault = require('./prisma');
const { STATUS_CORRIDA_ATIVOS, STATUS_VEICULO } = require('../utils/constants');

function compararPrioridadeTitular(a, b) {
  const pesoA = a.status === 'EM_ANDAMENTO' ? 0 : 1;
  const pesoB = b.status === 'EM_ANDAMENTO' ? 0 : 1;
  if (pesoA !== pesoB) return pesoA - pesoB;

  const tA = new Date(a.criadaEm).getTime();
  const tB = new Date(b.criadaEm).getTime();
  if (tA !== tB) return tA - tB;

  return String(a.id).localeCompare(String(b.id));
}

/**
 * Inspeciona o banco e identifica todos os veículos vinculados a mais de uma corrida ativa.
 * Não modifica nenhum registro.
 */
async function diagnosticarConflitosVeiculoAtivo(db = prismaDefault) {
  const corridasAtivas = await db.corrida.findMany({
    where: {
      status: { in: [...STATUS_CORRIDA_ATIVOS] },
      veiculoId: { not: null },
    },
    orderBy: [{ criadaEm: 'asc' }, { id: 'asc' }],
  });

  const porVeiculo = new Map();
  for (const c of corridasAtivas) {
    if (!porVeiculo.has(c.veiculoId)) {
      porVeiculo.set(c.veiculoId, []);
    }
    porVeiculo.get(c.veiculoId).push(c);
  }

  const conflitos = [];
  for (const [veiculoId, lista] of porVeiculo.entries()) {
    if (lista.length <= 1) continue;
    const ordenadas = [...lista].sort(compararPrioridadeTitular);
    const [corridaTitular, ...corridasExcedentes] = ordenadas;

    conflitos.push({
      veiculoId,
      corridaTitular: {
        id: corridaTitular.id,
        status: corridaTitular.status,
        motoristaId: corridaTitular.motoristaId,
        usuarioId: corridaTitular.usuarioId,
        criadaEm: corridaTitular.criadaEm,
      },
      corridasExcedentes: corridasExcedentes.map((c) => ({
        id: c.id,
        status: c.status,
        motoristaId: c.motoristaId,
        usuarioId: c.usuarioId,
        classe: c.classe,
        criadaEm: c.criadaEm,
        atualizadaEm: c.atualizadaEm,
        saneavelAutomaticamente: c.status === 'CONFIRMADA',
        motivo:
          c.status === 'CONFIRMADA'
            ? 'Reserva duplicada em veículo já alocado; corrida ainda não iniciada.'
            : 'Conflito ambíguo: corrida consta como EM_ANDAMENTO em veículo já em uso. Requer resolução explícita justificada.',
      })),
    });
  }

  return {
    possuiConflitos: conflitos.length > 0,
    totalVeiculosComConflito: conflitos.length,
    totalCorridasExcedentes: conflitos.reduce((acc, c) => acc + c.corridasExcedentes.length, 0),
    conflitos,
  };
}

/**
 * Executa o saneamento auditável dos conflitos de corridas ativas no mesmo veículo.
 *
 * @param {object} [db] instância do PrismaClient
 * @param {object} [opcoes]
 * @param {Record<string, { acao: 'DESVINCULAR_PARA_SOLICITADA' | 'REALOCAR_VEICULO', veiculoId?: string, motoristaId?: string, justificativa: string }>} [opcoes.resolucoesExplicitas]
 * @param {string|null} [opcoes.usuarioId]
 * @param {string} [opcoes.perfil]
 */
async function sanearConflitosVeiculoAtivo(db = prismaDefault, opcoes = {}) {
  const { resolucoesExplicitas = {}, usuarioId = null, perfil = 'SISTEMA' } = opcoes;

  return db.$transaction(async (tx) => {
    const diagnostico = await diagnosticarConflitosVeiculoAtivo(tx);
    const saneadas = [];
    const naoResolvidos = [];

    for (const conflito of diagnostico.conflitos) {
      const { veiculoId, corridaTitular, corridasExcedentes } = conflito;

      for (const excedente of corridasExcedentes) {
        const resolucao = resolucoesExplicitas[excedente.id];
        const dadosAnteriores = {
          status: excedente.status,
          motoristaId: excedente.motoristaId,
          veiculoId,
          atualizadaEm: excedente.atualizadaEm,
        };

        // Caso 1: Corrida CONFIRMADA (ainda não iniciada) ou resolução explícita de desvinculação com justificativa
        const podeDesvincular =
          excedente.status === 'CONFIRMADA' ||
          (resolucao &&
            resolucao.acao === 'DESVINCULAR_PARA_SOLICITADA' &&
            typeof resolucao.justificativa === 'string' &&
            resolucao.justificativa.trim().length > 0);

        if (podeDesvincular && (!resolucao || resolucao.acao === 'DESVINCULAR_PARA_SOLICITADA')) {
          const justificativa =
            resolucao?.justificativa?.trim() ||
            `Saneamento de reserva duplicada: veículo ${veiculoId} já estava alocado à corrida titular ${corridaTitular.id} (${corridaTitular.status}). Corrida retornada para SOLICITADA sem alterar histórico de conclusão.`;

          const agora = new Date();
          await tx.corrida.update({
            where: { id: excedente.id },
            data: {
              status: 'SOLICITADA',
              motoristaId: null,
              veiculoId: null,
              atualizadaEm: agora,
            },
          });

          const dadosNovos = {
            status: 'SOLICITADA',
            motoristaId: null,
            veiculoId: null,
            atualizadaEm: agora,
          };

          await tx.auditoria.create({
            data: {
              usuarioId,
              perfil,
              acao: 'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
              modulo: 'CORRIDAS',
              entidade: 'Corrida',
              entidadeId: excedente.id,
              descricao: justificativa,
              dadosAnteriores,
              dadosNovos,
              resultado: 'SUCESSO',
            },
          });

          saneadas.push({
            corridaId: excedente.id,
            veiculoConflitanteId: veiculoId,
            corridaTitularId: corridaTitular.id,
            acaoAplicada: 'DESVINCULAR_PARA_SOLICITADA',
            dadosAnteriores,
            dadosNovos,
            justificativa,
          });
          continue;
        }

        // Caso 2: Realocação explícita para outro veículo disponível e compatível
        if (
          resolucao &&
          resolucao.acao === 'REALOCAR_VEICULO' &&
          resolucao.veiculoId &&
          resolucao.motoristaId &&
          typeof resolucao.justificativa === 'string' &&
          resolucao.justificativa.trim().length > 0
        ) {
          const agora = new Date();
          const veiculoDestino = await tx.veiculo.findUnique({ where: { id: resolucao.veiculoId } });
          const ativasNoDestino = await tx.corrida.count({
            where: {
              veiculoId: resolucao.veiculoId,
              status: { in: [...STATUS_CORRIDA_ATIVOS] },
            },
          });

          if (
            !veiculoDestino ||
            veiculoDestino.statusAprovacao !== 'APROVADO' ||
            ativasNoDestino > 0
          ) {
            throw new Error(
              `Veículo de destino ${resolucao.veiculoId} inválido ou já possui corrida ativa.`
            );
          }

          await tx.veiculo.update({
            where: { id: resolucao.veiculoId },
            data: { status: STATUS_VEICULO.EM_CORRIDA, atualizadoEm: agora },
          });

          await tx.corrida.update({
            where: { id: excedente.id },
            data: {
              veiculoId: resolucao.veiculoId,
              motoristaId: resolucao.motoristaId,
              atualizadaEm: agora,
            },
          });

          const dadosNovos = {
            status: excedente.status,
            motoristaId: resolucao.motoristaId,
            veiculoId: resolucao.veiculoId,
            atualizadaEm: agora,
          };

          await tx.auditoria.create({
            data: {
              usuarioId,
              perfil,
              acao: 'SANEAMENTO_REALOCACAO_VEICULO_ATIVO',
              modulo: 'CORRIDAS',
              entidade: 'Corrida',
              entidadeId: excedente.id,
              descricao: resolucao.justificativa.trim(),
              dadosAnteriores,
              dadosNovos,
              resultado: 'SUCESSO',
            },
          });

          saneadas.push({
            corridaId: excedente.id,
            veiculoConflitanteId: veiculoId,
            corridaTitularId: corridaTitular.id,
            acaoAplicada: 'REALOCAR_VEICULO',
            dadosAnteriores,
            dadosNovos,
            justificativa: resolucao.justificativa.trim(),
          });
          continue;
        }

        // Caso 3: Conflito EM_ANDAMENTO sem resolução explícita — não altera o estado da corrida
        await tx.auditoria.create({
          data: {
            usuarioId,
            perfil,
            acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
            modulo: 'CORRIDAS',
            entidade: 'Corrida',
            entidadeId: excedente.id,
            descricao: `Conflito não resolvido automaticamente: corrida ${excedente.id} (${excedente.status}) compartilha o veículo ${veiculoId} com a corrida titular ${corridaTitular.id} (${corridaTitular.status}).`,
            dadosAnteriores,
            resultado: 'PENDENTE',
          },
        });

        naoResolvidos.push({
          corridaId: excedente.id,
          veiculoId,
          status: excedente.status,
          corridaTitularId: corridaTitular.id,
          motivo: excedente.motivo,
        });
      }
    }

    // Sincroniza status EM_CORRIDA nos veículos que possuem corrida ativa legítima
    const veiculosComCorridaAtiva = await tx.corrida.findMany({
      where: {
        status: { in: [...STATUS_CORRIDA_ATIVOS] },
        veiculoId: { not: null },
      },
      select: { veiculoId: true },
      distinct: ['veiculoId'],
    });
    const idsVeiculosAtivos = veiculosComCorridaAtiva.map((x) => x.veiculoId).filter(Boolean);
    if (idsVeiculosAtivos.length > 0) {
      await tx.veiculo.updateMany({
        where: {
          id: { in: idsVeiculosAtivos },
          status: STATUS_VEICULO.DISPONIVEL,
        },
        data: { status: STATUS_VEICULO.EM_CORRIDA, atualizadoEm: new Date() },
      });
    }

    return {
      diagnosticoInicial: diagnostico,
      saneadas,
      naoResolvidos,
      prontoParaIndiceUnico: naoResolvidos.length === 0,
    };
  });
}

module.exports = {
  diagnosticarConflitosVeiculoAtivo,
  sanearConflitosVeiculoAtivo,
};

