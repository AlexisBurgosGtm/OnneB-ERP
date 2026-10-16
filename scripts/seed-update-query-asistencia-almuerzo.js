/**
 * Columnas almuerzo + setting CONTROL ASISTENCIA ALMUERZO → UPDATE_QUERIES (2026 / P).
 * Uso: npm run seed:updater:asistencia-almuerzo
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { readSqlChunksFromScripts, insertUpdateQueryIfMissing } = require('./lib/seed-update-query');

const FILES = [
  { file: 'dbo.CONTROL_ASISTENCIA_ALMUERZO.sql', markerPrefix: 'ASISTENCIA:ALMUERZO' },
  { file: 'dbo.SETTINGS_ASISTENCIA_ALMUERZO.sql', markerPrefix: 'SETTINGS:ASISTENCIA' },
];

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }
  const pool = await getUpdateDbPool();
  let inserted = 0;
  for (const { file, markerPrefix } of FILES) {
    const chunks = readSqlChunksFromScripts(file);
    for (const chunk of chunks) {
      const marker = `${markerPrefix}:${chunk.name}`;
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
