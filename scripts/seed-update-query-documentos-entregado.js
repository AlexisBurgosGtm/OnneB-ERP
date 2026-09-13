/**
 * DOCUMENTOS.ENTREGADO (INT) → UPDATE_QUERIES (VERSION 2026 / DB P).
 * null|0 = no entregado, 1 = entregado.
 * Uso: node scripts/seed-update-query-documentos-entregado.js
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { insertUpdateQueryIfMissing } = require('./lib/seed-update-query');
const { ENSURE_ENTREGADO_SQL } = require('../lib/documentos-entregado');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const marker = 'DOCUMENTOS:ENTREGADO_INT';
  const qry = `/* ${marker} */
${ENSURE_ENTREGADO_SQL}
`;
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
    console.log('[DOCUMENTOS.ENTREGADO_INT] Insertado UPDATE_QUERIES ID=', result.ids.join(', '));
  } else {
    console.log('[DOCUMENTOS.ENTREGADO_INT] Ya existe:', result.ids.join(', '));
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
