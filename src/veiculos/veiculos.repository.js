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
  };
}

class VeiculosRepository {
  async findAll(filtros = {}) {
    const where = { statusAprovacao: { not: 'EXCLUIDO' } };
    if (filtros.status) {
      const s = filtros.status.toUpperCase();
      where.OR = [{ status: s }, { statusAprovacao: s }];
    }
    if (filtros.motoristaId) {
      where.motoristaId = filtros.motoristaId;
    }
    if (filtros.porte) {
      where.porte = filtros.porte.toUpperCase();
    }
    const veiculos = await prisma.veiculo.findMany({
      where,
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
      where: { motoristaId, statusAprovacao: { not: 'EXCLUIDO' } },
      orderBy: { criadoEm: 'desc' }
    });
    return formatarVeiculo(veiculo);
  }

  async softDelete(id) {
    try {
      const veiculo = await prisma.veiculo.update({
        where: { id },
        data: {
          statusAprovacao: 'EXCLUIDO',
          status: 'INDISPONIVEL',
          atualizadoEm: new Date()
        }
      });
      return formatarVeiculo(veiculo);
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
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
        statusAprovacao: 'PENDENTE',
        status: 'INDISPONIVEL',
        motoristaId: dados.motoristaId
      }
    });
    return formatarVeiculo(veiculo);
  }

  async update(id, dados) {
    const dataUpdate = {};
    if (dados.marca !== undefined) dataUpdate.marca = dados.marca;
    if (dados.modelo !== undefined) dataUpdate.modelo = dados.modelo;
    if (dados.ano !== undefined) dataUpdate.ano = dados.ano;
    if (dados.placa !== undefined) dataUpdate.placa = dados.placa;
    if (dados.cor !== undefined) dataUpdate.cor = dados.cor;
    if (dados.porte !== undefined) dataUpdate.porte = dados.porte;
    if (dados.classe !== undefined) dataUpdate.classe = dados.classe;
    
    // allow other editable fields if needed
    if (dados.quilometragem !== undefined) dataUpdate.quilometragem = dados.quilometragem;
    if (dados.quantidadePassageiros !== undefined) dataUpdate.quantidadePassageiros = dados.quantidadePassageiros;
    if (dados.possuiArCondicionado !== undefined) dataUpdate.possuiArCondicionado = dados.possuiArCondicionado;
    if (dados.possuiExtintor !== undefined) dataUpdate.possuiExtintor = dados.possuiExtintor;
    if (dados.possuiCintoSeguranca !== undefined) dataUpdate.possuiCintoSeguranca = dados.possuiCintoSeguranca;
    if (dados.documentacaoRegularizada !== undefined) dataUpdate.documentacaoRegularizada = dados.documentacaoRegularizada;

    dataUpdate.atualizadoEm = new Date();

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
}

module.exports = new VeiculosRepository();
