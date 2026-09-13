/**
 * CONTA_ASIENTOS + CONTA_ASIENTOS_LINEAS → UPDATE_QUERIES (sin archivo .sql local).
 * Uso (OnneB o FS-SV; BD UPDATE_* compartida):
 *   node scripts/seed-update-query-conta-asientos.js
 *
 * Luego: Configuraciones → Actualizador BD → Año 2026 → Ejecutar.
 */
require('dotenv').config();
const { getUpdateDbConfig } = require('../config/update-database');
const { getUpdateDbPool, closeUpdateDbPool } = require('../lib/update-db-pool');
const { insertUpdateQueryIfMissing } = require('./lib/seed-update-query');
const { DDL_CONTA_ASIENTOS, DDL_CONTA_ASIENTOS_LINEAS } = require('../lib/conta-asientos');

async function main() {
  if (!getUpdateDbConfig()) {
    throw new Error('UPDATE_* no configurado en .env');
  }

  const chunks = [
    { name: 'CONTA_ASIENTOS', qry: DDL_CONTA_ASIENTOS },
    { name: 'CONTA_ASIENTOS_LINEAS', qry: DDL_CONTA_ASIENTOS_LINEAS },
  ];

  const pool = await getUpdateDbPool();
  for (const chunk of chunks) {
    const marker = `CONTA_ASIENTOS:${chunk.name}`;
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
      existsInputs: { LIKE: `%${marker}%` },
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
