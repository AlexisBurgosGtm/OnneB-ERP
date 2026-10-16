/**
 * PRODUCTOS.USA_LOTES → UPDATE_QUERIES (VERSION 2026 / DB P).
 * Uso: npm run seed:updater:productos-usa-lotes
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { readSqlChunksFromScripts, insertUpdateQueryIfMissing } = require('./lib/seed-update-query');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const chunks = readSqlChunksFromScripts('dbo.PRODUCTOS_USA_LOTES.sql');
  const pool = await getUpdateDbPool();
  let inserted = 0;
  for (const chunk of chunks) {
    const marker = `PRODUCTOS:USA_LOTES:${chunk.name}`;
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
  console.log(`Listo. ${inserted} chunk(s) nuevos. Ejecute Actualizador BD (2026 / P).`);
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
