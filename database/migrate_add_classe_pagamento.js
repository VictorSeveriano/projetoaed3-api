const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Adiciona coluna classe na tabela corridas se não existir
  await prisma.$executeRawUnsafe(
    "ALTER TABLE corridas ADD COLUMN IF NOT EXISTS classe VARCHAR(50) NOT NULL DEFAULT 'NORMAL'"
  );
  console.log('coluna classe adicionada a corridas');

  // Adiciona coluna forma_pagamento na tabela corridas se não existir
  await prisma.$executeRawUnsafe(
    "ALTER TABLE corridas ADD COLUMN IF NOT EXISTS forma_pagamento VARCHAR(50) NOT NULL DEFAULT 'DINHEIRO'"
  );
  console.log('coluna forma_pagamento adicionada a corridas');

  // Adiciona coluna acao_motorista na tabela notificacoes se não existir
  await prisma.$executeRawUnsafe(
    "ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS acao_motorista VARCHAR(50)"
  );
  console.log('coluna acao_motorista adicionada a notificacoes');

  console.log('Migrations aplicadas com sucesso!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
