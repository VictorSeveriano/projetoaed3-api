'use strict';

const prisma = require('../database/prisma');

class AuditoriaRepository {
  async create(data) {
    return prisma.auditoria.create({
      data,
    });
  }

  async findAll({ skip, take, orderBy, where }) {
    const [total, registros] = await prisma.$transaction([
      prisma.auditoria.count({ where }),
      prisma.auditoria.findMany({
        skip,
        take,
        orderBy,
        where,
        include: {
          usuario: {
            select: { nome: true, usuario: true, email: true }
          }
        }
      })
    ]);

    return { total, registros };
  }

  async findById(id) {
    return prisma.auditoria.findUnique({
      where: { id },
      include: {
        usuario: {
          select: { nome: true, usuario: true, email: true }
        }
      }
    });
  }
}

module.exports = new AuditoriaRepository();
