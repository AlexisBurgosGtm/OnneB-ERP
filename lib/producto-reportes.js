const { STATUS_ANULADO } = require('./documento-status');
const { TIPODOC_FACTURA } = require('./corte-caja-docs');

const SQL_TIPODOC_FACTURA_IN = TIPODOC_FACTURA.map((t) => `'${t}'`).join(', ');
/** Documentos fiscales electrónicos (ventas + notas crédito FNC). */
const TIPODOC_FISCAL = ['FEF', 'FEC', 'FES', 'FNC'];
const SQL_TIPODOC_FISCAL_IN = TIPODOC_FISCAL.map((t) => `'${t}'`).join(', ');
const TIPODOC_COMPRA = 'COM';
const REPORT_LIMIT = 3000;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapMovimientoRow(r) {
  const tipom = toNumber(r.TIPOM);
  const unidades = toNumber(r.TOTALUNIDADES);
  return {
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    FECHA: r.FECHA ?? null,
    HORA: r.HORA ?? null,
    MINUTO: r.MINUTO ?? null,
    DOC_NOMCLIE: r.DOC_NOMCLIE ?? null,
    TIPODOC: r.TIPODOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TOTALUNIDADES: unidades,
    ENTRADAS: tipom === 1 ? unidades : null,
    SALIDAS: tipom === -1 ? unidades : null,
  };
}

function mapDocLineaRow(r) {
  return {
    ID: r.ID ?? null,
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    FECHA: r.FECHA ?? null,
    HORA: r.HORA ?? null,
    MINUTO: r.MINUTO ?? null,
    DOC_NOMCLIE: r.DOC_NOMCLIE ?? null,
    TIPODOC: r.TIPODOC ?? null,
    DESDOC: r.DESDOC ?? null,
    CODMEDIDA: r.CODMEDIDA ?? null,
    TOTALUNIDADES: toNumber(r.TOTALUNIDADES),
    PRECIO: toNumber(r.PRECIO),
    COSTO: toNumber(r.COSTO),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    TOTALCOSTO: toNumber(r.TOTALCOSTO),
    STATUS: r.STATUS ?? null,
  };
}

/**
 * Movimientos de inventario del producto (TIPOM = 1 entrada, -1 salida).
 * @param {{ fiscalOnly?: boolean }} [opts]
 */
async function listMovimientosProducto(pool, sql, empnit, codprod, q = '', opts = {}) {
  const fiscalOnly = Boolean(opts.fiscalOnly);
  const search = String(q || '').trim();
  const qLike = search ? `%${search}%` : null;
  const tipodocFilter = fiscalOnly ? `AND t.TIPODOC IN (${SQL_TIPODOC_FISCAL_IN})` : '';

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('STATUS_ANULADO', sql.VarChar, STATUS_ANULADO)
    .input('q', sql.NVarChar, search || null)
    .input('qLike', sql.NVarChar, qLike)
    .input('limit', sql.Int, REPORT_LIMIT)
    .query(`
      SELECT
        recent.CODDOC,
        recent.CORRELATIVO,
        recent.FECHA,
        recent.HORA,
        recent.MINUTO,
        recent.DOC_NOMCLIE,
        recent.TIPODOC,
        recent.DESDOC,
        recent.TIPOM,
        recent.TOTALUNIDADES
      FROM (
        SELECT TOP (@limit)
          d.ID,
          d.CODDOC,
          d.CORRELATIVO,
          d.FECHA,
          d.HORA,
          d.MINUTO,
          d.DOC_NOMCLIE,
          t.TIPODOC,
          t.DESDOC,
          ISNULL(l.TIPOM, t.TIPOM) AS TIPOM,
          ISNULL(l.TOTALUNIDADES, 0) AS TOTALUNIDADES
        FROM dbo.DOCPRODUCTOS l
        INNER JOIN dbo.DOCUMENTOS d
          ON d.EMPNIT = l.EMPNIT
          AND d.CODDOC = l.CODDOC
          AND d.CORRELATIVO = l.CORRELATIVO
        INNER JOIN dbo.TIPODOCUMENTOS t
          ON t.EMPNIT = l.EMPNIT
          AND t.CODDOC = l.CODDOC
        WHERE l.EMPNIT = @EMPNIT
          AND LTRIM(RTRIM(l.CODPROD)) = LTRIM(RTRIM(@CODPROD))
          AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
          AND ISNULL(l.TIPOM, t.TIPOM) IN (1, -1)
          AND ISNULL(l.TOTALUNIDADES, 0) <> 0
          ${tipodocFilter}
          AND (
            @q IS NULL OR @q = ''
            OR d.CODDOC LIKE @qLike
            OR CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
            OR d.DOC_NOMCLIE LIKE @qLike
            OR t.TIPODOC LIKE @qLike
            OR t.DESDOC LIKE @qLike
          )
        ORDER BY d.ID DESC
      ) recent
      ORDER BY recent.ID ASC
    `);

  return result.recordset.map(mapMovimientoRow);
}

