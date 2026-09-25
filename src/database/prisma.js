const { PrismaClient } = require('@prisma/client');

// Instância centralizada do Prisma para evitar conexões excessivas no Neon
const prisma = new PrismaClient();

module.exports = prisma;
