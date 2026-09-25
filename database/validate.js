require('dotenv').config();
const { query } = require('../src/database/connection');

async function validar() {
  const t = await query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log('\n=== TABELAS ===');
  t.rows.forEach(r => console.log(' -', r.table_name));

  const c = await query(`
    SELECT tc.table_name, tc.constraint_name, tc.constraint_type
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type IN ('UNIQUE','CHECK','FOREIGN KEY','PRIMARY KEY')
    ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name
    LIMIT 80
  `);
  console.log('\n=== CONSTRAINTS ===');
  c.rows.forEach(r => console.log(` [${r.constraint_type}] ${r.table_name} \u2192 ${r.constraint_name}`));

  const i = await query(`
    SELECT tablename, indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `);
  console.log('\n=== \u00cdNDICES ===');
  i.rows.forEach(r => console.log(` ${r.tablename} \u2192 ${r.indexname}`));

  const a = await query(
    "SELECT id, nome, usuario, perfil FROM usuarios WHERE perfil = 'ADMINISTRADOR'"
  );
  console.log('\n=== ADMIN ===');
  a.rows.forEach(r => console.log(' ID:', r.id, '| usuario:', r.usuario, '| perfil:', r.perfil));

  process.exit(0);
}

validar().catch(e => { console.error(e.message); process.exit(1); });
