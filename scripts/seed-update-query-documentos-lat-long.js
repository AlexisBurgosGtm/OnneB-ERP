/**
 * DOCUMENTOS.LAT / DOCUMENTOS.[LONG] (GPS al finalizar pedido vendedor) → UPDATE_QUERIES.
 *   npm run seed:updater:documentos-lat-long
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const {
  readSqlChunksFromScripts,
  insertUpdateQueryIfMissing,
} = require('./lib/seed-update-query');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const chunks = readSqlChunksFromScripts('dbo.DOCUMENTOS_LAT_LONG.sql');
  const pool = await getUpdateDbPool();

  for (const chunk of chunks) {
    const marker = `DOCUMENTOS_LAT_LONG:${chunk.name}`;
    const qryWithTag = `/* ${marker} */\n${chunk.qry}`;
    const result = await insertUpdateQueryIfMissing(pool, {
      qry: qryWithTag,
      version: 2026,
      db: 'P',
      existsQuery: `
        SELECT ID FROM UPDATE_QUERIES
        WHERE VERSION = @VERSION AND DB = @DB
          AND QRY LIKE @LIKE
      `,
      existsInputs: {
        LIKE: `%${marker}%`,
      },
    });
    if (result.inserted) {
      console.log(`[${chunk.name}] Insertado UPDATE_QUERIES ID=`, result.ids.join(', '));
    } else {
      console.log(`[${chunk.name}] Ya existe:`, result.ids.join(', '));
    }
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
