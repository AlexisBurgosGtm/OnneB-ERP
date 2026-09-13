/**
 * DOCUMENTOS_ENTREGAS → UPDATE_QUERIES (VERSION 2026 / DB P).
 * Uso: node scripts/seed-update-query-documentos-entregas.js
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { readSqlFromScripts, insertUpdateQueryIfMissing } = require('./lib/seed-update-query');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const marker = 'DOCUMENTOS_ENTREGAS:CREATE';
  const qry = `/* ${marker} */\n${readSqlFromScripts('dbo.DOCUMENTOS_ENTREGAS.sql')}`;
  const pool = await getUpdateDbPool();
  const result = await insertUpdateQueryIfMissing(pool, {
    qry,
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
    console.log('[DOCUMENTOS_ENTREGAS] Insertado UPDATE_QUERIES ID=', result.ids.join(', '));
  } else {
    console.log('[DOCUMENTOS_ENTREGAS] Ya existe:', result.ids.join(', '));
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
