const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const usuarios = await prisma.usuario.findMany({
    where: { email: { endsWith: '@teste.com' }, perfil: 'USUARIO' },
    include: { endereco: true }
  });

  const motoristas = await prisma.motorista.findMany({
    where: { usuario: { email: { endsWith: '@teste.com' } } },
    include: { usuario: true } 
  });
  
  const veiculos = await prisma.veiculo.findMany({
    where: { motorista: { email: { endsWith: '@teste.com' } } }
  });

  const corridas = await prisma.corrida.findMany({
    where: { usuario: { email: { endsWith: '@teste.com' } } },
    include: { usuario: true, motorista: true, veiculo: true, origemEndereco: true, destinoEndereco: true }
  });

  const notificacoes = await prisma.notificacao.findMany({
    where: { 
      destinatario: {
        OR: [
          { email: { endsWith: '@teste.com' } },
          { perfil: 'ADMINISTRADOR' }
        ]
      }
    },
    include: { destinatario: true }
  });

  console.log(JSON.stringify({
    usuarios: usuarios.length,
    motoristas: motoristas.length,
    corridas: corridas.length,
    veiculos: veiculos.length,
    notificacoes: notificacoes.length,
    notifNaoLidasAdmin: notificacoes.filter(n => n.destinatario.perfil === 'ADMINISTRADOR' && !n.lida).length,
    notifAdmin: notificacoes.filter(n => n.destinatario.perfil === 'ADMINISTRADOR').length,
    notifNaoLidasMotorista: notificacoes.filter(n => n.destinatario.perfil === 'MOTORISTA' && !n.lida).length,
    notifMotorista: notificacoes.filter(n => n.destinatario.perfil === 'MOTORISTA').length
  }, null, 2));

  // Also print the data for the report
  console.log('--- USUÁRIOS ---');
  usuarios.forEach(u => console.log(`${u.nome} | ${u.usuario} | ${u.perfil} | ${u.endereco.cidade}`));

  console.log('--- MOTORISTAS ---');
  for (const m of motoristas) {
    const v = veiculos.find(veic => veic.motoristaId === m.usuarioId);
    console.log(`${m.usuario.nome} | Usuário ${m.usuario.id} | ${m.cnh} | ${m.statusCadastro} | ${m.statusPresenca} | ${v ? v.modelo : 'Nenhum'} | ${v ? v.classe : 'Nenhuma'}`);
  }

  console.log('--- CORRIDAS ---');
  for (const c of corridas) {
    console.log(`Corrida ${c.id} | Passageiro: ${c.usuario.nome} | Motorista: ${c.motorista ? c.motorista.nome : 'Nenhum'} | Veículo: ${c.veiculo ? c.veiculo.modelo : 'Nenhum'} | ${c.origemEndereco.cidade} -> ${c.destinoEndereco.cidade} | ${c.distanciaKm}km | Classe: ${c.classe} | Data: ${c.dataHorario} | ${c.status} | Pagamento: ${c.formaPagamento} | R$ ${c.valor}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
