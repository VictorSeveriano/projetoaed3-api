'use strict';
/**
 * motoristas.repository.js — Repositório de motoristas com Prisma ORM.
 */

const prisma = require('../database/prisma');

class MotoristasRepository {
  async findAll() {
    return prisma.motorista.findMany({
      orderBy: { criadoEm: 'asc' }
    });
  }

  async findById(id) {
    return prisma.motorista.findUnique({
      where: { id }
    });
  }

  async findByUsuarioId(usuarioId) {
    return prisma.motorista.findUnique({
      where: { usuarioId }
    });
  }

  async findByStatusCadastro(statusCadastro) {
    return prisma.motorista.findMany({
      where: { statusCadastro },
      orderBy: { criadoEm: 'asc' }
    });
  }

  async findByStatusPresenca(statusPresenca) {
    return prisma.motorista.findMany({
      where: {
        statusCadastro: 'APROVADO',
        statusPresenca
      },
      orderBy: { criadoEm: 'asc' }
    });
  }

  async create(dados) {
    return prisma.motorista.create({
      data: {
        usuarioId: dados.usuarioId,
        cnh: dados.cnh,
        statusCadastro: 'PENDENTE',
        statusPresenca: 'OFFLINE'
      }
    });
  }

  async updateStatusCadastro(id, statusCadastro) {
    try {
      return await prisma.motorista.update({
        where: { id },
        data: {
          statusCadastro,
          atualizadoEm: new Date()
        }
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateStatusPresenca(id, statusPresenca) {
    try {
      return await prisma.motorista.update({
        where: { id },
        data: {
          statusPresenca,
          atualizadoEm: new Date()
        }
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }
}

module.exports = new MotoristasRepository();
