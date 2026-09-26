const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Testa se os novos campos existem no banco
  const corrida = await p.corrida.findFirst({
    select: { id: true, classe: true, formaPagamento: true }
  });
  console.log('Campos novos em corridas OK:', JSON.stringify(corrida));
  
  // Testa se o campo acaoMotorista existe em notificacoes
  const notif = await p.notificacao.findFirst({
    select: { id: true, acaoMotorista: true }
  });
  console.log('Campo acaoMotorista em notificacoes OK:', JSON.stringify(notif));
}

main()
  .catch(e => { console.error('ERRO:', e.message); process.exit(1); })
  .finally(() => p.$disconnect());
