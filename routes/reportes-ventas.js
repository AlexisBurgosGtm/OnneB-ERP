const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, fechaIsoFromRow, normalizeDocumentoRows } = require('../lib/documento-fecha');
const {
  SQL_TIPODOC_VENTA_IN,
  SQL_TIPODOC_DEV_IN,
  SQL_REPORTES_VENTAS_WHERE,
  SQL_REPORTES_VENTAS_WHERE_DOCS,
  SQL_DOC_IMPORTE_REPORTE,
  SQL_DOC_COSTO_REPORTE,
  SQL_SIGNO_LINEA_UNIDADES,
  SQL_SIGNO_LINEA_IMPORTE,
  SQL_SIGNO_LINEA_COSTO,
} = require('../lib/reportes-ventas-neto');

const router = express.Router();

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

const SQL_BASE_WHERE = SQL_REPORTES_VENTAS_WHERE;
const SQL_DOCS_WHERE = SQL_REPORTES_VENTAS_WHERE_DOCS;

function pctUtilidad(importe, utilidad) {
  const i = Number(importe);
  const u = Number(utilidad);
  if (!Number.isFinite(i) || Math.abs(i) < 0.0005) return null;
  return roundMoney((u / i) * 100);
}

function mapCostoUtilidad(importeRaw, costoRaw) {
  const importe = roundMoney(importeRaw);
  const totalcosto = roundMoney(costoRaw);
  const utilidad = roundMoney(importe - totalcosto);
  return {
    IMPORTE: importe,
    TOTALCOSTO: totalcosto,
    UTILIDAD: utilidad,
    PCT_UTILIDAD: pctUtilidad(importe, utilidad),
  };
}

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
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN ISNULL(d.TOTALCOSTO, 0) ELSE 0 END) AS COSTO_VENTAS,
          SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN ISNULL(d.TOTALCOSTO, 0) ELSE 0 END) AS COSTO_DEVOLUCIONES,
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
          (${SQL_DOC_IMPORTE_REPORTE}) AS IMPORTE,
          (${SQL_DOC_COSTO_REPORTE}) AS TOTALCOSTO
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE ${SQL_DOCS_WHERE}
        ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO
      `),
      baseReq().query(`
        SELECT
          LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
          MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
          SUM(${SQL_SIGNO_LINEA_UNIDADES}) AS TOTALUNIDADES,
          SUM(${SQL_SIGNO_LINEA_IMPORTE}) AS IMPORTE,
          SUM(${SQL_SIGNO_LINEA_COSTO}) AS TOTALCOSTO
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
          SUM(${SQL_SIGNO_LINEA_IMPORTE}) AS IMPORTE,
          SUM(${SQL_SIGNO_LINEA_COSTO}) AS TOTALCOSTO
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
    const costoVentas = roundMoney(r.COSTO_VENTAS);
    const costoDevoluciones = roundMoney(r.COSTO_DEVOLUCIONES);
    const neto = roundMoney(ventas - devoluciones);
    const netoCosto = roundMoney(costoVentas - costoDevoluciones);
    const utilidad = roundMoney(neto - netoCosto);

    const documentos = normalizeDocumentoRows(docsRes.recordset || []).map((row) => {
      const metrics = mapCostoUtilidad(row.IMPORTE, row.TOTALCOSTO);
      return {
        ID: row.ID,
        FECHA: fechaIsoFromRow(row) || null,
        CODDOC: row.CODDOC,
        CORRELATIVO: row.CORRELATIVO,
        CLIENTE: row.DOC_NOMCLIE || '',
        TIPODOC: String(row.TIPODOC || '').trim().toUpperCase(),
        DESDOC: row.DESDOC || '',
        TOTALPRECIO: roundMoney(row.TOTALPRECIO),
        STATUS: String(row.STATUS || '').trim().toUpperCase(),
        ...metrics,
      };
    });

    const productos = (prodsRes.recordset || []).map((row) => ({
      CODPROD: row.CODPROD,
      DESPROD: row.DESPROD || '',
      TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
      ...mapCostoUtilidad(row.IMPORTE, row.TOTALCOSTO),
    }));

    const marcas = (marcasRes.recordset || []).map((row) => ({
      CODMARCA: row.CODMARCA,
      DESMARCA: row.DESMARCA || 'Sin marca',
      TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
      ...mapCostoUtilidad(row.IMPORTE, row.TOTALCOSTO),
    }));

    res.json({
      desde,
      hasta,
      resumen: {
        ventas,
        devoluciones,
        neto,
        netoCosto,
        utilidad,
        pctUtilidad: pctUtilidad(neto, utilidad),
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
