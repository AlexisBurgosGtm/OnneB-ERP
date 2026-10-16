/**
 * Lotes de vencimiento — detección de columna en BD del cliente.
 * DDL solo vía Actualizador BD (scripts/sql + npm run seed:updater:*), no ALTER en runtime.
 */
const SQL_USA_LOTES_EXISTS = `
  SELECT TOP 1 1 AS OK
  FROM sys.columns c
  INNER JOIN sys.tables t ON c.object_id = t.object_id
  INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
  WHERE s.name = N'dbo' AND t.name = N'PRODUCTOS' AND c.name = N'USA_LOTES'
`;

let usaLotesColumnReady = null;

async function productoUsaLotesColumnExists(db) {
  if (usaLotesColumnReady) return true;
  if (!db) return false;
  try {
    const r = await db.request().query(SQL_USA_LOTES_EXISTS);
    if (r.recordset?.length) {
      usaLotesColumnReady = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function resetLoteSchemaCacheForTests() {
  usaLotesColumnReady = null;
}

module.exports = {
  productoUsaLotesColumnExists,
  resetLoteSchemaCacheForTests,
};
