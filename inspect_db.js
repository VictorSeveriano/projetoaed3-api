const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT table_name, column_name, data_type, character_maximum_length, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position;
    `);

    const tables = {};
    for (const row of res.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(row);
    }

    const indicesRes = await pool.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname;
    `);

    const indices = {};
    for (const row of indicesRes.rows) {
      if (!indices[row.tablename]) indices[row.tablename] = [];
      indices[row.tablename].push(row);
    }

    const constraintsRes = await pool.query(`
      SELECT conname, pg_get_constraintdef(c.oid)
      FROM pg_constraint c
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE n.nspname = 'public';
    `);
    const constraints = constraintsRes.rows;

    fs.writeFileSync('db_schema.json', JSON.stringify({ tables, indices, constraints }, null, 2));
    console.log('Saved to db_schema.json');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
