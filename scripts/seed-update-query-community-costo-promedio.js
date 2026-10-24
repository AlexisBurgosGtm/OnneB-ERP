/**
 * COMMUNITY_* .COSTO_PROMEDIO → UPDATE_QUERIES (host catálogo Online Services).
 * Uso: node scripts/seed-update-query-community-costo-promedio.js
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

  const pool = await getUpdateDbPool();

  const sqlFiles = [
    { file: 'dbo.COMMUNITY_COSTO_PROMEDIO_COLUMNS.sql', markerPrefix: 'COMMUNITY_COSTO_PROMEDIO' },
    { file: 'dbo.COMMUNITY_PRODUCTOS_LASTSALE.sql', markerPrefix: 'COMMUNITY_CATALOG' },
    { file: 'dbo.COMMUNITY_MARCAS_LASTSALE.sql', markerPrefix: 'COMMUNITY_CATALOG' },
  ];

  for (const { file, markerPrefix } of sqlFiles) {
    const chunks = readSqlChunksFromScripts(file);
    for (const chunk of chunks) {
      const marker = `${markerPrefix}:${chunk.name}`;
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
