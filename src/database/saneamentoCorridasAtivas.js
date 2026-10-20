'use strict';
/**
 * saneamentoCorridasAtivas.js — Diagnóstico e saneamento explícito, seguro, transacional
 * e auditável de corridas ativas conflitantes associadas ao mesmo veículo.
 *
 * Princípios de integridade (Seções 3 e 4):
 * 1. NUNCA marca corridas duplicadas como FINALIZADA ou CANCELADA sem comprovação,
 *    preservando integralmente o histórico real de viagens.
 * 2. Quando um veículo possui apenas uma corrida EM_ANDAMENTO e reservas adicionais em
 *    CONFIRMADA (ou múltiplas reservas em CONFIRMADA sem viagem iniciada), a reserva
 *    CONFIRMADA excedente (ainda não iniciada) retorna para SOLICITADA (motoristaId = null,
 *    veiculoId = null) com registro atômico em `auditoria`.
 * 3. Quando há conflito envolvendo corrida(s) EM_ANDAMENTO excedente(s) / ambígua(s),
 *    NÃO escolhe nem altera automaticamente o estado da corrida em andamento sem
 *    resolução explícita e justificada (`resolucoesExplicitas`).
 * 4. Na realocação (`REALOCAR_VEICULO`), valida dentro da mesma transação:
 *    - Existência, aprovação, disponibilidade e compatibilidade de porte/classe do veículo;
 *    - Existência, perfil MOTORISTA, aprovação cadastral e vínculo do motorista com o veículo;
 *    - Ausência de outra corrida ativa para o veículo e para o motorista de destino;
 *    - Status válido da corrida e justificativa obrigatória;
 *    - Reserva condicional atômica (`updateMany` com pré-condições) para impedir corrida
 *      de concorrência entre duas execuções simultâneas.
 */

const prismaDefault = require('./prisma');
const AppError = require('../utils/AppError');
const {
  STATUS_CORRIDA_ATIVOS,
  STATUS_VEICULO,
  PORTE_PARA_CLASSE,
} = require('../utils/constants');

const ACOES_RESOLUCAO_VALIDAS = new Set([
  'DESVINCULAR_PARA_SOLICITADA',
  'REALOCAR_VEICULO',
]);

function compararPrioridadeTitular(a, b) {
  const pesoA = a.status === 'EM_ANDAMENTO' ? 0 : 1;
  const pesoB = b.status === 'EM_ANDAMENTO' ? 0 : 1;
  if (pesoA !== pesoB) return pesoA - pesoB;

  const tA = new Date(a.criadaEm).getTime();
  const tB = new Date(b.criadaEm).getTime();
  if (tA !== tB) return tA - tB;

  return String(a.id).localeCompare(String(b.id));
}

function selecionarTitularEExcedentes(listaCorridas, resolucoesExplicitas = {}) {
  const ordenadas = [...listaCorridas].sort(compararPrioridadeTitular);

  // Se houver múltiplas corridas EM_ANDAMENTO e o operador especificou resolução explícita
  // para a primeira, permite que a corrida EM_ANDAMENTO sem resolução explícita permaneça como titular.
  const idxTitularSemResolucao = ordenadas.findIndex(
    (c) => !Object.prototype.hasOwnProperty.call(resolucoesExplicitas, c.id)
  );
  if (idxTitularSemResolucao > 0) {
    const candidatasTitular = ordenadas[idxTitularSemResolucao];
    const primeira = ordenadas[0];
    if (candidatasTitular.status === 'EM_ANDAMENTO' || primeira.status === candidatasTitular.status) {
      const [titularEscolhida] = ordenadas.splice(idxTitularSemResolucao, 1);
      return { corridaTitular: titularEscolhida, corridasExcedentes: ordenadas };
    }
  }

  const [corridaTitular, ...corridasExcedentes] = ordenadas;
  return { corridaTitular, corridasExcedentes };
}

/**
 * Inspeciona o banco e identifica todos os veículos vinculados a mais de uma corrida ativa.
 * Não modifica nenhum registro.
 */
