'use strict';
/**
 * corridas.repository.js — Repositório de corridas com Prisma ORM.
 */

const { Prisma } = require('@prisma/client');
const Corrida = require('./Corrida');
const prisma = require('../database/prisma');
const {
  STATUS_CORRIDA_ATIVOS,
  STATUS_VEICULO,
  STATUS_APROVACAO_VEICULO,
  TRANSICOES_CORRIDA,
  MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
} = require('../utils/constants');
const { ehUuid, paraNumeroOuNull, enderecoParaPrisma } = require('../utils/prismaMappers');

/** Timeout seguro para transações interativas em bancos serverless (ex.: Neon). */
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 30000 };

/**
 * Consulta única com LEFT JOIN para listagens de corridas:
 *  - Elimina múltiplos round-trips de `include` no banco remoto
 *  - Omite campos geométricos volumosos (polyline, rota_caminho, corrida_rotas)
 *    que não são utilizados nas telas de listagem nem confirmação de embarque.
 */
const SELECT_CORRIDA_LISTAGEM_SQL = Prisma.sql`
  SELECT
    c."id",
    c."usuario_id" AS "usuarioId",
    c."motorista_id" AS "motoristaId",
    c."veiculo_id" AS "veiculoId",
    c."origem_nome" AS "origemNome",
    c."destino_nome" AS "destinoNome",
    c."origem_lat" AS "origemLat",
    c."origem_lng" AS "origemLng",
    c."destino_lat" AS "destinoLat",
    c."destino_lng" AS "destinoLng",
    c."distancia_km" AS "distanciaKm",
    c."duracao_min" AS "duracaoMin",
    c."valor",
    c."data_horario" AS "dataHorario",
    c."status",
    c."criada_em" AS "criadaEm",
    c."atualizada_em" AS "atualizadaEm",
    c."classe",
    c."forma_pagamento" AS "formaPagamento",
    c."embarque_motorista_confirmado" AS "embarqueMotoristaConfirmado",
    c."embarque_motorista_em" AS "embarqueMotoristaEm",
    c."embarque_passageiro_confirmado" AS "embarquePassageiroConfirmado",
    c."embarque_passageiro_em" AS "embarquePassageiroEm",
    c."situacao_motorista" AS "situacaoMotorista",
    c."motorista_a_caminho_em" AS "motoristaACaminhoEm",
    c."prazo_confirmacao_em" AS "prazoConfirmacaoEm",
    c."motivo_cancelamento" AS "motivoCancelamento",
    c."cancelado_por" AS "canceladoPor",
    c."cancelada_em" AS "canceladaEm",
    v."id" AS "v_id",
    v."marca" AS "v_marca",
    v."modelo" AS "v_modelo",
    v."ano" AS "v_ano",
    v."placa" AS "v_placa",
    v."cor" AS "v_cor",
    v."porte" AS "v_porte",
    v."classe" AS "v_classe",
    v."status" AS "v_status",
    v."status_aprovacao" AS "v_statusAprovacao",
    v."motorista_id" AS "v_motoristaId"
  FROM "corridas" c
  LEFT JOIN "veiculos" v ON v."id" = c."veiculo_id"
`;

/** Erro interno usado para abortar (rollback) uma transacao com um motivo de dominio. */
class RollbackError extends Error {
  constructor(motivo) {
    super(motivo);
    this.motivo = motivo;
  }
}

// ---------- Helpers de mapeamento ----------

function formatarCorrida(cPrisma) {
  if (!cPrisma) return null;

  return new Corrida({
    ...cPrisma,
    origemLat: paraNumeroOuNull(cPrisma.origemLat),
    origemLng: paraNumeroOuNull(cPrisma.origemLng),
    destinoLat: paraNumeroOuNull(cPrisma.destinoLat),
    destinoLng: paraNumeroOuNull(cPrisma.destinoLng),
    distanciaKm: cPrisma.distanciaKm != null ? paraNumeroOuNull(cPrisma.distanciaKm) : 0,
    valor: cPrisma.valor != null ? paraNumeroOuNull(cPrisma.valor) : 0,
    rotaCaminho: cPrisma.rotaCaminho || [],
    classe: cPrisma.classe || 'NORMAL',
    formaPagamento: cPrisma.formaPagamento || 'DINHEIRO',

    // Mapeia rotas alternativas para ter as propriedades no formato da aplicação
    rotasAlternativas: (cPrisma.rotasAlternativas || []).map((r) => ({
      ...r,
      distanciaKm: r.distanciaKm != null ? paraNumeroOuNull(r.distanciaKm) : 0,
    })),
  });
}

