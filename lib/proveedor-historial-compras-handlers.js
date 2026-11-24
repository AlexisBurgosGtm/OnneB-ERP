const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { requireEmpNit } = require('../routes/lib/catalogo-empresa');
const { fechaIsoFromValue } = require('./documento-fecha');
const ALLOWED_TIPODOC = new Set(['COM', 'COP', 'OCM']);

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function parseTipodocs(query, fallback) {
  const raw = String(query?.tipodocs || '').trim();
  if (!raw) return [...fallback];
  const list = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((t) => ALLOWED_TIPODOC.has(t));
  return list.length ? list : [...fallback];
}

function sqlTipodocIn(list) {
  return list.map((t) => `'${t}'`).join(', ');
}

function parseCodprov(req, res) {
  const codprov = parseInt(req.params.codprov, 10);
  if (!Number.isFinite(codprov) || codprov <= 0) {
    res.status(400).json({ error: 'Código de proveedor inválido' });
    return null;
  }
  return codprov;
}

async function baseRequest(req, res, codprov) {
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'Base de datos no configurada' });
    return null;
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return null;
  const pool = await req.app.locals.getDbPool();
  return pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROV', sql.Int, codprov);
}

/** Catálogo de productos con compras al proveedor (distinct CODPROD). */
async function handleCatalogoProductos(req, res, defaultTipodocs) {
  res.setHeader('Cache-Control', 'no-store');
  const codprov = parseCodprov(req, res);
  if (codprov == null) return;
  const tipodocs = parseTipodocs(req.query, defaultTipodocs);
  const q = String(req.query.q || '').trim();
  try {
    const base = await baseRequest(req, res, codprov);
    if (!base) return;
    base.input('Q', sql.NVarChar, q);
    const result = await base.query(`
      SELECT
        LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
        MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
        MAX(LTRIM(RTRIM(ISNULL(m.DESMARCA, '')))) AS DESMARCA
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      LEFT JOIN dbo.PRODUCTOS p_marca
        ON p_marca.EMPNIT = d.EMPNIT AND p_marca.CODPROD = dp.CODPROD
      LEFT JOIN dbo.MARCAS m
        ON m.EMPNIT = p_marca.EMPNIT AND m.CODMARCA = p_marca.CODMARCA
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${sqlTipodocIn(tipodocs)})
        AND (
          @Q = N''
          OR LTRIM(RTRIM(dp.CODPROD)) LIKE N'%' + @Q + N'%'
          OR LTRIM(RTRIM(ISNULL(dp.DESPROD, ''))) LIKE N'%' + @Q + N'%'
          OR LTRIM(RTRIM(ISNULL(m.DESMARCA, ''))) LIKE N'%' + @Q + N'%'
        )
      GROUP BY LTRIM(RTRIM(dp.CODPROD))
      ORDER BY LTRIM(RTRIM(dp.CODPROD))
    `);
    const rows = (result.recordset || []).map((r) => ({
      CODPROD: String(r.CODPROD || '').trim(),
      DESPROD: String(r.DESPROD || '').trim(),
      DESMARCA: String(r.DESMARCA || '').trim(),
    }));
    res.json({ rows, q: q || null, tipodocs });
  } catch (err) {
    console.warn('[API proveedor historial catalogo-productos]', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** Líneas de compra de un producto con el proveedor. */
async function handleLineasProducto(req, res, defaultTipodocs) {
  res.setHeader('Cache-Control', 'no-store');
  const codprov = parseCodprov(req, res);
  if (codprov == null) return;
  const codprod = String(req.query.codprod || '').trim();
  if (!codprod) return res.status(400).json({ error: 'codprod requerido' });
  const tipodocs = parseTipodocs(req.query, defaultTipodocs);
  try {
    const base = await baseRequest(req, res, codprov);
    if (!base) return;
    base.input('CODPROD', sql.VarChar, codprod);
    const result = await base.query(`
      SELECT
        d.FECHA,
        d.HORA,
        d.MINUTO,
        d.CODDOC,
        d.CORRELATIVO,
        LTRIM(RTRIM(ISNULL(dp.CODMEDIDA, ''))) AS CODMEDIDA,
        ISNULL(dp.CANTIDAD, 0) AS CANTIDAD,
        ISNULL(dp.COSTO, 0) AS COSTO,
        ISNULL(dp.TOTALCOSTO, 0) AS TOTALCOSTO
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${sqlTipodocIn(tipodocs)})
        AND LTRIM(RTRIM(dp.CODPROD)) = @CODPROD
      ORDER BY d.FECHA DESC, d.HORA DESC, d.MINUTO DESC, d.CORRELATIVO DESC, dp.Id DESC
    `);
    const rows = (result.recordset || []).map((r) => ({
      FECHA: fechaIsoFromValue(r.FECHA) || null,
      CODDOC: r.CODDOC,
      CORRELATIVO: r.CORRELATIVO,
      CODMEDIDA: String(r.CODMEDIDA || '').trim(),
      CANTIDAD: roundQty(r.CANTIDAD),
      COSTO: roundMoney(r.COSTO),
      TOTALCOSTO: roundMoney(r.TOTALCOSTO),
    }));
    res.json({ codprod, rows, tipodocs });
  } catch (err) {
    console.warn('[API proveedor historial lineas]', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** Documentos de compra al proveedor (histórico completo). */
async function handleDocumentos(req, res, defaultTipodocs) {
  res.setHeader('Cache-Control', 'no-store');
  const codprov = parseCodprov(req, res);
  if (codprov == null) return;
  const tipodocs = parseTipodocs(req.query, defaultTipodocs);
  try {
    const base = await baseRequest(req, res, codprov);
    if (!base) return;
    const result = await base.query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        ISNULL(d.TOTALCOSTO, 0) AS TOTALCOSTO,
        ISNULL(d.STATUS, '') AS STATUS,
        LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) AS SERIEFAC,
        LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) AS NOFAC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODCLIENTE = @CODPROV
        AND t.TIPODOC IN (${sqlTipodocIn(tipodocs)})
      ORDER BY d.FECHA DESC, d.HORA DESC, d.MINUTO DESC, d.CORRELATIVO DESC
    `);
    const rows = (result.recordset || []).map((r) => ({
      CODDOC: r.CODDOC,
      CORRELATIVO: r.CORRELATIVO,
      FECHA: fechaIsoFromValue(r.FECHA) || null,
      SERIEFAC: String(r.SERIEFAC || '').trim(),
      NOFAC: String(r.NOFAC || '').trim(),
      TOTALCOSTO: roundMoney(r.TOTALCOSTO),
      STATUS: String(r.STATUS || '').trim(),
    }));
    res.json({ rows, tipodocs });
  } catch (err) {
    console.warn('[API proveedor historial documentos]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleCatalogoProductos,
  handleLineasProducto,
  handleDocumentos,
  parseTipodocs,
};