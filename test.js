const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRawUnsafe("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_notificacoes_tipo'").then(console.log).finally(() => prisma.$disconnect());
