/**
 * Columnas opcionales en dbo.PRODUCTOS — detección en BD del cliente.
 * DDL vía Actualizador BD, no ALTER en runtime del POS.
 */
const SQL_LASTUPDATE_EXISTS = `
  SELECT TOP 1 1 AS OK
  FROM sys.columns c
  INNER JOIN sys.tables t ON c.object_id = t.object_id
  INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
  WHERE s.name = N'dbo' AND t.name = N'PRODUCTOS' AND c.name = N'LASTUPDATE'
`;

let lastUpdateColumnReady = null;

async function productoLastUpdateColumnExists(db) {
  if (lastUpdateColumnReady) return true;
  if (!db) return false;
  try {
    const r = await db.request().query(SQL_LASTUPDATE_EXISTS);
    if (r.recordset?.length) {
      lastUpdateColumnReady = true;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function resetProductoSchemaCacheForTests() {
  lastUpdateColumnReady = null;
}

module.exports = {
  productoLastUpdateColumnExists,
  resetProductoSchemaCacheForTests,
};
