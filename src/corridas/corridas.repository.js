'use strict';
/**
 * corridas.repository.js — Repositório de corridas com Prisma ORM.
 */

const Corrida = require('./Corrida');
const prisma = require('../database/prisma');

// ---------- Helpers de mapeamento ----------

function formatarCorrida(cPrisma) {
  if (!cPrisma) return null;
  
  return new Corrida({
    ...cPrisma,
    origemLat: cPrisma.origemLat ? cPrisma.origemLat.toNumber() : null,
    origemLng: cPrisma.origemLng ? cPrisma.origemLng.toNumber() : null,
    destinoLat: cPrisma.destinoLat ? cPrisma.destinoLat.toNumber() : null,
    destinoLng: cPrisma.destinoLng ? cPrisma.destinoLng.toNumber() : null,
    distanciaKm: cPrisma.distanciaKm ? cPrisma.distanciaKm.toNumber() : 0,
    valor: cPrisma.valor ? cPrisma.valor.toNumber() : 0,
    rotaCaminho: cPrisma.rotaCaminho || [],
    classe: cPrisma.classe || 'NORMAL',
    formaPagamento: cPrisma.formaPagamento || 'DINHEIRO',
    
    // Mapeia rotas alternativas para ter as propriedades no formato da aplicação
    rotasAlternativas: (cPrisma.rotasAlternativas || []).map(r => ({
      ...r,
      distanciaKm: r.distanciaKm ? r.distanciaKm.toNumber() : 0
    }))
  });
}

function enderecoParaPrisma(endereco, lat, lng) {
  return {
    logradouro:  endereco?.rua || endereco?.logradouro || null,
    numero:      endereco?.numero || null,
    complemento: endereco?.complemento || null,
    bairro:      endereco?.bairro || null,
    cidade:      endereco?.cidade || null,
    estado:      endereco?.estado || null,
    uf:          endereco?.uf || null,
    cep:         endereco?.cep ? endereco.cep.replace(/\D/g, '') : null,
    pais:        endereco?.pais || 'Brasil',
    latitude:    lat !== undefined ? lat : (endereco?.latitude || null),
    longitude:   lng !== undefined ? lng : (endereco?.longitude || null)
  };
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
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findById(id) {
    const corrida = await prisma.corrida.findUnique({
      where: { id },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } }
    });
    return formatarCorrida(corrida) || undefined;
  }

  async findByUsuarioId(usuarioId) {
    const corridas = await prisma.corrida.findMany({
      where: { usuarioId },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByMotoristaId(motoristaId) {
    const corridas = await prisma.corrida.findMany({
      where: { motoristaId },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
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
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
      orderBy: { dataHorario: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByUsuarioIdAndStatus(usuarioId, status) {
    const corridas = await prisma.corrida.findMany({
      where: { usuarioId, status },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByMotoristaIdAndStatus(motoristaId, status) {
    const corridas = await prisma.corrida.findMany({
      where: { motoristaId, status },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
      orderBy: { criadaEm: 'desc' }
    });
    return corridas.map(formatarCorrida);
  }

  async findByVeiculo(veiculoId) {
    const corridas = await prisma.corrida.findMany({
      where: { veiculoId },
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } },
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
        origemLat: dados.origemLat || null,
        origemLng: dados.origemLng || null,
        destinoLat: dados.destinoLat || null,
        destinoLng: dados.destinoLng || null,
        
        rotaCaminho: Array.isArray(dados.rotaCaminho) ? dados.rotaCaminho : [],
        polyline: dados.polyline || null,
        
        distanciaKm: dados.distanciaKm,
        duracaoMin: dados.duracaoMin || null,
        valor: dados.valor || 0,
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
      include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } }
    });

    return formatarCorrida(novaCorrida);
  }

  /**
   * Aceita a corrida atomicamente:
   * - Só atualiza se o status ainda é SOLICITADA (prevenção de duplo aceite)
   * - Associa motoristaId e veiculoId
   * - Muda status para CONFIRMADA
   * @returns {Corrida|null} null se a corrida já foi assumida por outro
   */
  async aceitarCorrida(corridaId, motoristaId, veiculoId) {
    try {
      // updateMany com filtro de status previne corrida de dados (duplo aceite)
      const resultado = await prisma.corrida.updateMany({
        where: { id: corridaId, status: 'SOLICITADA' },
        data: {
          motoristaId,
          veiculoId,
          status: 'CONFIRMADA',
          atualizadaEm: new Date(),
        }
      });

      if (resultado.count === 0) {
        // Nenhuma linha atualizada: corrida já foi assumida ou não existe
        return null;
      }

      // Buscar corrida atualizada para retornar
      return this.findById(corridaId);
    } catch (error) {
      throw error;
    }
  }

  async updateStatus(id, status) {
    try {
      const atualizada = await prisma.corrida.update({
        where: { id },
        data: {
          status,
          atualizadaEm: new Date()
        },
        include: { rotasAlternativas: { orderBy: { ordem: 'asc' } } }
      });
      return formatarCorrida(atualizada);
    } catch (error) {
      if (error.code === 'P2025') return undefined;
      throw error;
    }
  }

  async delete(id) {
    try {
      // Prisma handle cascades if configured.
      // Wait, manual schema might not have cascade delete for rotas. We should delete rotas first!
      await prisma.$transaction([
        prisma.corridaRota.deleteMany({ where: { corridaId: id } }),
        prisma.corrida.delete({ where: { id } })
      ]);
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new CorridasRepository();
