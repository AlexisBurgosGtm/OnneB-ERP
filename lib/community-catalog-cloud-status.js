/**
 * Resumen del catálogo en nube (host UPDATE_*) por TOKEN de instalación.
 */
const sql = require('mssql');
const { CLOUD_EMPNIT } = require('./community-catalog-upload');

function safeIdent(name) {
  return String(name || '').replace(/[^A-Za-z0-9_]/g, '');
}

function formatLastSale(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function hostTableHasColumn(hostPool, tableName, columnName) {
  const table = safeIdent(tableName);
  const col = safeIdent(columnName);
  if (!table || !col) return false;
  const result = await hostPool.request().input('TABLE', sql.VarChar, table).input('COL', sql.VarChar, col)
    .query(`
      SELECT 1 AS ok
      FROM sys.columns c
      INNER JOIN sys.objects o ON o.object_id = c.object_id
      WHERE o.name = @TABLE AND c.name = @COL AND SCHEMA_NAME(o.schema_id) = 'dbo'
    `);
  return (result.recordset || []).length > 0;
}

/**
 * @param {import('mssql').ConnectionPool} hostPool
 * @param {string} token
 * @param {string} tableName e.g. COMMUNITY_PRODUCTOS
 */
async function cloudTableStats(hostPool, token, tableName) {
  const table = safeIdent(tableName);
  const tokenVal = String(token || '').trim();
  if (!table || !tokenVal) {
    return { count: 0, lastSale: null, lastSaleRaw: null };
  }

  const hasLastSale = await hostTableHasColumn(hostPool, table, 'LASTSALE');
  const lastSaleExpr = hasLastSale ? 'MAX(LASTSALE) AS lastSaleRaw' : 'CAST(NULL AS DATETIME) AS lastSaleRaw';

  const result = await hostPool
    .request()
    .input('TOKEN', sql.VarChar, tokenVal)
    .input('EMPNIT', sql.VarChar, CLOUD_EMPNIT)
    .query(`
      SELECT COUNT(*) AS cnt, ${lastSaleExpr}
      FROM dbo.[${table}]
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND UPPER(LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50))))) = UPPER(LTRIM(RTRIM(@EMPNIT)))
    `);

  const row = result.recordset?.[0] || {};
  const raw = row.lastSaleRaw;
  return {
    count: Number(row.cnt) || 0,
    lastSale: formatLastSale(raw),
    lastSaleRaw: raw instanceof Date ? raw.toISOString() : raw != null ? String(raw) : null,
    hasLastSaleColumn: hasLastSale,
  };
}

/**
 * @param {import('mssql').ConnectionPool} hostPool
 * @param {string} token
 */
async function getCatalogCloudStatus(hostPool, token) {
  const [productos, marcas] = await Promise.all([
    cloudTableStats(hostPool, token, 'COMMUNITY_PRODUCTOS'),
    cloudTableStats(hostPool, token, 'COMMUNITY_MARCAS'),
  ]);
  return {
    ok: true,
    empnitCloud: CLOUD_EMPNIT,
    productos,
    marcas,
  };
}

module.exports = {
  getCatalogCloudStatus,
  cloudTableStats,
  formatLastSale,
};
