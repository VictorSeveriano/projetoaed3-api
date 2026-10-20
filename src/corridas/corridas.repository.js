'use strict';
/**
 * corridas.repository.js — Repositório de corridas com Prisma ORM.
 */

const Corrida = require('./Corrida');
const prisma = require('../database/prisma');
const {
  STATUS_CORRIDA_ATIVOS,
  STATUS_VEICULO,
  STATUS_APROVACAO_VEICULO,
  TRANSICOES_CORRIDA,
} = require('../utils/constants');
const { paraNumeroOuNull, enderecoParaPrisma } = require('../utils/prismaMappers');

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
    rotasAlternativas: (cPrisma.rotasAlternativas || []).map(r => ({
      ...r,
      distanciaKm: r.distanciaKm != null ? paraNumeroOuNull(r.distanciaKm) : 0
    }))
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
    selecionada
  };
}

// ---------- CorridasRepository ----------

class CorridasRepository {
  async findAll() {
    const corridas = await prisma.corrida.findMany({
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findById(id) {
    const corrida = await prisma.corrida.findUnique({
      where: { id },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true }
    });
    return formatarCorrida(corrida) || undefined;
  }

  async findByUsuarioId(usuarioId) {
    const corridas = await prisma.corrida.findMany({
      where: { usuarioId },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByMotoristaId(motoristaId) {
    const corridas = await prisma.corrida.findMany({
      where: { motoristaId },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByMotoristaIdAndPeriodo(motoristaId, mes, ano) {
    // Para buscar por período exato em Prisma, usamos limites de datas
    const dataInicial = new Date(ano, mes - 1, 1);
    const dataFinal = new Date(ano, mes, 1); // 1o dia do próximo mês

    const corridas = await prisma.corrida.findMany({
      where: {
        motoristaId,
        dataHorario: {
          gte: dataInicial,
          lt: dataFinal
        }
      },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { dataHorario: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByUsuarioIdAndStatus(usuarioId, status) {
    const corridas = await prisma.corrida.findMany({
      where: { usuarioId, status },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByMotoristaIdAndStatus(motoristaId, status) {
    const corridas = await prisma.corrida.findMany({
      where: { motoristaId, status },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async create(dados) {
    const rotas = dados.rotasAlternativas || [];
    const rotasCriacao = rotas
      .map((r, i) => rotaParaPrisma(r, i, i === 0))
      .filter(r => !!r.polyline);

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
          create: enderecoParaPrisma(dados.origemEndereco, dados.origemLat, dados.origemLng)
        },
        destinoEndereco: {
          create: enderecoParaPrisma(dados.destinoEndereco, dados.destinoLat, dados.destinoLng)
        },
        rotasAlternativas: {
          create: rotasCriacao
        }
      },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } }, veiculo: true }
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
      });
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
  async transicionarComLiberacaoDeVeiculo(id, transicao) {
    const regra = TRANSICOES_CORRIDA[transicao];
    if (!regra || transicao === 'aceitar') throw new Error('Transicao de corrida desconhecida: ' + transicao);

    try {
      const corrida = await prisma.$transaction(async (tx) => {
        const agora = new Date();
        const r = await tx.corrida.updateMany({
          where: { id, status: { in: [...regra.de] } },
          data: { status: regra.para, atualizadaEm: agora },
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
      });
      return formatarCorrida(corrida);
    } catch (error) {
      if (error instanceof RollbackError) return null;
      throw error;
    }
  }
}

module.exports = new CorridasRepository();