function formatarCorridaListagemSql(row) {
  if (!row) return null;
  const veiculo = row.v_id ? {
    id: row.v_id,
    marca: row.v_marca,
    modelo: row.v_modelo,
    ano: row.v_ano,
    placa: row.v_placa,
    cor: row.v_cor,
    porte: row.v_porte,
    classe: row.v_classe,
    status: row.v_status,
    statusAprovacao: row.v_statusAprovacao,
    motoristaId: row.v_motoristaId,
  } : null;

  return formatarCorrida({
    id: row.id,
    usuarioId: row.usuarioId,
    motoristaId: row.motoristaId,
    veiculoId: row.veiculoId,
    veiculo,
    origemNome: row.origemNome,
    destinoNome: row.destinoNome,
    origemLat: row.origemLat,
    origemLng: row.origemLng,
    destinoLat: row.destinoLat,
    destinoLng: row.destinoLng,
    distanciaKm: row.distanciaKm,
    duracaoMin: row.duracaoMin,
    valor: row.valor,
    dataHorario: row.dataHorario,
    status: row.status,
    criadaEm: row.criadaEm,
    atualizadaEm: row.atualizadaEm,
    classe: row.classe,
    formaPagamento: row.formaPagamento,
    embarqueMotoristaConfirmado: row.embarqueMotoristaConfirmado,
    embarqueMotoristaEm: row.embarqueMotoristaEm,
    embarquePassageiroConfirmado: row.embarquePassageiroConfirmado,
    embarquePassageiroEm: row.embarquePassageiroEm,
    situacaoMotorista: row.situacaoMotorista,
    motoristaACaminhoEm: row.motoristaACaminhoEm,
    prazoConfirmacaoEm: row.prazoConfirmacaoEm,
    motivoCancelamento: row.motivoCancelamento,
    canceladoPor: row.canceladoPor,
    canceladaEm: row.canceladaEm,
  });
}

function rotaParaPrisma(rota, ordem, selecionada = false) {
  const distanciaMetros = rota.distanciaMetros || rota.distanceMeters || 0;
  const distanciaKm = rota.distanciaKm || (distanciaMetros > 0 ? parseFloat((distanciaMetros / 1000).toFixed(3)) : 0);
  const polyline = rota.polyline || rota.encodedPolyline || '';

  return {
    ordem,
    distanciaKm,
    distanciaMetros,
    polyline,
    selecionada,
  };
}

// ---------- CorridasRepository ----------

class CorridasRepository {
  async findAll(status = null) {
    const whereSql = status ? Prisma.sql`WHERE c."status" = ${status}` : Prisma.empty;
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      ${whereSql}
      ORDER BY c."criada_em" DESC
    `;
    return rows.map(formatarCorridaListagemSql);
  }

  /** Consulta leve apenas com os campos necessários para agregações do Dashboard (sem polylines/joins). */
  async findAllParaDashboard() {
    const corridas = await prisma.corrida.findMany({
      select: {
        status: true,
        valor: true,
        dataHorario: true,
        origemNome: true,
        destinoNome: true,
        veiculoId: true,
      },
    });
    return corridas.map((c) => ({
      ...c,
      valor: c.valor != null ? paraNumeroOuNull(c.valor) : 0,
    }));
  }

  async findById(id) {
    if (!ehUuid(id)) return undefined;
    const corrida = await prisma.corrida.findUnique({
      where: { id },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
    });
    return formatarCorrida(corrida) || undefined;
  }

  async findByUsuarioId(usuarioId) {
    if (!ehUuid(usuarioId)) return [];
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      WHERE c."usuario_id" = ${usuarioId}::uuid
      ORDER BY c."criada_em" DESC
    `;
    return rows.map(formatarCorridaListagemSql);
  }

