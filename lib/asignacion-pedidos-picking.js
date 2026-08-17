const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');
const { TIPODOC_FACTURA } = require('./corte-caja-docs');
const { fechaIsoFromValue } = require('./documento-fecha');

const TIPODOCS = [...TIPODOC_FACTURA, 'FEL'].filter((v, i, a) => a.indexOf(v) === i);
const SQL_TIPODOCS = TIPODOCS.map((t) => `'${t}'`).join(', ');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calcCajasUnidades(totalUnidades, uxcRaw) {
  const total = toNumber(totalUnidades);
  const uxc = toNumber(uxcRaw);
  if (!uxc || uxc <= 0) {
    return { UXC: 0, CAJAS: 0, UNIDADES: Math.floor(total) };
  }
  const cajas = Math.floor(total / uxc);
  const unidades = Math.floor((total / uxc - cajas) * uxc);
  return { UXC: uxc, CAJAS: cajas, UNIDADES: unidades };
}

const SQL_DOC_EMBARQUE = `
  FROM dbo.DOCUMENTOS d
  INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
  WHERE d.EMPNIT = @EMPNIT
    AND t.TIPODOC IN (${SQL_TIPODOCS})
    AND LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) = @CODEMBARQUE
    AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
`;

/**
 * Picking agrupado por producto (facturas del embarque, sin anuladas).
 * @param {{ conExistencia?: boolean }} [opts]
 */
async function fetchPickingEmbarque(pool, empnit, codembarque, opts = {}) {
  const conExistencia = Boolean(opts.conExistencia);
  const existenciaSelect = conExistencia
    ? `, ISNULL((
        SELECT SUM(ISNULL(i.SALDO, 0))
        FROM dbo.INVSALDO i
        WHERE i.EMPNIT = dp.EMPNIT AND LTRIM(RTRIM(i.CODPROD)) = LTRIM(RTRIM(dp.CODPROD))
      ), 0) AS EXISTENCIA`
    : '';

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMBARQUE', sql.VarChar, String(codembarque || '').trim())
    .query(`
      SELECT
        LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
        MAX(ISNULL(NULLIF(LTRIM(RTRIM(dp.DESPROD)), ''), ISNULL(p.DESPROD, dp.CODPROD))) AS DESPROD,
        ISNULL(MAX(p.UXC), 0) AS UXC,
        ISNULL(SUM(ISNULL(dp.TOTALUNIDADES, 0)), 0) AS TOTALUNIDADES,
        ISNULL(SUM(ISNULL(dp.TOTALPRECIO, 0)), 0) AS IMPORTE
        ${existenciaSelect}
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = dp.EMPNIT AND d.CODDOC = dp.CODDOC AND d.CORRELATIVO = dp.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      LEFT JOIN dbo.PRODUCTOS p ON p.EMPNIT = dp.EMPNIT AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(dp.CODPROD))
      WHERE dp.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOCS})
        AND LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) = @CODEMBARQUE
        AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
      GROUP BY LTRIM(RTRIM(dp.CODPROD)), dp.EMPNIT
      ORDER BY MAX(ISNULL(NULLIF(LTRIM(RTRIM(dp.DESPROD)), ''), ISNULL(p.DESPROD, dp.CODPROD)))
    `);

  return result.recordset.map((r) => {
    const totalUnidades = toNumber(r.TOTALUNIDADES);
    const calc = calcCajasUnidades(totalUnidades, r.UXC);
    return {
      CODPROD: String(r.CODPROD || '').trim(),
      DESPROD: String(r.DESPROD || '').trim(),
      UXC: calc.UXC,
      TOTALUNIDADES: totalUnidades,
      CAJAS: calc.CAJAS,
      UNIDADES: calc.UNIDADES,
      IMPORTE: toNumber(r.IMPORTE),
      EXISTENCIA: conExistencia ? toNumber(r.EXISTENCIA) : undefined,
    };
  });
}

/** Listado de documentos del embarque (sin anuladas). */
async function fetchDocumentosEmbarque(pool, empnit, codembarque) {
  const sqlEmpleado = `ISNULL((
    SELECT TOP 1 e.NOMEMPLEADO
    FROM dbo.Empleados e
    WHERE e.EMPNIT = d.EMPNIT AND e.CODEMPLEADO = d.CODVEN
  ), '')`;

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMBARQUE', sql.VarChar, String(codembarque || '').trim())
    .query(`
      SELECT
        ${sqlEmpleado} AS VENDEDOR,
        d.FECHA,
        d.CODDOC,
        t.TIPODOC,
        t.DESDOC,
        d.CORRELATIVO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NIT)), ''), '') AS NIT,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), '') AS CLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_DIRCLIE)), ''), '') AS DIRECCION,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.OBS)), ''), '') AS OBSERVACIONES,
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_UUDI)), ''), '') AS FEL_UUDI,
        ISNULL(NULLIF(LTRIM(RTRIM(d.CONCRE)), ''), '') AS CONCRE,
        d.STATUS,
        ISNULL(d.CORTE, 'NO') AS CORTE
      ${SQL_DOC_EMBARQUE}
      ORDER BY ${sqlEmpleado}, d.FECHA, d.CODDOC, d.CORRELATIVO
    `);

  return result.recordset.map((r) => ({
    VENDEDOR: String(r.VENDEDOR || '').trim(),
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    CODDOC: r.CODDOC ?? null,
    TIPODOC: String(r.TIPODOC || '').trim().toUpperCase() || null,
    DESDOC: r.DESDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    NIT: String(r.NIT || '').trim(),
    CLIENTE: String(r.CLIENTE || '').trim(),
    DIRECCION: String(r.DIRECCION || '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    OBSERVACIONES: String(r.OBSERVACIONES || '').trim(),
    FEL_UUDI: String(r.FEL_UUDI || '').trim(),
    CONCRE: String(r.CONCRE || '').trim(),
    STATUS: r.STATUS ?? null,
    CORTE: r.CORTE ?? 'NO',
  }));
}

/** Facturas del embarque que contienen un producto. */
async function fetchFacturasProductoEmbarque(pool, empnit, codembarque, codprod) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMBARQUE', sql.VarChar, String(codembarque || '').trim())
    .input('CODPROD', sql.VarChar, String(codprod || '').trim())
    .query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), '') AS CLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_UUDI)), ''), '') AS FEL_UUDI,
        ISNULL(SUM(ISNULL(dp.TOTALUNIDADES, 0)), 0) AS TOTALUNIDADES
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = dp.EMPNIT AND d.CODDOC = dp.CODDOC AND d.CORRELATIVO = dp.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE dp.EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(dp.CODPROD)) = LTRIM(RTRIM(@CODPROD))
        AND t.TIPODOC IN (${SQL_TIPODOCS})
        AND LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) = @CODEMBARQUE
        AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
      GROUP BY d.CODDOC, d.CORRELATIVO, d.FECHA, d.DOC_NOMCLIE, d.FEL_UUDI
      ORDER BY d.FECHA DESC, d.CODDOC, d.CORRELATIVO DESC
    `);

  return result.recordset.map((r) => ({
    CODDOC: r.CODDOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    CLIENTE: String(r.CLIENTE || '').trim(),
    FEL_UUDI: String(r.FEL_UUDI || '').trim(),
    TOTALUNIDADES: toNumber(r.TOTALUNIDADES),
  }));
}

module.exports = {
  TIPODOCS,
  calcCajasUnidades,
  fetchPickingEmbarque,
  fetchDocumentosEmbarque,
  fetchFacturasProductoEmbarque,
};
