'use strict';
/**
 * veiculos.repository.js — Repositório de veículos com Prisma ORM.
 */

const prisma = require('../database/prisma');

function formatarVeiculo(v) {
  if (!v) return null;
  return {
    ...v,
    // Prisma retorna Decimal object, convertemos para Number nativo
    quilometragem: v.quilometragem ? v.quilometragem.toNumber() : 0,
    tarifaBase: v.tarifaBase ? v.tarifaBase.toNumber() : null,
  };
}

class VeiculosRepository {
  async findAll() {
    const veiculos = await prisma.veiculo.findMany({
      orderBy: { criadoEm: 'asc' }
    });
    return veiculos.map(formatarVeiculo);
  }

  async findById(id) {
    const veiculo = await prisma.veiculo.findUnique({
      where: { id }
    });
    return formatarVeiculo(veiculo);
  }

  async findDisponiveis() {
    const veiculos = await prisma.veiculo.findMany({
      where: {
        statusAprovacao: 'APROVADO',
        status: 'DISPONIVEL'
      },
      orderBy: { criadoEm: 'asc' }
    });
    return veiculos.map(formatarVeiculo);
  }

  async findByStatus(status) {
    const veiculos = await prisma.veiculo.findMany({
      where: { status },
      orderBy: { criadoEm: 'asc' }
    });
    return veiculos.map(formatarVeiculo);
  }

  async findByMotoristaId(motoristaId) {
    const veiculo = await prisma.veiculo.findFirst({
      where: { motoristaId }
    });
    return formatarVeiculo(veiculo);
  }

  async findByStatusAprovacao(statusAprovacao) {
    const veiculos = await prisma.veiculo.findMany({
      where: { statusAprovacao },
      orderBy: { criadoEm: 'asc' }
    });
    return veiculos.map(formatarVeiculo);
  }

  async updateStatusAprovacao(id, statusAprovacao, classe = null) {
    const dataUpdate = {
      statusAprovacao,
      atualizadoEm: new Date()
    };
    
    if (statusAprovacao === 'APROVADO') {
      dataUpdate.status = 'DISPONIVEL';
    }
    if (classe) {
      dataUpdate.classe = classe;
    }

    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: dataUpdate
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateStatus(id, status) {
    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: {
          status,
          atualizadoEm: new Date()
        }
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateClasse(id, classe) {
    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: {
          classe,
          atualizadoEm: new Date()
        }
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async create(dados) {
    const veiculo = await prisma.veiculo.create({
      data: {
        marca: dados.marca,
        modelo: dados.modelo,
        ano: dados.ano,
        placa: dados.placa,
        cor: dados.cor || null,
        porte: dados.porte,
        classe: dados.classe,
        quilometragem: dados.quilometragem || 0,
        quantidadePassageiros: dados.quantidadePassageiros || 4,
        possuiArCondicionado: dados.possuiArCondicionado || false,
        possuiExtintor: dados.possuiExtintor || false,
        possuiCintoSeguranca: dados.possuiCintoSeguranca || false,
        documentacaoRegularizada: dados.documentacaoRegularizada || false,
        tarifaBase: dados.tarifaBase || null,
        statusAprovacao: 'PENDENTE',
        status: 'INDISPONIVEL',
        motoristaId: dados.motoristaId
      }
    });
    return formatarVeiculo(veiculo);
  }
}

module.exports = new VeiculosRepository();
