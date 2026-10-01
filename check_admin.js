const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAdmin() {
  const admin = await prisma.usuario.findFirst({ where: { usuario: 'admin' } });
  console.log('Admin:', admin);
  process.exit(0);
}

checkAdmin();
