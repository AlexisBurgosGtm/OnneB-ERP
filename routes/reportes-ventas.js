const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, fechaIsoFromRow, normalizeDocumentoRows } = require('../lib/documento-fecha');
const { STATUS_ANULADO, SQL_TIPODOC_REPORTES_SI } = require('../lib/documento-status');

const router = express.Router();

/** Ventas brutas. */
const TIPODOC_VENTA = ['FAC', 'FEF', 'FEC', 'FES'];
/** Devoluciones (restan). */
const TIPODOC_DEVOLUCION = ['DEV', 'FNC', 'FNA'];
const TIPODOC_REPORTE = [...TIPODOC_VENTA, ...TIPODOC_DEVOLUCION];

const SQL_TIPODOC_VENTA_IN = TIPODOC_VENTA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_DEV_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_REPORTE_IN = TIPODOC_REPORTE.map((t) => `'${t}'`).join(', ');

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function resolveRango(req) {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  const hoy = `${y}-${m}-${d}`;

  let desde = parseFechaInput(req.query.desde ?? req.body?.desde);
  let hasta = parseFechaInput(req.query.hasta ?? req.body?.hasta);
  if (!desde) desde = { fecha: hoy };
  if (!hasta) hasta = { fecha: hoy };
  if (desde.fecha > hasta.fecha) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde: desde.fecha, hasta: hasta.fecha };
}

/** Filtro común de documentos para el reporte. */
const SQL_BASE_WHERE = `
  d.EMPNIT = @EMPNIT
  AND CAST(d.FECHA AS DATE) BETWEEN @DESDE AND @HASTA
  AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
  AND t.TIPODOC IN (${SQL_TIPODOC_REPORTE_IN})
  AND ${SQL_TIPODOC_REPORTES_SI}
`;

const SQL_SIGNO_IMPORTE = `
  CASE
    WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN ISNULL(d.TOTALPRECIO, 0)
    WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN -ISNULL(d.TOTALPRECIO, 0)
    ELSE 0
  END
`;

const SQL_SIGNO_LINEA_IMPORTE = `
  CASE
    WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN ISNULL(dp.TOTALPRECIO, 0)
    WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN -ISNULL(dp.TOTALPRECIO, 0)
    ELSE 0
  END
`;

const SQL_SIGNO_LINEA_UNIDADES = `
  CASE
    WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN ISNULL(dp.TOTALUNIDADES, 0)
    WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN -ISNULL(dp.TOTALUNIDADES, 0)
    ELSE 0
  END
`;

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { desde, hasta } = resolveRango(req);

  try {
    const pool = await req.app.locals.getDbPool();
    const baseReq = () =>
      pool.request().input('EMPNIT', sql.VarChar, empnit).input('DESDE', sql.Date, desde).input('HASTA', sql.Date, hasta);

    const [resumenRes, docsRes, prodsRes, marcasRes] = await Promise.all([
      baseReq().query(`
        SELECT
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS VENTAS,
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS DEVOLUCIONES,
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN 1 ELSE 0 END) AS DOCS_VENTA,
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN 1 ELSE 0 END) AS DOCS_DEV
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${SQL_BASE_WHERE}
      `),
      baseReq().query(`
        SELECT
          d.ID, d.FECHA, d.ANIO, d.MES, d.DIA,
          d.CODDOC, d.CORRELATIVO,
          ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
          ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
          ISNULL(d.STATUS, '') AS STATUS,
          UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
          ISNULL(t.DESDOC, '') AS DESDOC,
          (${SQL_SIGNO_IMPORTE}) AS IMPORTE
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${SQL_BASE_WHERE}
        ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO
      `),
      baseReq().query(`
        SELECT
          LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
          MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
          SUM(${SQL_SIGNO_LINEA_UNIDADES}) AS TOTALUNIDADES,
          SUM(${SQL_SIGNO_LINEA_IMPORTE}) AS IMPORTE
        FROM dbo.DOCPRODUCTOS dp
        INNER JOIN dbo.DOCUMENTOS d
          ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${SQL_BASE_WHERE}
        GROUP BY LTRIM(RTRIM(dp.CODPROD))
        ORDER BY SUM(${SQL_SIGNO_LINEA_IMPORTE}) DESC, LTRIM(RTRIM(dp.CODPROD))
      `),
      baseReq().query(`
        SELECT
          ISNULL(p.CODMARCA, 0) AS CODMARCA,
          ISNULL(NULLIF(LTRIM(RTRIM(m.DESMARCA)), ''), 'Sin marca') AS DESMARCA,
          SUM(${SQL_SIGNO_LINEA_UNIDADES}) AS TOTALUNIDADES,
          SUM(${SQL_SIGNO_LINEA_IMPORTE}) AS IMPORTE
        FROM dbo.DOCPRODUCTOS dp
        INNER JOIN dbo.DOCUMENTOS d
          ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        LEFT JOIN dbo.PRODUCTOS p
          ON p.EMPNIT = dp.EMPNIT AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(dp.CODPROD))
        LEFT JOIN dbo.Marcas m ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
        WHERE ${SQL_BASE_WHERE}
        GROUP BY ISNULL(p.CODMARCA, 0), ISNULL(NULLIF(LTRIM(RTRIM(m.DESMARCA)), ''), 'Sin marca')
        ORDER BY SUM(${SQL_SIGNO_LINEA_IMPORTE}) DESC, DESMARCA
      `),
    ]);

    const r = resumenRes.recordset[0] || {};
    const ventas = roundMoney(r.VENTAS);
    const devoluciones = roundMoney(r.DEVOLUCIONES);

    const documentos = normalizeDocumentoRows(docsRes.recordset || []).map((row) => ({
      ID: row.ID,
      FECHA: fechaIsoFromRow(row) || null,
      CODDOC: row.CODDOC,
      CORRELATIVO: row.CORRELATIVO,
      CLIENTE: row.DOC_NOMCLIE || '',
      TIPODOC: String(row.TIPODOC || '').trim().toUpperCase(),
      DESDOC: row.DESDOC || '',
      TOTALPRECIO: roundMoney(row.TOTALPRECIO),
      IMPORTE: roundMoney(row.IMPORTE),
      STATUS: String(row.STATUS || '').trim().toUpperCase(),
    }));

    const productos = (prodsRes.recordset || []).map((row) => ({
      CODPROD: row.CODPROD,
      DESPROD: row.DESPROD || '',
      TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
      IMPORTE: roundMoney(row.IMPORTE),
    }));

    const marcas = (marcasRes.recordset || []).map((row) => ({
      CODMARCA: row.CODMARCA,
      DESMARCA: row.DESMARCA || 'Sin marca',
      TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
      IMPORTE: roundMoney(row.IMPORTE),
    }));

    res.json({
      desde,
      hasta,
      resumen: {
        ventas,
        devoluciones,
        neto: roundMoney(ventas - devoluciones),
        docsVenta: Number(r.DOCS_VENTA) || 0,
        docsDev: Number(r.DOCS_DEV) || 0,
      },
      documentos,
      productos,
      marcas,
    });
  } catch (err) {
    console.warn('[API GET /reportes-ventas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