  async findByMotoristaId(motoristaId) {
    if (!ehUuid(motoristaId)) return [];
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      WHERE c."motorista_id" = ${motoristaId}::uuid
      ORDER BY c."criada_em" DESC
    `;
    return rows.map(formatarCorridaListagemSql);
  }

  async findByMotoristaIdAndPeriodo(motoristaId, mes, ano) {
    if (!ehUuid(motoristaId)) return [];
    // Para buscar por período exato em Prisma, usamos limites de datas
    const dataInicial = new Date(ano, mes - 1, 1);
    const dataFinal = new Date(ano, mes, 1); // 1o dia do próximo mês

    // Projeção mínima para o relatório mensal (sem joins de rotas/veículo nem polylines)
    const corridas = await prisma.corrida.findMany({
      where: {
        motoristaId,
        dataHorario: {
          gte: dataInicial,
          lt: dataFinal,
        },
      },
      select: {
        id: true,
        origemNome: true,
        destinoNome: true,
        distanciaKm: true,
        duracaoMin: true,
        valor: true,
        status: true,
        dataHorario: true,
      },
      orderBy: { dataHorario: 'desc' },
    });
    return corridas.map((c) => ({
      ...c,
      distanciaKm: c.distanciaKm != null ? paraNumeroOuNull(c.distanciaKm) : 0,
      valor: c.valor != null ? paraNumeroOuNull(c.valor) : 0,
    }));
  }

  async findByUsuarioIdAndStatus(usuarioId, status) {
    if (!ehUuid(usuarioId)) return [];
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      WHERE c."usuario_id" = ${usuarioId}::uuid AND c."status" = ${status}
      ORDER BY c."criada_em" DESC
    `;
    return rows.map(formatarCorridaListagemSql);
  }

