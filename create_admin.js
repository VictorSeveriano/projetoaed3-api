const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createAdmin() {
  try {
    const admin = await prisma.usuario.upsert({
      where: { usuario: 'admin' },
      update: {},
      create: {
        nome: 'Administrador do Sistema',
        usuario: 'admin',
        senha: 'admin123',
        perfil: 'ADMINISTRADOR',
        cpf: '00000000000',
        celular: '27999990000',
        email: 'admin@reserva.car'
      }
    });
    console.log('Admin criado/atualizado com sucesso:', admin);
  } catch (error) {
    console.error('Erro ao criar admin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