async function diagnosticarConflitosVeiculoAtivo(db = prismaDefault, resolucoesExplicitas = {}) {
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
    const { corridaTitular, corridasExcedentes } = selecionarTitularEExcedentes(
      lista,
      resolucoesExplicitas
    );
    const totalEmAndamento = lista.filter((c) => c.status === 'EM_ANDAMENTO').length;

    conflitos.push({
      veiculoId,
      conflitoEmAndamentoAmbiguo: totalEmAndamento > 1,
      corridaTitular: {
        id: corridaTitular.id,
        status: corridaTitular.status,
        motoristaId: corridaTitular.motoristaId,
        usuarioId: corridaTitular.usuarioId,
        classe: corridaTitular.classe,
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

function validarFormatoResolucaoExplicita(corridaId, resolucao) {
  if (!corridaId || typeof corridaId !== 'string' || corridaId.trim() === '') {
    throw new AppError('Identificador da corrida inválido na resolução explícita.', 400);
  }
  if (!resolucao || typeof resolucao !== 'object' || Array.isArray(resolucao)) {
    throw new AppError(`Resolução explícita inválida para a corrida ${corridaId}.`, 400);
  }
  if (!ACOES_RESOLUCAO_VALIDAS.has(resolucao.acao)) {
    throw new AppError(
      `Ação de saneamento inválida para a corrida ${corridaId}: use DESVINCULAR_PARA_SOLICITADA ou REALOCAR_VEICULO.`,
      400
    );
  }
  if (typeof resolucao.justificativa !== 'string' || resolucao.justificativa.trim().length === 0) {
    throw new AppError(
      `Justificativa é obrigatória para a resolução explícita da corrida ${corridaId}.`,
      400
    );
  }
  if (resolucao.acao === 'REALOCAR_VEICULO') {
    if (typeof resolucao.veiculoId !== 'string' || resolucao.veiculoId.trim() === '') {
      throw new AppError(
        `veiculoId de destino é obrigatório para realocar a corrida ${corridaId}.`,
        400
      );
    }
    if (typeof resolucao.motoristaId !== 'string' || resolucao.motoristaId.trim() === '') {
      throw new AppError(
        `motoristaId de destino é obrigatório para realocar a corrida ${corridaId}.`,
        400
      );
    }
  }
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
  const { resolucoesExplicitas = {}, usuarioId = null, perfil = 'SISTEMA' } = opcoes || {};

  if (
    resolucoesExplicitas === null ||
    typeof resolucoesExplicitas !== 'object' ||
    Array.isArray(resolucoesExplicitas)
  ) {
    throw new AppError('resolucoesExplicitas deve ser um objeto mapeando corridaId para a resolução.', 400);
  }

  for (const [corridaId, resolucao] of Object.entries(resolucoesExplicitas)) {
    validarFormatoResolucaoExplicita(corridaId, resolucao);
  }

  return db.$transaction(
    async (tx) => {
    const diagnostico = await diagnosticarConflitosVeiculoAtivo(tx, resolucoesExplicitas);
    const idsExcedentesEmConflito = new Set();
    for (const c of diagnostico.conflitos) {
      for (const exc of c.corridasExcedentes) {
        idsExcedentesEmConflito.add(exc.id);
      }
    }

    // Valida resoluções explícitas apontando para corridas fora da lista de excedentes atuais
    for (const [corridaId, resolucao] of Object.entries(resolucoesExplicitas)) {
      if (idsExcedentesEmConflito.has(corridaId)) continue;

      const corridaAlvo = await tx.corrida.findUnique({ where: { id: corridaId } });
      if (!corridaAlvo) {
        throw new AppError(`Corrida ${corridaId} não encontrada para saneamento.`, 404);
      }

      // Verifica se já foi saneada anteriormente com sucesso (idempotência em reexecuções)
      const auditoriaPrevia = await tx.auditoria.findFirst({
        where: {
          entidade: 'Corrida',
          entidadeId: corridaId,
          resultado: 'SUCESSO',
          acao: {
            in: [
              'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
              'SANEAMENTO_REALOCACAO_VEICULO_ATIVO',
            ],
          },
        },
        orderBy: { criadoEm: 'desc' },
      });

      if (auditoriaPrevia) {
        continue;
      }

      if (!STATUS_CORRIDA_ATIVOS.includes(corridaAlvo.status)) {
        throw new AppError(
          `A corrida ${corridaId} possui status ${corridaAlvo.status}, que não permite a operação de saneamento (${resolucao.acao}).`,
          409
        );
      }
    }

    const saneadas = [];
    const naoResolvidos = [];

    for (const conflito of diagnostico.conflitos) {
      const { veiculoId, corridaTitular, corridasExcedentes } = conflito;

      for (const excedente of corridasExcedentes) {
        const resolucao = resolucoesExplicitas[excedente.id];

        // Releitura dentro da transação para garantir estado fresco
        const corridaAtual = await tx.corrida.findUnique({ where: { id: excedente.id } });
        if (
          !corridaAtual ||
          !STATUS_CORRIDA_ATIVOS.includes(corridaAtual.status) ||
          corridaAtual.veiculoId !== veiculoId
        ) {
          throw new AppError(
            `O estado da corrida ${excedente.id} não permite mais a operação de saneamento ou foi alterado concorrentemente.`,
            409
          );
        }

        const dadosAnteriores = {
          status: corridaAtual.status,
          motoristaId: corridaAtual.motoristaId,
          veiculoId: corridaAtual.veiculoId,
          atualizadaEm: corridaAtual.atualizadaEm,
        };

        // Caso 1: Corrida CONFIRMADA (ainda não iniciada) ou resolução explícita DESVINCULAR_PARA_SOLICITADA
        const podeDesvincular =
          (corridaAtual.status === 'CONFIRMADA' && !resolucao) ||
          (resolucao && resolucao.acao === 'DESVINCULAR_PARA_SOLICITADA');

        if (podeDesvincular) {
          const justificativa =
            resolucao?.justificativa?.trim() ||
            `Saneamento de reserva duplicada: veículo ${veiculoId} já estava alocado à corrida titular ${corridaTitular.id} (${corridaTitular.status}). Corrida retornada para SOLICITADA sem alterar histórico de conclusão.`;

          const agora = new Date();
          const updDesvincular = await tx.corrida.updateMany({
            where: {
              id: corridaAtual.id,
              veiculoId,
              status: corridaAtual.status,
            },
            data: {
              status: 'SOLICITADA',
              motoristaId: null,
              veiculoId: null,
              atualizadaEm: agora,
            },
          });

          if (updDesvincular.count !== 1) {
            throw new AppError(
              `Conflito de concorrência ao desvincular a corrida ${corridaAtual.id}.`,
              409
            );
          }

          const dadosNovos = {
            status: 'SOLICITADA',
            motoristaId: null,
            veiculoId: null,
            atualizadaEm: agora,
          };

          await tx.auditoria.updateMany({
            where: {
              entidade: 'Corrida',
              entidadeId: corridaAtual.id,
              acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
              resultado: 'PENDENTE',
            },
            data: {
              resultado: 'RESOLVIDO',
              dadosNovos,
            },
          });

          await tx.auditoria.create({
            data: {
              usuarioId,
              perfil,
              acao: 'SANEAMENTO_CONFLITO_VEICULO_ATIVO',
              modulo: 'CORRIDAS',
              entidade: 'Corrida',
              entidadeId: corridaAtual.id,
              descricao: justificativa,
              dadosAnteriores,
              dadosNovos,
              resultado: 'SUCESSO',
            },
          });

          saneadas.push({
            corridaId: corridaAtual.id,
            veiculoConflitanteId: veiculoId,
            corridaTitularId: corridaTitular.id,
            acaoAplicada: 'DESVINCULAR_PARA_SOLICITADA',
            dadosAnteriores,
            dadosNovos,
            justificativa,
          });
          continue;
        }

        // Caso 2: Realocação explícita para outro veículo disponível, compatível e com motorista autorizado
        if (resolucao && resolucao.acao === 'REALOCAR_VEICULO') {
          const veiculoDestinoId = resolucao.veiculoId.trim();
          const motoristaDestinoId = resolucao.motoristaId.trim();
          const justificativa = resolucao.justificativa.trim();

          if (veiculoDestinoId === veiculoId) {
            throw new AppError(
              'O veículo de destino para realocação deve ser diferente do veículo em conflito.',
              409
            );
          }

          // 1 a 5. Consultas de validação em paralelo dentro da transação
          const [
            veiculoDestino,
            usuarioMotorista,
            cadastroMotorista,
            corridasAtivasMotorista,
            ativasNoDestinoAntes,
          ] = await Promise.all([
            tx.veiculo.findUnique({ where: { id: veiculoDestinoId } }),
            tx.usuario.findUnique({ where: { id: motoristaDestinoId } }),
            tx.motorista.findUnique({ where: { usuarioId: motoristaDestinoId } }),
            tx.corrida.count({
              where: {
                motoristaId: motoristaDestinoId,
                status: { in: [...STATUS_CORRIDA_ATIVOS] },
                id: { not: corridaAtual.id },
              },
            }),
            tx.corrida.count({
              where: {
                veiculoId: veiculoDestinoId,
                status: { in: [...STATUS_CORRIDA_ATIVOS] },
                id: { not: corridaAtual.id },
              },
            }),
          ]);

          if (!veiculoDestino || veiculoDestino.statusAprovacao === 'EXCLUIDO') {
            throw new AppError(`Veículo de destino ${veiculoDestinoId} não encontrado.`, 404);
          }
          if (veiculoDestino.statusAprovacao !== 'APROVADO') {
            throw new AppError(
              `Veículo de destino ${veiculoDestinoId} não está aprovado (statusAprovacao=${veiculoDestino.statusAprovacao}).`,
              409
            );
          }

          const classeEsperadaPorPorte = PORTE_PARA_CLASSE[veiculoDestino.porte];
          if (!classeEsperadaPorPorte || classeEsperadaPorPorte !== veiculoDestino.classe) {
            throw new AppError(
              `Veículo de destino ${veiculoDestinoId} possui porte/classe inconsistentes (${veiculoDestino.porte}/${veiculoDestino.classe}).`,
              409
            );
          }
          if (veiculoDestino.classe !== corridaAtual.classe) {
            throw new AppError(
              `Veículo de destino (${veiculoDestino.classe}) é incompatível com a classe exigida pela corrida (${corridaAtual.classe}).`,
              409
            );
          }

          if (!usuarioMotorista || usuarioMotorista.perfil !== 'MOTORISTA' || !cadastroMotorista) {
            throw new AppError(`Motorista de destino ${motoristaDestinoId} não encontrado.`, 404);
          }
          if (cadastroMotorista.statusCadastro !== 'APROVADO') {
            throw new AppError(
              `Motorista de destino ${motoristaDestinoId} não está aprovado para operar (statusCadastro=${cadastroMotorista.statusCadastro}).`,
              409
            );
          }
          if (veiculoDestino.motoristaId !== motoristaDestinoId) {
            throw new AppError(
              `Motorista ${motoristaDestinoId} não está associado/autorizado para operar o veículo ${veiculoDestinoId}.`,
              403
            );
          }

          if (corridasAtivasMotorista > 0) {
            throw new AppError(
              `Motorista de destino ${motoristaDestinoId} já possui outra corrida ativa.`,
              409
            );
          }

          if (veiculoDestino.status !== STATUS_VEICULO.DISPONIVEL || ativasNoDestinoAntes > 0) {
            throw new AppError(
              `Veículo de destino ${veiculoDestinoId} já está ocupado ou indisponível.`,
              409
            );
          }

          const agora = new Date();
          const reservaVeiculo = await tx.veiculo.updateMany({
            where: {
              id: veiculoDestinoId,
              statusAprovacao: 'APROVADO',
              status: STATUS_VEICULO.DISPONIVEL,
              motoristaId: motoristaDestinoId,
              classe: corridaAtual.classe,
            },
            data: {
              status: STATUS_VEICULO.EM_CORRIDA,
              atualizadoEm: agora,
            },
          });
          if (reservaVeiculo.count !== 1) {
            throw new AppError(
              `Veículo de destino ${veiculoDestinoId} foi reservado concorrentemente por outra operação.`,
              409
            );
          }

          // Revalida após o lock do UPDATE que nenhuma corrida ativa foi vinculada ao veículo ou motorista de destino
          const conflitoPosReserva = await tx.corrida.count({
            where: {
              id: { not: corridaAtual.id },
              status: { in: [...STATUS_CORRIDA_ATIVOS] },
              OR: [{ veiculoId: veiculoDestinoId }, { motoristaId: motoristaDestinoId }],
            },
          });
          if (conflitoPosReserva > 0) {
            throw new AppError(
              `Conflito concorrente detectado ao alocar o veículo ${veiculoDestinoId} ou motorista ${motoristaDestinoId}.`,
              409
            );
          }

          const updCorrida = await tx.corrida.updateMany({
            where: {
              id: corridaAtual.id,
              veiculoId,
              status: corridaAtual.status,
            },
            data: {
              veiculoId: veiculoDestinoId,
              motoristaId: motoristaDestinoId,
              atualizadaEm: agora,
            },
          });
          if (updCorrida.count !== 1) {
            throw new AppError(
              `O estado da corrida ${corridaAtual.id} foi alterado concorrentemente durante a realocação.`,
              409
            );
          }

          const dadosNovos = {
            status: corridaAtual.status,
            motoristaId: motoristaDestinoId,
            veiculoId: veiculoDestinoId,
            atualizadaEm: agora,
          };

          await tx.auditoria.updateMany({
            where: {
              entidade: 'Corrida',
              entidadeId: corridaAtual.id,
              acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
              resultado: 'PENDENTE',
            },
            data: {
              resultado: 'RESOLVIDO',
              dadosNovos,
            },
          });

          await tx.auditoria.create({
            data: {
              usuarioId,
              perfil,
              acao: 'SANEAMENTO_REALOCACAO_VEICULO_ATIVO',
              modulo: 'CORRIDAS',
              entidade: 'Corrida',
              entidadeId: corridaAtual.id,
              descricao: justificativa,
              dadosAnteriores,
              dadosNovos,
              resultado: 'SUCESSO',
            },
          });

          saneadas.push({
            corridaId: corridaAtual.id,
            veiculoConflitanteId: veiculoId,
            corridaTitularId: corridaTitular.id,
            acaoAplicada: 'REALOCAR_VEICULO',
            dadosAnteriores,
            dadosNovos,
            justificativa,
          });
          continue;
        }

        // Caso 3: Conflito EM_ANDAMENTO sem resolução explícita — preserva o estado e registra pendência sem duplicar
        const pendenciaExistente = await tx.auditoria.findFirst({
          where: {
            entidade: 'Corrida',
            entidadeId: corridaAtual.id,
            acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
            resultado: 'PENDENTE',
          },
        });

        if (!pendenciaExistente) {
          await tx.auditoria.create({
            data: {
              usuarioId,
              perfil,
              acao: 'CONFLITO_VEICULO_ATIVO_NAO_RESOLVIDO',
              modulo: 'CORRIDAS',
              entidade: 'Corrida',
              entidadeId: corridaAtual.id,
              descricao: `Conflito não resolvido automaticamente: corrida ${corridaAtual.id} (${corridaAtual.status}) compartilha o veículo ${veiculoId} com a corrida titular ${corridaTitular.id} (${corridaTitular.status}).`,
              dadosAnteriores,
              resultado: 'PENDENTE',
            },
          });
        }

        naoResolvidos.push({
          corridaId: corridaAtual.id,
          veiculoId,
          status: corridaAtual.status,
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
    },
    { maxWait: 15000, timeout: 30000 }
  );
}

module.exports = {
  diagnosticarConflitosVeiculoAtivo,
  sanearConflitosVeiculoAtivo,
};
