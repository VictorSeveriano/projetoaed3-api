'use strict';
/**
 * motoristas.repository.js — Repositório de motoristas com Prisma ORM.
 */

const prisma = require('../database/prisma');
const { paraNumeroOuNull, formatarEndereco } = require('../utils/prismaMappers');

const INCLUDE_USUARIO_E_VEICULO = {
  usuario: {
    include: {
      endereco: true,
      veiculos: {
        where: { statusAprovacao: { not: 'EXCLUIDO' } },
        orderBy: { criadoEm: 'desc' },
        take: 1,
      },
    },
  },
};

function formatarMotorista(m) {
  if (!m) return null;
  const { usuario, ...resto } = m;
  if (usuario !== undefined) {
    let usuarioLimpo = null;
    let veiculoLimpo = null;
    if (usuario) {
      const { senha, endereco, veiculos, ...dadosUsuario } = usuario;
      usuarioLimpo = {
        ...dadosUsuario,
        endereco: formatarEndereco(endereco),
      };
      if (Array.isArray(veiculos) && veiculos[0]) {
        veiculoLimpo = {
          ...veiculos[0],
          quilometragem: paraNumeroOuNull(veiculos[0].quilometragem) ?? 0,
        };
      }
    }
    Object.defineProperty(resto, '_enriquecidoPreCarregado', {
      value: { usuario: usuarioLimpo, veiculo: veiculoLimpo },
      enumerable: false,
      configurable: true,
    });
  }
  return resto;
}

class MotoristasRepository {
  async findAll() {
    const lista = await prisma.motorista.findMany({
      include: INCLUDE_USUARIO_E_VEICULO,
      orderBy: { criadoEm: 'asc' }
    });
    return lista.map(formatarMotorista);
  }

  async findById(id) {
    const m = await prisma.motorista.findUnique({
      where: { id },
      include: INCLUDE_USUARIO_E_VEICULO,
    });
    return formatarMotorista(m);
  }

  async findByUsuarioId(usuarioId) {
    const m = await prisma.motorista.findUnique({
      where: { usuarioId },
      include: INCLUDE_USUARIO_E_VEICULO,
    });
    return formatarMotorista(m);
  }

  async existsByCnh(cnh) {
    const motorista = await prisma.motorista.findUnique({
      where: { cnh }
    });
    return !!motorista;
  }

  async findByStatusCadastro(statusCadastro) {
    const lista = await prisma.motorista.findMany({
      where: { statusCadastro },
      include: INCLUDE_USUARIO_E_VEICULO,
      orderBy: { criadoEm: 'asc' }
    });
    return lista.map(formatarMotorista);
  }

  async findByStatusPresenca(statusPresenca) {
    const lista = await prisma.motorista.findMany({
      where: {
        statusCadastro: 'APROVADO',
        statusPresenca
      },
      include: INCLUDE_USUARIO_E_VEICULO,
      orderBy: { criadoEm: 'asc' }
    });
    return lista.map(formatarMotorista);
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
          statusPresenca: statusCadastro === 'APROVADO' ? 'ONLINE' : 'OFFLINE',
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

  async updateCnh(id, cnh) {
    try {
      return await prisma.motorista.update({
        where: { id },
        data: {
          cnh,
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
