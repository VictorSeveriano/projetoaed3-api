'use strict';
/**
 * corridas.repository.js — Repositório de corridas com Prisma ORM e SQL parametrizado.
 */

const { Prisma } = require('@prisma/client');
const Corrida = require('./Corrida');
const prisma = require('../database/prisma');
const corridaEventosRepository = require('./corridaEventos.repository');
const {
  STATUS_CORRIDA,
  STATUS_CORRIDA_ATIVOS,
  STATUS_VEICULO,
  STATUS_APROVACAO_VEICULO,
  TRANSICOES_CORRIDA,
  ORIGEM_CANCELAMENTO,
  TIPO_EVENTO_CORRIDA,
  TOLERANCIA_ATRASO_MIN,
  MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
  MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO,
} = require('../utils/constants');
const { foiExpiradaAutomaticamente } = require('./indicadorAtraso');
const { ehUuid, paraNumeroOuNull, enderecoParaPrisma } = require('../utils/prismaMappers');

/** Timeout seguro para transações interativas em bancos serverless (ex.: Neon). */
const TRANSACTION_OPTIONS = { maxWait: 15000, timeout: 30000 };

/**
 * Consulta única com LEFT JOIN para listagens e histórico de corridas:
 *  - Elimina múltiplos round-trips de `include` no banco remoto
 *  - Traz dados públicos de identificação de veículo, passageiro e motorista
 *    (nunca expõe senha, CPF ou dados sensíveis)
 *  - Omite campos geométricos volumosos (polyline, rota_caminho, corrida_rotas)
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
    c."aceita_em" AS "aceitaEm",
    c."finalizada_em" AS "finalizadaEm",
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
    v."motorista_id" AS "v_motoristaId",
    u."id" AS "p_id",
    u."nome" AS "p_nome",
    u."usuario" AS "p_usuario",
    m."id" AS "m_id",
    m."nome" AS "m_nome",
    m."usuario" AS "m_usuario"
  FROM "corridas" c
  LEFT JOIN "veiculos" v ON v."id" = c."veiculo_id"
  LEFT JOIN "usuarios" u ON u."id" = c."usuario_id"
  LEFT JOIN "usuarios" m ON m."id" = c."motorista_id"
`;

/** Expressão SQL reutilizável que caracteriza expiração automática pelo sistema. */
const CONDICAO_EXPIRADA_SQL = Prisma.sql`(
  c."status" = 'CANCELADA'
  AND c."cancelado_por" = 'SISTEMA'
  AND (
    c."motivo_cancelamento" = ${MOTIVO_CANCELAMENTO_SEM_MOTORISTA}
    OR c."motivo_cancelamento" = ${MOTIVO_CANCELAMENTO_AUSENCIA_CONFIRMACAO}
    OR c."motivo_cancelamento" ILIKE 'Cancelada automaticamente pelo sistema%'
  )
)`;

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

  const passageiro = cPrisma.passageiro || (cPrisma.usuario ? {
    id: cPrisma.usuario.id,
    nome: cPrisma.usuario.nome,
    usuario: cPrisma.usuario.usuario,
  } : undefined);

  const motorista = cPrisma.motorista && cPrisma.motorista.nome ? {
    id: cPrisma.motorista.id,
    nome: cPrisma.motorista.nome,
    usuario: cPrisma.motorista.usuario,
  } : undefined;

  return new Corrida({
    ...cPrisma,
    ...(passageiro !== undefined ? { passageiro } : {}),
    ...(motorista !== undefined ? { motorista } : {}),
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

  const passageiro = row.p_id ? {
    id: row.p_id,
    nome: row.p_nome,
    usuario: row.p_usuario,
  } : null;

  const motorista = row.m_id ? {
    id: row.m_id,
    nome: row.m_nome,
    usuario: row.m_usuario,
  } : null;

  return formatarCorrida({
    id: row.id,
    usuarioId: row.usuarioId,
    motoristaId: row.motoristaId,
    veiculoId: row.veiculoId,
    veiculo,
    passageiro,
    motorista,
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
    aceitaEm: row.aceitaEm ?? null,
    finalizadaEm: row.finalizadaEm ?? null,
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

/**
 * Constrói cláusula SQL `WHERE` parametrizada para consulta avançada de corridas/histórico.
 * Aplica isolamento estrito por perfil diretamente na query SQL.
 */
function construirWhereFiltrosSql(filtros, agora = new Date()) {
  const condicoes = [];
  const limiteAtraso = new Date(agora.getTime() - TOLERANCIA_ATRASO_MIN * 60 * 1000);

  // 1. Isolamento obrigatório por perfil
  if (filtros.perfil === 'USUARIO') {
    condicoes.push(Prisma.sql`c."usuario_id" = ${filtros.usuarioLogadoId}::uuid`);
  } else if (filtros.perfil === 'MOTORISTA') {
    condicoes.push(Prisma.sql`c."motorista_id" = ${filtros.usuarioLogadoId}::uuid`);
  }

  // 2. Escopo organizacional (ATIVAS x HISTORICO x TODAS)
  if (filtros.escopo === 'ATIVAS') {
    condicoes.push(Prisma.sql`c."status" IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO')`);
  } else if (filtros.escopo === 'HISTORICO') {
    condicoes.push(Prisma.sql`c."status" IN ('FINALIZADA', 'CANCELADA')`);
  }

  // 3. Busca por ID (UUID completo ou prefixo curto sem '#')
  if (filtros.id) {
    const idLimpo = filtros.id.replace(/^#/, '').trim();
    if (ehUuid(idLimpo)) {
      condicoes.push(Prisma.sql`c."id" = ${idLimpo}::uuid`);
    } else {
      condicoes.push(Prisma.sql`CAST(c."id" AS TEXT) ILIKE ${idLimpo + '%'}`);
    }
  }

  // 4. Status explícito
  if (filtros.status) {
    condicoes.push(Prisma.sql`c."status" = ${filtros.status}`);
  }

  // 5. Período inicial e final (dataHorario programado)
  if (filtros.dataInicio) {
    condicoes.push(Prisma.sql`c."data_horario" >= ${filtros.dataInicio}`);
  }
  if (filtros.dataFim) {
    condicoes.push(Prisma.sql`c."data_horario" <= ${filtros.dataFim}`);
  }

  // 6. Origem e Destino
  if (filtros.origem) {
    condicoes.push(Prisma.sql`c."origem_nome" ILIKE ${'%' + filtros.origem + '%'}`);
  }
  if (filtros.destino) {
    condicoes.push(Prisma.sql`c."destino_nome" ILIKE ${'%' + filtros.destino + '%'}`);
  }

  // 7. Motorista (UUID ou nome/handle)
  if (filtros.motorista) {
    if (ehUuid(filtros.motorista)) {
      condicoes.push(Prisma.sql`c."motorista_id" = ${filtros.motorista}::uuid`);
    } else {
      const padrao = '%' + filtros.motorista + '%';
      condicoes.push(Prisma.sql`(m."nome" ILIKE ${padrao} OR m."usuario" ILIKE ${padrao})`);
    }
  }

  // 8. Passageiro (UUID ou nome/handle — respeitando o filtro de posse já aplicado acima)
  if (filtros.passageiro) {
    if (ehUuid(filtros.passageiro)) {
      condicoes.push(Prisma.sql`c."usuario_id" = ${filtros.passageiro}::uuid`);
    } else {
      const padrao = '%' + filtros.passageiro + '%';
      condicoes.push(Prisma.sql`(u."nome" ILIKE ${padrao} OR u."usuario" ILIKE ${padrao})`);
    }
  }

  // 9. Veículo (UUID, placa, marca ou modelo)
  if (filtros.veiculo) {
    if (ehUuid(filtros.veiculo)) {
      condicoes.push(Prisma.sql`c."veiculo_id" = ${filtros.veiculo}::uuid`);
    } else {
      const padrao = '%' + filtros.veiculo + '%';
      condicoes.push(
        Prisma.sql`(
          v."placa" ILIKE ${padrao}
          OR v."marca" ILIKE ${padrao}
          OR v."modelo" ILIKE ${padrao}
          OR (v."marca" || ' ' || v."modelo") ILIKE ${padrao}
        )`
      );
    }
  }

  // 10. Responsável pelo cancelamento
  if (filtros.canceladoPor) {
    condicoes.push(Prisma.sql`c."cancelado_por" = ${filtros.canceladoPor}`);
  }

  // 11. Filtros situacionais combináveis (atrasadas, finalizadas, canceladas, expiradas)
  const flagsSituacionais = [];
  if (filtros.atrasadas) {
    flagsSituacionais.push(
      Prisma.sql`(
        c."status" IN ('SOLICITADA', 'CONFIRMADA')
        AND COALESCE(c."embarque_motorista_confirmado", false) = false
        AND c."data_horario" < ${limiteAtraso}
      )`
    );
  }
  if (filtros.finalizadas) {
    flagsSituacionais.push(Prisma.sql`c."status" = 'FINALIZADA'`);
  }
  if (filtros.canceladas) {
    flagsSituacionais.push(Prisma.sql`c."status" = 'CANCELADA'`);
  }
  if (filtros.expiradas) {
    flagsSituacionais.push(CONDICAO_EXPIRADA_SQL);
  }

  if (flagsSituacionais.length === 1) {
    condicoes.push(flagsSituacionais[0]);
  } else if (flagsSituacionais.length > 1) {
    condicoes.push(Prisma.sql`(${Prisma.join(flagsSituacionais, ' OR ')})`);
  }

  const whereSql = condicoes.length > 0
    ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}`
    : Prisma.empty;

  return { whereSql, limiteAtraso };
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
        classe: true,
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

  /**
   * Busca uma corrida com dados públicos de passageiro, motorista e veículo em
   * uma única consulta SQL, ideal para modal de detalhes e linha do tempo sob demanda.
   */
  async findDetalhadaById(id) {
    if (!ehUuid(id)) return undefined;
    const rows = await prisma.$queryRaw`
      ${SELECT_CORRIDA_LISTAGEM_SQL}
      WHERE c."id" = ${id}::uuid
      LIMIT 1
    `;
    return rows && rows[0] ? formatarCorridaListagemSql(rows[0]) : undefined;
  }

  /**
   * Consulta paginada, ordenada e filtrada no banco de dados com resumo consolidado (KPIs).
   * Executa listagem da página + agregação em paralelo sem carregar registros excedentes em memória.
   */
  async consultarComFiltros(filtros, agora = new Date()) {
    const { whereSql, limiteAtraso } = construirWhereFiltrosSql(filtros, agora);

    const colunaOrdenacao =
      filtros.ordenarPor === 'criadaEm'
        ? Prisma.sql`c."criada_em"`
        : filtros.ordenarPor === 'valor'
          ? Prisma.sql`c."valor"`
          : Prisma.sql`c."data_horario"`;
    const direcaoSql = filtros.direcao === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const limit = filtros.limit;
    const offset = (filtros.page - 1) * limit;

    const [rows, agregados] = await Promise.all([
      prisma.$queryRaw`
        ${SELECT_CORRIDA_LISTAGEM_SQL}
        ${whereSql}
        ORDER BY ${colunaOrdenacao} ${direcaoSql}, c."criada_em" DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT
          COUNT(*)::int AS "total",
          COUNT(*) FILTER (WHERE c."status" = 'FINALIZADA')::int AS "finalizadas",
          COUNT(*) FILTER (WHERE c."status" = 'CANCELADA')::int AS "canceladas",
          COUNT(*) FILTER (WHERE ${CONDICAO_EXPIRADA_SQL})::int AS "expiradas",
          COUNT(*) FILTER (
            WHERE c."status" IN ('SOLICITADA', 'CONFIRMADA')
              AND COALESCE(c."embarque_motorista_confirmado", false) = false
              AND c."data_horario" < ${limiteAtraso}
          )::int AS "atrasadas",
          COUNT(*) FILTER (WHERE c."status" IN ('SOLICITADA', 'CONFIRMADA', 'EM_ANDAMENTO'))::int AS "ativas",
          COALESCE(SUM(c."valor"), 0) AS "valorTotalRegistrado",
          COALESCE(SUM(c."valor") FILTER (WHERE c."status" = 'FINALIZADA'), 0) AS "valorTotalFinalizado",
          COALESCE(SUM(c."distancia_km"), 0) AS "distanciaTotalKm"
        FROM "corridas" c
        LEFT JOIN "veiculos" v ON v."id" = c."veiculo_id"
        LEFT JOIN "usuarios" u ON u."id" = c."usuario_id"
        LEFT JOIN "usuarios" m ON m."id" = c."motorista_id"
        ${whereSql}
      `,
    ]);

    const agg = (agregados && agregados[0]) || {};
    const total = Number(agg.total || 0);

    return {
      registros: rows.map(formatarCorridaListagemSql),
      resumo: {
        total,
        ativas: Number(agg.ativas || 0),
        finalizadas: Number(agg.finalizadas || 0),
        canceladas: Number(agg.canceladas || 0),
        expiradas: Number(agg.expiradas || 0),
        atrasadas: Number(agg.atrasadas || 0),
        valorTotalRegistrado: paraNumeroOuNull(agg.valorTotalRegistrado) || 0,
        valorTotalFinalizado: paraNumeroOuNull(agg.valorTotalFinalizado) || 0,
        distanciaTotalKm: Number((paraNumeroOuNull(agg.distanciaTotalKm) || 0).toFixed(2)),
      },
    };
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
    const dataInicial = new Date(ano, mes - 1, 1);
    const dataFinal = new Date(ano, mes, 1);

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
   * cujo dataHorario já foi atingido ou ultrapassado, atualizando notificações e
   * gravando o evento de expiração na mesma transação.
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

      await corridaEventosRepository.registrarEventosEmLote(
        vencidas.map((c) => ({
          corridaId: c.id,
          tipo: TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA,
          titulo: 'Expiração automática da corrida',
          descricao: MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
          autorId: null,
          autorPerfil: 'SISTEMA',
          autorNome: 'Sistema automático',
          metadados: {
            canceladoPor: ORIGEM_CANCELAMENTO.SISTEMA,
            motivoCancelamento: MOTIVO_CANCELAMENTO_SEM_MOTORISTA,
            tipoExpiracao: 'SEM_MOTORISTA',
          },
          chaveIdempotencia: `encerramento:${c.id}`,
          criadoEm: agora,
        })),
        tx
      );

      return vencidas;
    }, TRANSACTION_OPTIONS);
  }

  // ---------- Confirmação de embarque ----------

  /**
   * Motorista confirma o embarque: CONFIRMADA → EM_ANDAMENTO (idempotente por UPDATE condicional).
   */
  async confirmarEmbarqueMotorista(id, motoristaUsuarioId, agora = new Date(), opcoes = {}) {
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

    await corridaEventosRepository
      .registrarEvento({
        corridaId: id,
        tipo: TIPO_EVENTO_CORRIDA.EMBARQUE_MOTORISTA_CONFIRMADO,
        titulo: 'Embarque confirmado pelo motorista',
        descricao: 'O motorista confirmou o embarque do passageiro no ponto de encontro.',
        autorId: motoristaUsuarioId,
        autorPerfil: 'MOTORISTA',
        autorNome: opcoes.autorNome || null,
        chaveIdempotencia: `embarque_motorista:${id}`,
        criadoEm: agora,
      })
      .catch(() => null);

    await corridaEventosRepository
      .registrarEvento({
        corridaId: id,
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_INICIADA,
        titulo: 'Corrida iniciada',
        descricao: 'A corrida entrou em andamento rumo ao destino selecionado.',
        autorId: motoristaUsuarioId,
        autorPerfil: 'MOTORISTA',
        autorNome: opcoes.autorNome || null,
        chaveIdempotencia: `inicio:${id}`,
        criadoEm: new Date(agora.getTime() + 1),
      })
      .catch(() => null);

    return this.findById(id);
  }

  /**
   * Motorista informa "Estou a caminho": registra a situação e estende o prazo UMA única vez.
   */
  async registrarMotoristaACaminho(id, motoristaUsuarioId, novoPrazo, agora = new Date(), opcoes = {}) {
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

    await corridaEventosRepository
      .registrarEvento({
        corridaId: id,
        tipo: TIPO_EVENTO_CORRIDA.MOTORISTA_A_CAMINHO,
        titulo: 'Motorista a caminho',
        descricao: 'O motorista informou estar em deslocamento até o endereço de origem.',
        autorId: motoristaUsuarioId,
        autorPerfil: 'MOTORISTA',
        autorNome: opcoes.autorNome || null,
        metadados: { prazoConfirmacaoEm: novoPrazo },
        chaveIdempotencia: `a_caminho:${id}`,
        criadoEm: agora,
      })
      .catch(() => null);

    return this.findById(id);
  }

  /**
   * Registra a resposta do passageiro (somente a coluna do passageiro; não toca na do motorista).
   */
  async registrarEmbarquePassageiro(id, passageiroId, embarcou, agora = new Date(), opcoes = {}) {
    const r = await prisma.corrida.updateMany({
      where: {
        id,
        usuarioId: passageiroId,
        status: { in: ['CONFIRMADA', 'EM_ANDAMENTO'] },
        OR: [{ embarquePassageiroConfirmado: null }, { embarquePassageiroConfirmado: false }],
      },
      data: {
        embarquePassageiroConfirmado: embarcou,
        embarquePassageiroEm: agora,
        atualizadaEm: agora,
      },
    });
    if (r.count === 0) return null;

    await corridaEventosRepository
      .registrarEvento({
        corridaId: id,
        tipo: embarcou
          ? TIPO_EVENTO_CORRIDA.EMBARQUE_PASSAGEIRO_CONFIRMADO
          : TIPO_EVENTO_CORRIDA.PASSAGEIRO_NAO_EMBARCOU,
        titulo: embarcou
          ? 'Embarque confirmado pelo passageiro'
          : 'Passageiro informou aguardar embarque',
        descricao: embarcou
          ? 'O passageiro confirmou que embarcou no veículo.'
          : 'O passageiro informou que ainda não embarcou no veículo.',
        autorId: passageiroId,
        autorPerfil: 'USUARIO',
        autorNome: opcoes.autorNome || null,
        metadados: { embarqueConfirmado: Boolean(embarcou) },
        chaveIdempotencia: embarcou
          ? `embarque_passageiro_sim:${id}`
          : `embarque_passageiro_nao:${id}`,
        criadoEm: agora,
      })
      .catch(() => null);

    return this.findById(id);
  }

  /**
   * Cancela uma corrida CONFIRMADA (ainda sem embarque confirmado) registrando autor, motivo, data
   * e evento na linha do tempo, e libera o veículo na mesma transação.
   */
  async cancelarConfirmadaComMotivo(id, opcoes, agora = new Date()) {
    const andConditions = [
      { OR: [{ embarqueMotoristaConfirmado: null }, { embarqueMotoristaConfirmado: false }] },
    ];
    if (opcoes.apenasSePrazoVencidoAte) {
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

        const ehExpiracao = Boolean(
          opcoes.apenasSePrazoVencidoAte ||
          foiExpiradaAutomaticamente({
            status: STATUS_CORRIDA.CANCELADA,
            canceladoPor: opcoes.canceladoPor,
            motivoCancelamento: opcoes.motivo,
          })
        );

        await corridaEventosRepository.registrarEvento(
          {
            corridaId: id,
            tipo: ehExpiracao
              ? TIPO_EVENTO_CORRIDA.CORRIDA_EXPIRADA
              : TIPO_EVENTO_CORRIDA.CORRIDA_CANCELADA,
            titulo: ehExpiracao
              ? 'Expiração automática por ausência de confirmação'
              : opcoes.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA
                ? 'Corrida cancelada pelo motorista'
                : 'Corrida cancelada pelo passageiro',
            descricao: opcoes.motivo || 'Corrida cancelada durante janela de embarque.',
            autorId: opcoes.motoristaUsuarioId || opcoes.passageiroId || null,
            autorPerfil: ehExpiracao
              ? 'SISTEMA'
              : opcoes.canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA
                ? 'MOTORISTA'
                : 'USUARIO',
            autorNome: ehExpiracao ? 'Sistema automático' : opcoes.autorNome || null,
            metadados: {
              canceladoPor: opcoes.canceladoPor,
              motivoCancelamento: opcoes.motivo || null,
              expiracaoAutomatica: ehExpiracao,
            },
            chaveIdempotencia: `encerramento:${id}`,
            criadoEm: agora,
          },
          tx
        );

        return atual;
      }, TRANSACTION_OPTIONS);
      return formatarCorrida(corrida);
    } catch (error) {
      if (error instanceof RollbackError) return null;
      throw error;
    }
  }

  /**
   * Lista candidatas ao cancelamento automático por ausência de confirmação.
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
        origemLat: dados.origemLat ?? null,
        origemLng: dados.origemLng ?? null,
        destinoLat: dados.destinoLat ?? null,
        destinoLng: dados.destinoLng ?? null,

        rotaCaminho: Array.isArray(dados.rotaCaminho) ? dados.rotaCaminho : [],
        polyline: dados.polyline || null,

        distanciaKm: dados.distanciaKm,
        duracaoMin: dados.duracaoMin ?? null,
        valor: dados.valor,
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

    const formatada = formatarCorrida(novaCorrida);

    await corridaEventosRepository
      .registrarEvento({
        corridaId: formatada.id,
        tipo: TIPO_EVENTO_CORRIDA.CORRIDA_SOLICITADA,
        titulo: 'Corrida solicitada',
        descricao: `Solicitação registrada de ${formatada.origemNome} para ${formatada.destinoNome} (classe ${formatada.classe}).`,
        autorId: dados.usuarioId,
        autorPerfil: 'USUARIO',
        autorNome: dados.autorNome || null,
        metadados: {
          classe: formatada.classe,
          formaPagamento: formatada.formaPagamento,
          distanciaKm: formatada.distanciaKm,
          duracaoPrevistaMin: formatada.duracaoMin,
          valor: formatada.valor,
          dataHorarioProgramado: formatada.dataHorario,
        },
        chaveIdempotencia: `solicitar:${formatada.id}`,
        criadoEm: novaCorrida.criadaEm || new Date(),
      })
      .catch(() => null);

    return formatada;
  }

  /**
   * Aceita a corrida reservando o veículo de forma ATÔMICA (uma única transação),
   * gravando `aceitaEm` e o evento na linha do tempo.
   */
  async aceitarComReservaDeVeiculo(corridaId, motoristaUsuarioId, veiculoId, opcoes = {}) {
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
          data: {
            motoristaId: motoristaUsuarioId,
            veiculoId,
            status: para,
            aceitaEm: agora,
            atualizadaEm: agora,
          },
        });
        if (atualizada.count === 0) throw new RollbackError('CORRIDA_INDISPONIVEL');

        const atual = await tx.corrida.findUnique({
          where: { id: corridaId },
          include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
        });

        const veiculoDesc = atual?.veiculo
          ? `${atual.veiculo.marca} ${atual.veiculo.modelo} (${atual.veiculo.placa})`
          : null;

        await corridaEventosRepository.registrarEvento(
          {
            corridaId,
            tipo: TIPO_EVENTO_CORRIDA.CORRIDA_ACEITA,
            titulo: 'Corrida aceita pelo motorista',
            descricao: veiculoDesc
              ? `Motorista aceitou a corrida com o veículo ${veiculoDesc}.`
              : 'Motorista aceitou a solicitação de corrida.',
            autorId: motoristaUsuarioId,
            autorPerfil: 'MOTORISTA',
            autorNome: opcoes.autorNome || null,
            metadados: { veiculoId, veiculo: veiculoDesc },
            chaveIdempotencia: `aceitar:${corridaId}:${motoristaUsuarioId}`,
            criadoEm: agora,
          },
          tx
        );

        return atual;
      }, TRANSACTION_OPTIONS);
      return { ok: true, corrida: formatarCorrida(corrida) };
    } catch (error) {
      if (error instanceof RollbackError) return { ok: false, motivo: error.motivo };
      if (error && error.code === 'P2002') return { ok: false, motivo: 'VEICULO_COM_CORRIDA_ATIVA' };
      throw error;
    }
  }

  /**
   * Realiza uma transição de estado da corrida (cancelar/finalizar) de forma atômica,
   * liberando o veículo e gravando o evento correspondente na linha do tempo.
   */
  async transicionarComLiberacaoDeVeiculo(id, transicao, metadados = {}, contextoEvento = null) {
    const regra = TRANSICOES_CORRIDA[transicao];
    if (!regra || transicao === 'aceitar') throw new Error('Transicao de corrida desconhecida: ' + transicao);

    try {
      const corrida = await prisma.$transaction(async (tx) => {
        const agora = new Date();
        const dadosAtualizacao = {
          status: regra.para,
          atualizadaEm: agora,
          ...(transicao === 'finalizar' ? { finalizadaEm: agora } : {}),
          ...metadados,
        };

        const r = await tx.corrida.updateMany({
          where: { id, status: { in: [...regra.de] } },
          data: dadosAtualizacao,
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

        if (transicao === 'finalizar') {
          await corridaEventosRepository.registrarEvento(
            {
              corridaId: id,
              tipo: TIPO_EVENTO_CORRIDA.CORRIDA_FINALIZADA,
              titulo: 'Pagamento confirmado e corrida finalizada',
              descricao: `Viagem concluída e recebimento presencial (${atual?.formaPagamento || 'DINHEIRO'}) confirmado.`,
              autorId: contextoEvento?.autorId || atual?.motoristaId || null,
              autorPerfil: contextoEvento?.autorPerfil || 'MOTORISTA',
              autorNome: contextoEvento?.autorNome || null,
              metadados: {
                valor: atual?.valor != null ? paraNumeroOuNull(atual.valor) : null,
                formaPagamento: atual?.formaPagamento || 'DINHEIRO',
              },
              chaveIdempotencia: `encerramento:${id}`,
              criadoEm: agora,
            },
            tx
          );
        } else if (transicao === 'cancelar') {
          const canceladoPor = metadados.canceladoPor || ORIGEM_CANCELAMENTO.SISTEMA;
          const motivo = metadados.motivoCancelamento || null;
          await corridaEventosRepository.registrarEvento(
            {
              corridaId: id,
              tipo: TIPO_EVENTO_CORRIDA.CORRIDA_CANCELADA,
              titulo:
                canceladoPor === ORIGEM_CANCELAMENTO.MOTORISTA
                  ? 'Corrida cancelada pelo motorista'
                  : canceladoPor === ORIGEM_CANCELAMENTO.PASSAGEIRO
                    ? 'Corrida cancelada pelo passageiro'
                    : 'Corrida cancelada pela administração',
              descricao: motivo
                ? `Cancelamento registrado. Motivo: ${motivo}`
                : 'Cancelamento manual registrado antes da conclusão da corrida.',
              autorId: contextoEvento?.autorId || null,
              autorPerfil: contextoEvento?.autorPerfil || canceladoPor,
              autorNome: contextoEvento?.autorNome || null,
              metadados: {
                canceladoPor,
                motivoCancelamento: motivo,
              },
              chaveIdempotencia: `encerramento:${id}`,
              criadoEm: metadados.canceladaEm || agora,
            },
            tx
          );
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
