/**
 * whatsapp_contactos / whatsapp_programacion / whatsapp_programacion_contactos
 * → UPDATE_QUERIES (sin .sql local).
 * Uso: node scripts/seed-update-query-whatsapp-programacion.js
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { insertUpdateQueryIfMissing } = require('./lib/seed-update-query');
const { DDL_WHATSAPP_PROGRAMACION } = require('../lib/whatsapp-programacion');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const marker = 'WHATSAPP_PROGRAMACION:TABLES';
  const qryWithTag = `/* ${marker} */\n${DDL_WHATSAPP_PROGRAMACION}`;
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
    console.log('[WHATSAPP_PROGRAMACION] Insertado UPDATE_QUERIES ID=', result.ids.join(', '));
  } else {
    console.log('[WHATSAPP_PROGRAMACION] Ya existe:', result.ids.join(', '));
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