  async findByMotoristaIdAndStatus(motoristaId, status) {
    if (!ehUuid(motoristaId)) return [];
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      WHERE c."motorista_id" = ${motoristaId}::uuid AND c."status" = ${status}
      ORDER BY c."criada_em" DESC
    `;
    return rows.map(formatarCorridaListagemSql);
  }

  /**
   * Cancela automaticamente todas as corridas ainda em status SOLICITADA (sem motorista)
   * cujo dataHorario já foi atingido ou ultrapassado, atualizando também as notificações
   * NOVA_CORRIDA pendentes associadas.
   *
   * @param {Date} [agora=new Date()]
   * @returns {Promise<Array<{ id: string, usuarioId: string, origemNome: string, destinoNome: string, dataHorario: Date }>>}
   */
  async cancelarSolicitadasVencidas(agora = new Date()) {
    return prisma.$transaction(async (tx) => {
      const vencidas = await tx.$queryRaw`
        UPDATE "corridas"
        SET
          "status" = 'CANCELADA',
          "atualizada_em" = ${agora},
          "cancelado_por" = 'SISTEMA',
          "cancelada_em" = ${agora},
          "motivo_cancelamento" = ${MOTIVO_CANCELAMENTO_SEM_MOTORISTA}
        WHERE
          "status" = 'SOLICITADA'
          AND "motorista_id" IS NULL
          AND "data_horario" <= ${agora}
        RETURNING
          "id",
          "usuario_id" AS "usuarioId",
          "origem_nome" AS "origemNome",
          "destino_nome" AS "destinoNome",
          "data_horario" AS "dataHorario"
      `;

      if (vencidas.length === 0) return [];

      const ids = vencidas.map((c) => c.id);

      await tx.notificacao.updateMany({
        where: {
          tipo: 'NOVA_CORRIDA',
          referenciaId: { in: ids },
          acaoMotorista: 'PENDENTE',
        },
        data: {
          acaoMotorista: 'CANCELADA',
          lida: true,
        },
      });

      return vencidas;
    }, TRANSACTION_OPTIONS);
  }

  // ---------- Confirmação de embarque ----------

  /**
   * Motorista confirma o embarque: CONFIRMADA → EM_ANDAMENTO (idempotente por UPDATE condicional).
   * @returns {Promise<Corrida|null>} null quando a corrida não está mais em estado elegível
   */
  async confirmarEmbarqueMotorista(id, motoristaUsuarioId, agora = new Date()) {
    const r = await prisma.corrida.updateMany({
      where: {
        id,
        motoristaId: motoristaUsuarioId,
        status: 'CONFIRMADA',
        OR: [{ embarqueMotoristaConfirmado: null }, { embarqueMotoristaConfirmado: false }],
      },
      data: {
        status: 'EM_ANDAMENTO',
        embarqueMotoristaConfirmado: true,
        embarqueMotoristaEm: agora,
        situacaoMotorista: 'EMBARCADO',
        atualizadaEm: agora,
      },
    });
    if (r.count === 0) return null;
    return this.findById(id);
  }

  /**
   * Motorista informa "Estou a caminho": registra a situação e estende o prazo UMA única vez.
   * @returns {Promise<Corrida|null>} null quando já informado ou estado inelegível
   */
  async registrarMotoristaACaminho(id, motoristaUsuarioId, novoPrazo, agora = new Date()) {
    const r = await prisma.corrida.updateMany({
      where: {
        id,
        motoristaId: motoristaUsuarioId,
        status: 'CONFIRMADA',
        motoristaACaminhoEm: null,
        OR: [{ embarqueMotoristaConfirmado: null }, { embarqueMotoristaConfirmado: false }],
      },
      data: {
        situacaoMotorista: 'A_CAMINHO',
        motoristaACaminhoEm: agora,
        prazoConfirmacaoEm: novoPrazo,
        atualizadaEm: agora,
      },
    });
    if (r.count === 0) return null;
    return this.findById(id);
  }

  /**
   * Registra a resposta do passageiro (somente a coluna do passageiro; não toca na do motorista).
   * @returns {Promise<Corrida|null>} null quando já respondeu (confirmação definitiva) ou estado inelegível
   */
  async registrarEmbarquePassageiro(id, passageiroId, embarcou, agora = new Date()) {
    const r = await prisma.corrida.updateMany({
      where: {
        id,
        usuarioId: passageiroId,
        status: { in: ['CONFIRMADA', 'EM_ANDAMENTO'] },
        // "Não embarcou" pode ser corrigido para "embarcou", mas "embarcou" é definitivo
        OR: [{ embarquePassageiroConfirmado: null }, { embarquePassageiroConfirmado: false }],
      },
      data: {
        embarquePassageiroConfirmado: embarcou,
        embarquePassageiroEm: agora,
        atualizadaEm: agora,
      },
    });
    if (r.count === 0) return null;
    return this.findById(id);
  }

  /**
   * Cancela uma corrida CONFIRMADA (ainda sem embarque confirmado) registrando autor, motivo e data,
   * e libera o veículo na mesma transação. Idempotente: só a primeira chamada tem efeito.
   *
   * @param {string} id
   * @param {{ canceladoPor: string, motivo: string, motoristaUsuarioId?: string, passageiroId?: string,
   *           situacaoMotorista?: string, apenasSePrazoVencidoAte?: Date }} opcoes
   * @returns {Promise<Corrida|null>} null quando não havia o que cancelar
   */
  async cancelarConfirmadaComMotivo(id, opcoes, agora = new Date()) {
    const andConditions = [
      { OR: [{ embarqueMotoristaConfirmado: null }, { embarqueMotoristaConfirmado: false }] },
    ];
    if (opcoes.apenasSePrazoVencidoAte) {
      // Condições avaliadas atomicamente no UPDATE para impedir corrida contra "a caminho" / embarque
      const limite = opcoes.apenasSePrazoVencidoAte;
      andConditions.push(
        {
          OR: [
            { prazoConfirmacaoEm: { lte: limite } },
            { prazoConfirmacaoEm: null, dataHorario: { lte: new Date(limite.getTime() - opcoes.toleranciaMs) } },
          ],
        },
        { OR: [{ embarquePassageiroConfirmado: null }, { embarquePassageiroConfirmado: false }] }
      );
    }

    const where = {
      id,
      status: 'CONFIRMADA',
      AND: andConditions,
    };
    if (opcoes.motoristaUsuarioId) where.motoristaId = opcoes.motoristaUsuarioId;
    if (opcoes.passageiroId) where.usuarioId = opcoes.passageiroId;

    const data = {
      status: 'CANCELADA',
      canceladoPor: opcoes.canceladoPor,
      canceladaEm: agora,
      motivoCancelamento: opcoes.motivo,
      atualizadaEm: agora,
    };
    if (opcoes.situacaoMotorista) data.situacaoMotorista = opcoes.situacaoMotorista;
    if (opcoes.canceladoPor === 'MOTORISTA') {
      data.embarqueMotoristaConfirmado = false;
      data.embarqueMotoristaEm = agora;
    }

    try {
      const corrida = await prisma.$transaction(async (tx) => {
        const r = await tx.corrida.updateMany({ where, data });
        if (r.count === 0) throw new RollbackError('TRANSICAO_INVALIDA');

        const atual = await tx.corrida.findUnique({
          where: { id },
          include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
        });
        if (atual && atual.veiculoId) {
          const outrasAtivas = await tx.corrida.count({
            where: { veiculoId: atual.veiculoId, id: { not: id }, status: { in: [...STATUS_CORRIDA_ATIVOS] } },
          });
          if (outrasAtivas === 0) {
            await tx.veiculo.updateMany({
              where: { id: atual.veiculoId, status: STATUS_VEICULO.EM_CORRIDA },
              data: { status: STATUS_VEICULO.DISPONIVEL, atualizadoEm: agora },
            });
          }
        }
        return atual;
      }, TRANSACTION_OPTIONS);
      return formatarCorrida(corrida);
    } catch (error) {
      if (error instanceof RollbackError) return null;
      throw error;
    }
  }

  /**
   * Lista candidatas ao cancelamento automático por ausência de confirmação:
   * CONFIRMADA, sem embarque confirmado por ninguém e com prazo vencido
   * (prazoConfirmacaoEm, ou dataHorario + tolerância quando ainda não definido).
   */
  async findConfirmadasComPrazoVencido(agora, toleranciaMs) {
    const corridas = await prisma.corrida.findMany({
      where: {
        status: 'CONFIRMADA',
        AND: [
          { OR: [{ embarqueMotoristaConfirmado: null }, { embarqueMotoristaConfirmado: false }] },
          { OR: [{ embarquePassageiroConfirmado: null }, { embarquePassageiroConfirmado: false }] },
          {
            OR: [
              { prazoConfirmacaoEm: { lte: agora } },
              { prazoConfirmacaoEm: null, dataHorario: { lte: new Date(agora.getTime() - toleranciaMs) } },
            ],
          },
        ],
      },
      select: {
        id: true, usuarioId: true, motoristaId: true, origemNome: true, destinoNome: true,
      },
    });
    return corridas;
  }

  async create(dados) {
    const rotas = dados.rotasAlternativas || [];
    const rotasCriacao = rotas
      .map((r, i) => rotaParaPrisma(r, i, i === 0))
      .filter((r) => !!r.polyline);

    const novaCorrida = await prisma.corrida.create({
      data: {
        usuario: { connect: { id: dados.usuarioId } },
        motorista: dados.motoristaId ? { connect: { id: dados.motoristaId } } : undefined,
        veiculo: dados.veiculoId ? { connect: { id: dados.veiculoId } } : undefined,

        origemNome: dados.origemNome,
        destinoNome: dados.destinoNome,
        origemLat: dados.origemLat ?? null, // ?? preserva 0 (coordenada valida)
        origemLng: dados.origemLng ?? null,
        destinoLat: dados.destinoLat ?? null,
        destinoLng: dados.destinoLng ?? null,

        rotaCaminho: Array.isArray(dados.rotaCaminho) ? dados.rotaCaminho : [],
        polyline: dados.polyline || null,

        distanciaKm: dados.distanciaKm,
        duracaoMin: dados.duracaoMin ?? null,
        valor: dados.valor, // Valor obrigatorio — deve ter sido calculado e validado pelo Service
        classe: dados.classe || 'NORMAL',
        formaPagamento: dados.formaPagamento || 'DINHEIRO',
        dataHorario: dados.dataHorario ? new Date(dados.dataHorario) : new Date(),
        status: dados.status || 'SOLICITADA',

        origemEndereco: {
          create: enderecoParaPrisma(dados.origemEndereco, dados.origemLat, dados.origemLng),
        },
        destinoEndereco: {
          create: enderecoParaPrisma(dados.destinoEndereco, dados.destinoLat, dados.destinoLng),
        },
        rotasAlternativas: {
          create: rotasCriacao,
        },
      },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
    });

    return formatarCorrida(novaCorrida);
  }

  /**
   * Aceita a corrida reservando o veículo de forma ATÔMICA (uma única transação):
   *   1. Reserva o veículo com UPDATE condicional (APROVADO + DISPONIVEL + do motorista → EM_CORRIDA).
   *      Em PostgreSQL esse UPDATE trava a linha do veículo: uma segunda transação concorrente
   *      espera o commit/rollback da primeira e reavalia o WHERE, de modo que apenas uma reserva vence.
   *   2. Confere que o veículo não possui outra corrida ativa (consistência com dados legados).
   *   3. Atualiza a corrida com UPDATE condicional (status = SOLICITADA → CONFIRMADA).
   * Qualquer falha reverte tudo (veículo volta ao estado anterior).
   * Notificações NÃO acontecem aqui, para não manter a transação aberta.
   *
   * @returns {Promise<{ ok: true, corrida: Corrida } | { ok: false, motivo: string }>}
   *          motivo: 'VEICULO_INDISPONIVEL' | 'VEICULO_COM_CORRIDA_ATIVA' | 'CORRIDA_INDISPONIVEL'
   */
  async aceitarComReservaDeVeiculo(corridaId, motoristaUsuarioId, veiculoId) {
    const { de, para } = TRANSICOES_CORRIDA.aceitar;
    try {
      const corrida = await prisma.$transaction(async (tx) => {
        const agora = new Date();

        const reservado = await tx.veiculo.updateMany({
          where: {
            id: veiculoId,
            motoristaId: motoristaUsuarioId,
            statusAprovacao: STATUS_APROVACAO_VEICULO.APROVADO,
            status: STATUS_VEICULO.DISPONIVEL,
          },
          data: { status: STATUS_VEICULO.EM_CORRIDA, atualizadoEm: agora },
        });
        if (reservado.count === 0) throw new RollbackError('VEICULO_INDISPONIVEL');

        const ativas = await tx.corrida.count({
          where: { veiculoId, status: { in: [...STATUS_CORRIDA_ATIVOS] } },
        });
        if (ativas > 0) throw new RollbackError('VEICULO_COM_CORRIDA_ATIVA');

        const atualizada = await tx.corrida.updateMany({
          where: { id: corridaId, status: { in: [...de] } },
          data: { motoristaId: motoristaUsuarioId, veiculoId, status: para, atualizadaEm: agora },
        });
        if (atualizada.count === 0) throw new RollbackError('CORRIDA_INDISPONIVEL');

        return tx.corrida.findUnique({
          where: { id: corridaId },
          include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
        });
      }, TRANSACTION_OPTIONS);
      return { ok: true, corrida: formatarCorrida(corrida) };
    } catch (error) {
      if (error instanceof RollbackError) return { ok: false, motivo: error.motivo };
      // Backstop do índice único parcial (um veículo por corrida ativa)
      if (error && error.code === 'P2002') return { ok: false, motivo: 'VEICULO_COM_CORRIDA_ATIVA' };
      throw error;
    }
  }

  /**
   * Realiza uma transição de estado da corrida (cancelar/finalizar) de forma atômica,
   * liberando o veículo (EM_CORRIDA → DISPONIVEL) na mesma transação.
   * O UPDATE condicional (status IN `de`) garante que só uma de duas operações concorrentes
   * (ex.: cancelar × finalizar) seja aplicada. O veículo só é liberado se não houver outra
   * corrida ativa associada a ele.
   *
   * @param {string} id
   * @param {'cancelar'|'finalizar'} transicao chave de TRANSICOES_CORRIDA
   * @returns {Promise<Corrida|null>} null quando a corrida não está em estado de origem permitido
   */
  async transicionarComLiberacaoDeVeiculo(id, transicao, metadados = {}) {
    const regra = TRANSICOES_CORRIDA[transicao];
    if (!regra || transicao === 'aceitar') throw new Error('Transicao de corrida desconhecida: ' + transicao);

    try {
      const corrida = await prisma.$transaction(async (tx) => {
        const agora = new Date();
        const r = await tx.corrida.updateMany({
          where: { id, status: { in: [...regra.de] } },
          data: { status: regra.para, atualizadaEm: agora, ...metadados },
        });
        if (r.count === 0) throw new RollbackError('TRANSICAO_INVALIDA');

        const atual = await tx.corrida.findUnique({
          where: { id },
          include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
        });

        if (atual && atual.veiculoId) {
          const outrasAtivas = await tx.corrida.count({
            where: { veiculoId: atual.veiculoId, id: { not: id }, status: { in: [...STATUS_CORRIDA_ATIVOS] } },
          });
          if (outrasAtivas === 0) {
            await tx.veiculo.updateMany({
              where: { id: atual.veiculoId, status: STATUS_VEICULO.EM_CORRIDA },
              data: { status: STATUS_VEICULO.DISPONIVEL, atualizadoEm: agora },
            });
          }
        }
        return atual;
      }, TRANSACTION_OPTIONS);
      return formatarCorrida(corrida);
    } catch (error) {
      if (error instanceof RollbackError) return null;
      throw error;
    }
  }
}

module.exports = new CorridasRepository();
