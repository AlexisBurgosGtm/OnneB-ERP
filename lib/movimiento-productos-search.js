const sql = require('mssql');
const { mapProductoSearchRow } = require('./producto-precio-linea');
const { sqlExistenciaMedidaExpr } = require('./existencia-medida');

/**
 * Búsqueda de productos para movimientos (POS, cotizaciones, facturación, compras, inventario).
 * JOINs directos: PRODUCTOS + PRECIOS + Marcas + INVSALDO por claves de negocio.
 */
async function searchMovimientoProductos(pool, {
  empnit,
  q,
  limit = 40,
  campoPrecio,
  extraWhereSql = '',
  includeMayoreo = true,
  allowEmptyQ = false,
}) {
  const term = String(q ?? '').trim();
  if (!term && !allowEmptyQ) {
    return { rows: [], q: null, ...(campoPrecio ? { campoPrecio } : {}) };
  }

  const mayoreoSelect = includeMayoreo ? 'pr.MAYOREOA, pr.MAYOREOB, pr.MAYOREOC,' : '';
  const hasTerm = Boolean(term);

  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('limit', sql.Int, limit);
  if (hasTerm) {
    request.input('qLike', sql.NVarChar, `%${term}%`);
  }

  const qFilter = hasTerm
    ? `AND (
        p.CODPROD LIKE @qLike OR p.CODPROD2 LIKE @qLike
        OR p.DESPROD LIKE @qLike OR p.DESPROD2 LIKE @qLike
        OR m.DESMARCA LIKE @qLike
      )`
    : '';

  const result = await request.query(`
    SELECT TOP (@limit)
      p.CODPROD,
      p.DESPROD,
      p.DESPROD2,
      m.DESMARCA,
      p.COSTO AS COSTO_PROD,
      p.TIPOPROD,
      pr.CODMEDIDA,
      pr.PRECIO,
      ${mayoreoSelect}
      pr.COSTO,
      pr.EQUIVALE,
      ${sqlExistenciaMedidaExpr('pr.EQUIVALE')}
    FROM dbo.PRODUCTOS p
    INNER JOIN dbo.PRECIOS pr
      ON p.EMPNIT = pr.EMPNIT AND p.CODPROD = pr.CODPROD
    LEFT JOIN dbo.Marcas m
      ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
    LEFT JOIN dbo.INVSALDO inv
      ON inv.EMPNIT = p.EMPNIT
     AND inv.CODPROD = p.CODPROD
    WHERE p.EMPNIT = @EMPNIT
      AND UPPER(RTRIM(ISNULL(p.HABILITADO, 'SI'))) = 'SI'
      AND UPPER(RTRIM(ISNULL(pr.HABILITADO, 'SI'))) = 'SI'
      ${extraWhereSql}
      ${qFilter}
    ORDER BY p.DESPROD, pr.CODMEDIDA
  `);

  const rows = result.recordset.map((row) =>
    mapProductoSearchRow(
      {
        CODPROD: row.CODPROD,
        DESPROD: row.DESPROD,
        DESPROD2: row.DESPROD2 ?? '',
        DESMARCA: row.DESMARCA ?? '',
        COSTO_PROD: row.COSTO_PROD,
        TIPOPROD: row.TIPOPROD,
        CODMEDIDA: row.CODMEDIDA,
        PRECIO: row.PRECIO,
        MAYOREOA: row.MAYOREOA,
        MAYOREOB: row.MAYOREOB,
        MAYOREOC: row.MAYOREOC,
        COSTO: row.COSTO ?? row.COSTO_PROD,
        EQUIVALE: row.EQUIVALE,
        EXISTENCIA: row.EXISTENCIA,
      },
      campoPrecio
    )
  );

  return {
    rows,
    q: term || null,
    ...(campoPrecio ? { campoPrecio } : {}),
  };
}

module.exports = { searchMovimientoProductos };
