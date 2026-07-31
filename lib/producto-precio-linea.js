/** JOIN PRODUCTOS ↔ PRECIOS tolerando espacios en char/varchar legacy. */
const SQL_PRECIOS_JOIN = `
  INNER JOIN dbo.PRECIOS pr
    ON p.EMPNIT = pr.EMPNIT
   AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(pr.CODPROD))
`;

const SQL_PRODUCTO_PRECIOS_HABILITADO = `
  AND UPPER(LTRIM(RTRIM(ISNULL(p.HABILITADO, '')))) = 'SI'
  AND UPPER(LTRIM(RTRIM(ISNULL(pr.HABILITADO, '')))) = 'SI'
`;

/** Filtro LIKE para búsqueda en movimientos (requiere @qLike). Incluye DESPROD2 concatenado. */
const SQL_PRODUCTO_BUSQUEDA_WHERE = `
  (
    p.CODPROD LIKE @qLike OR p.CODPROD2 LIKE @qLike
    OR (LTRIM(RTRIM(ISNULL(p.DESPROD, ''))) + ' ' + LTRIM(RTRIM(ISNULL(p.DESPROD2, '')))) LIKE @qLike
    OR m.DESMARCA LIKE @qLike
  )
`;

/** Columnas dbo.PRECIOS usadas al listar / agregar líneas. */
const LINE_SELECT = `
  p.CODPROD, p.DESPROD, p.COSTO AS COSTO_PROD, p.TIPOPROD, p.EXENTO,
  pr.PRECIO, pr.MAYOREOA, pr.MAYOREOB, pr.MAYOREOC,
  pr.COSTO, pr.EQUIVALE, pr.CODMEDIDA, pr.PESO
`;

const { getPrecioFromPreciosRow, normalizePreciosField } = require('./doc-producto-linea');
const { calcExistenciaMedida, roundExistencia } = require('./existencia-medida');

function roundLineNum(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function pesoFromPreciosRow(row) {
  const n = Number(row?.PESO);
  return Number.isNaN(n) ? 0 : roundLineNum(n);
}

function calcLinePeso(cantidad, pesoUnit) {
  const qty = Number(cantidad) || 0;
  const p = Number(pesoUnit) || 0;
  return roundLineNum(qty * p);
}

function trimRow(row) {
  if (!row) return row;
  return {
    ...row,
    CODPROD: String(row.CODPROD ?? '').trim(),
    CODMEDIDA: String(row.CODMEDIDA ?? '').trim(),
  };
}

/**
 * Busca producto + precio habilitado para insertar línea de documento.
 * Resuelve espacios en CODPROD/CODMEDIDA; si la medida no coincide, usa el primer precio activo.
 */
async function fetchProductoPrecioForLinea(pool, sql, { empnit, codprod, codmedida }) {
  const cod = String(codprod ?? '').trim();
  const med = String(codmedida ?? '').trim();
  if (!cod) return null;

  if (med) {
    const exact = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROD', sql.VarChar, cod)
      .input('CODMEDIDA', sql.VarChar, med)
      .query(`
        SELECT ${LINE_SELECT}
        FROM dbo.PRODUCTOS p
        ${SQL_PRECIOS_JOIN}
        WHERE p.EMPNIT = @EMPNIT
          AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(@CODPROD))
          AND LTRIM(RTRIM(pr.CODMEDIDA)) = LTRIM(RTRIM(@CODMEDIDA))
          ${SQL_PRODUCTO_PRECIOS_HABILITADO}
      `);
    if (exact.recordset.length) {
      const row = trimRow(exact.recordset[0]);
      return { row, codmedida: row.CODMEDIDA };
    }
  }

  const fallback = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, cod)
    .query(`
      SELECT TOP 1 ${LINE_SELECT}
      FROM dbo.PRODUCTOS p
      ${SQL_PRECIOS_JOIN}
      WHERE p.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(@CODPROD))
        ${SQL_PRODUCTO_PRECIOS_HABILITADO}
      ORDER BY pr.EQUIVALE DESC, LTRIM(RTRIM(pr.CODMEDIDA))
    `);
  if (!fallback.recordset.length) return null;
  const row = trimRow(fallback.recordset[0]);
  return { row, codmedida: row.CODMEDIDA };
}

function mapProductoSearchRow(row, preciosField) {
  const campo = normalizePreciosField(preciosField);
  let existencia;
  if (row.EXISTENCIA !== undefined && row.EXISTENCIA !== null && row.SALDO === undefined) {
    existencia = roundExistencia(row.EXISTENCIA);
  } else if (row.SALDO !== undefined) {
    existencia = calcExistenciaMedida(row.SALDO, row.EQUIVALE);
  }
  return {
    ...row,
    CODPROD: String(row.CODPROD ?? '').trim(),
    CODMEDIDA: String(row.CODMEDIDA ?? '').trim(),
    PRECIO: getPrecioFromPreciosRow(row, campo),
    ...(existencia !== undefined ? { EXISTENCIA: existencia } : {}),
  };
}

module.exports = {
  SQL_PRECIOS_JOIN,
  SQL_PRODUCTO_PRECIOS_HABILITADO,
  SQL_PRODUCTO_BUSQUEDA_WHERE,
  fetchProductoPrecioForLinea,
  mapProductoSearchRow,
  pesoFromPreciosRow,
  calcLinePeso,
};
