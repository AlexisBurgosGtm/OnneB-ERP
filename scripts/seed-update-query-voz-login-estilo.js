/**
 * SETTINGS: DICE LA HORA EN VOZ ALTA + ESTILO DEL LOGIN → UPDATE_QUERIES (2026 / P).
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { readSqlChunksFromScripts, insertUpdateQueryIfMissing } = require('./lib/seed-update-query');

const FILE = 'dbo.SETTINGS_VOZ_LOGIN.sql';
const MARKER_PREFIX = 'SETTINGS:VOZ_LOGIN_ESTILO';

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }
  const pool = await getUpdateDbPool();
  let inserted = 0;
  const chunks = readSqlChunksFromScripts(FILE);
  for (const chunk of chunks) {
    const marker = `${MARKER_PREFIX}:${chunk.name}`;
    const qry = `/* ${marker} */\n${chunk.qry}`;
    const result = await insertUpdateQueryIfMissing(pool, {
      qry,
      version: 2026,
      db: 'P',
      existsQuery: `
          SELECT ID FROM UPDATE_QUERIES
          WHERE VERSION = @VERSION AND DB = @DB AND QRY LIKE @LIKE
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
