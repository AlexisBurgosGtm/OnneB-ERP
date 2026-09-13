/**
 * CONTA_LIBROS_MANUAL → UPDATE_QUERIES (sin .sql local).
 * Uso: node scripts/seed-update-query-conta-libros-manual.js
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { insertUpdateQueryIfMissing } = require('./lib/seed-update-query');
const { DDL_CONTA_LIBROS_MANUAL } = require('../lib/conta-libros-manual');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const marker = 'CONTA_LIBROS_MANUAL:TABLE';
  const qryWithTag = `/* ${marker} */\n${DDL_CONTA_LIBROS_MANUAL}`;
  const pool = await getUpdateDbPool();
  const result = await insertUpdateQueryIfMissing(pool, {
    qry: qryWithTag,
    version: 2026,
    db: 'P',
    existsQuery: `
      SELECT ID FROM UPDATE_QUERIES
      WHERE VERSION = @VERSION AND DB = @DB
        AND QRY LIKE @LIKE
    `,
    existsInputs: { LIKE: `%${marker}%` },
  });
  if (result.inserted) {
    console.log('[CONTA_LIBROS_MANUAL] Insertado UPDATE_QUERIES ID=', result.ids.join(', '));
  } else {
    console.log('[CONTA_LIBROS_MANUAL] Ya existe:', result.ids.join(', '));
  }
  await closeUpdateDbPool();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closeUpdateDbPool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
