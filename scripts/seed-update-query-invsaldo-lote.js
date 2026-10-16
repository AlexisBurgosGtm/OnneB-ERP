/**
 * Lotes de vencimiento — INVSALDO_LOTE, USA_LOTES, NOLOTE, FVENCLOTE → UPDATE_QUERIES.
 * Uso: npm run seed:updater:lotes
 * (Re-publica chunks en UPDATE_QUERIES; si un query antiguo falló en el Actualizador, elimínelo o corríjalo en hosting.)
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { readSqlChunksFromScripts, insertUpdateQueryIfMissing } = require('./lib/seed-update-query');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const chunks = readSqlChunksFromScripts('dbo.INVSALDO_LOTE_SCHEMA.sql');
  const pool = await getUpdateDbPool();
  let inserted = 0;
  for (const chunk of chunks) {
    const marker = `INVSALDO:LOTE:${chunk.name}`;
    const qry = `/* ${marker} */\n${chunk.qry}`;
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
      inserted += 1;
      console.log(`[${chunk.name}] Insertado UPDATE_QUERIES ID=`, result.ids.join(', '));
    } else {
      console.log(`[${chunk.name}] Ya existe:`, result.ids.join(', '));
    }
  }
  console.log(`Listo. ${inserted} chunk(s) nuevos.`);
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