async function listMovimientosFiscalesProducto(pool, sql, empnit, codprod, q = '') {
  return listMovimientosProducto(pool, sql, empnit, codprod, q, { fiscalOnly: true });
}

/**
 * Líneas en documentos de factura (FAC, FEF, FEC, FES).
 */
async function listVentasProducto(pool, sql, empnit, codprod) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('STATUS_ANULADO', sql.VarChar, STATUS_ANULADO)
    .input('limit', sql.Int, REPORT_LIMIT)
    .query(`
      SELECT TOP (@limit)
        d.ID,
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        d.DOC_NOMCLIE,
        d.STATUS,
        t.TIPODOC,
        t.DESDOC,
        l.CODMEDIDA,
        ISNULL(l.TOTALUNIDADES, 0) AS TOTALUNIDADES,
        ISNULL(l.PRECIO, 0) AS PRECIO,
        ISNULL(l.COSTO, 0) AS COSTO,
        ISNULL(l.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(l.TOTALCOSTO, 0) AS TOTALCOSTO
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = l.EMPNIT
        AND d.CODDOC = l.CODDOC
        AND d.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = l.EMPNIT
        AND t.CODDOC = l.CODDOC
      WHERE l.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(l.CODPROD)) = LTRIM(RTRIM(@CODPROD))
        AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
        AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
      ORDER BY d.ID DESC
    `);

  return result.recordset.map(mapDocLineaRow);
}

/**
 * Líneas en documentos de compra (COM).
 */
async function listComprasProducto(pool, sql, empnit, codprod) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('STATUS_ANULADO', sql.VarChar, STATUS_ANULADO)
    .input('TIPODOC', sql.VarChar, TIPODOC_COMPRA)
    .input('limit', sql.Int, REPORT_LIMIT)
    .query(`
      SELECT TOP (@limit)
        d.ID,
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        d.DOC_NOMCLIE,
        d.STATUS,
        t.TIPODOC,
        t.DESDOC,
        l.CODMEDIDA,
        ISNULL(l.TOTALUNIDADES, 0) AS TOTALUNIDADES,
        ISNULL(l.PRECIO, 0) AS PRECIO,
        ISNULL(l.COSTO, 0) AS COSTO,
        ISNULL(l.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(l.TOTALCOSTO, 0) AS TOTALCOSTO
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = l.EMPNIT
        AND d.CODDOC = l.CODDOC
        AND d.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = l.EMPNIT
        AND t.CODDOC = l.CODDOC
      WHERE l.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(l.CODPROD)) = LTRIM(RTRIM(@CODPROD))
        AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
        AND t.TIPODOC = @TIPODOC
      ORDER BY d.ID DESC
    `);

  return result.recordset.map(mapDocLineaRow);
}

module.exports = {
  TIPODOC_FISCAL,
  SQL_TIPODOC_FISCAL_IN,
  listMovimientosProducto,
  listMovimientosFiscalesProducto,
  listVentasProducto,
  listComprasProducto,
};
