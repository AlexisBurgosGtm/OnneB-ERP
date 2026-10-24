/**
 * DOCUMENTOS.RESTAURANTE_MESA_ID → UPDATE_QUERIES (VERSION 2026 / DB P).
 * Uso: npm run seed:updater:documentos-mesa-restaurante
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { insertUpdateQueryIfMissing } = require('./lib/seed-update-query');
const { ENSURE_MESA_SQL } = require('../lib/documentos-mesa-restaurante');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const marker = 'DOCUMENTOS:RESTAURANTE_MESA_ID';
  const qry = `/* ${marker} */
${ENSURE_MESA_SQL}
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
    console.log('[DOCUMENTOS.RESTAURANTE_MESA_ID] Insertado UPDATE_QUERIES ID=', result.ids.join(', '));
  } else {
    console.log('[DOCUMENTOS.RESTAURANTE_MESA_ID] Ya existe:', result.ids.join(', '));
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
