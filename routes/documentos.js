const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 500;

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function parseMes(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return null;
  return n;
}

function parseAnio(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 2020 || n > 2027) return null;
  return n;
}

function parseTipodoc(raw) {
  const s = String(raw || '').trim().toUpperCase();
  return s || null;
}

function parseListQuery(req) {
  const q = String(req.query.q || '').trim();
  let limit = DEFAULT_LIMIT;
  if (q) {
    const requested = parseInt(req.query.limit, 10);
    limit = Number.isNaN(requested)
      ? SEARCH_LIMIT
      : Math.min(Math.max(requested, 1), SEARCH_LIMIT);
  } else {
    const requested = parseInt(req.query.limit, 10);
    if (!Number.isNaN(requested)) {
      limit = Math.min(Math.max(requested, 1), SEARCH_LIMIT);
    }
  }
  return { q, limit };
}

function parseListFilters(req, res) {
  const empnit = requireEmpNit(req, res);
  if (!empnit) return null;

  const mes = parseMes(req.query.mes);
  const anio = parseAnio(req.query.anio);
  if (mes === null) {
    res.status(400).json({ error: 'MES inválido (1-12)' });
    return null;
  }
  if (anio === null) {
    res.status(400).json({ error: 'ANIO inválido (2020-2027)' });
    return null;
  }

  const tipodoc = parseTipodoc(req.query.tipodoc);
  if (!tipodoc) {
    res.status(400).json({ error: 'TIPODOC es obligatorio' });
    return null;
  }

  const q = String(req.query.q || '').trim();
  return { empnit, mes, anio, tipodoc, q };
}

const LIST_FROM = `
  FROM dbo.DOCUMENTOS d
  INNER JOIN dbo.TIPODOCUMENTOS t
    ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
  LEFT OUTER JOIN dbo.Empleados emp
    ON d.CODVEN = emp.CODEMPLEADO AND d.EMPNIT = emp.EMPNIT
  LEFT OUTER JOIN dbo.CLIENTES c
    ON d.EMPNIT = c.EMPNIT AND d.CODCLIENTE = c.CODCLIENTE
`;

const LIST_SELECT = `
  d.FECHA,
  d.CODDOC,
  t.DESDOC,
  t.TIPODOC,
  d.CORRELATIVO,
  d.DOC_NOMCLIE,
  c.NEGOCIO,
  d.DOC_DIRCLIE,
  ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
  d.TOTALPRECIO,
  d.STATUS,
  d.CONCRE
`;

const LIST_WHERE = `
  WHERE d.EMPNIT = @EMPNIT
    AND d.MES = @MES
    AND d.ANIO = @ANIO
    AND t.TIPODOC = @TIPODOC
    AND (
      @q IS NULL OR @q = ''
      OR CAST(d.CORRELATIVO AS varchar(30)) LIKE @qLike
      OR d.CODDOC LIKE @qLike
      OR t.DESDOC LIKE @qLike
      OR d.DOC_NOMCLIE LIKE @qLike
      OR c.NEGOCIO LIKE @qLike
      OR d.DOC_NIT LIKE @qLike
      OR emp.NOMEMPLEADO LIKE @qLike
      OR d.STATUS LIKE @qLike
    )
`;

function bindListFilters(request, { empnit, mes, anio, tipodoc, q }) {
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('MES', sql.Int, mes);
  request.input('ANIO', sql.Int, anio);
  request.input('TIPODOC', sql.VarChar, tipodoc);
  request.input('q', sql.NVarChar, q || null);
  request.input('qLike', sql.NVarChar, q ? `%${q}%` : null);
}

function mapDocumentoRow(r) {
  const vendedor = r.VENDEDOR ?? r.vendedor ?? '';
  return {
    FECHA: r.FECHA ?? null,
    CODDOC: r.CODDOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TIPODOC: r.TIPODOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    DOC_NOMCLIE: r.DOC_NOMCLIE ?? null,
    NEGOCIO: r.NEGOCIO ?? null,
    DOC_DIRCLIE: r.DOC_DIRCLIE ?? null,
    VENDEDOR: String(vendedor).trim(),
    TOTALPRECIO: r.TOTALPRECIO ?? null,
    STATUS: r.STATUS ?? null,
    CONCRE: r.CONCRE ?? null,
  };
}

router.get('/tipos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT t.TIPODOC, MIN(t.DESDOC) AS ETIQUETA, COUNT(*) AS CANT_CODDOC
      FROM dbo.TIPODOCUMENTOS t
      WHERE t.EMPNIT = @EMPNIT
        AND (t.ACTIVO = 'SI' OR t.ACTIVO IS NULL)
      GROUP BY t.TIPODOC
      ORDER BY t.TIPODOC
    `);
    res.json({ rows: result.recordset, empnit });
  } catch (err) {
    console.warn('[API GET /documentos/tipos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/lista', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const filters = parseListFilters(req, res);
  if (!filters) return;

  const { empnit, mes, anio, tipodoc, q } = filters;
  const { limit } = parseListQuery(req);

  try {
    const pool = await req.app.locals.getDbPool();

    const countReq = pool.request();
    bindListFilters(countReq, { empnit, mes, anio, tipodoc, q });
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const total = countResult.recordset[0].total;

    const listReq = pool.request();
    bindListFilters(listReq, { empnit, mes, anio, tipodoc, q });
    listReq.input('limit', sql.Int, limit);
    const listResult = await listReq.query(`
      SELECT TOP (@limit) ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY d.FECHA DESC, d.CORRELATIVO DESC
    `);

    const rows = listResult.recordset.map(mapDocumentoRow);

    res.json({
      rows,
      total,
      limit,
      truncated: total > rows.length,
      mes,
      anio,
      tipodoc,
      empnit,
      q: q || null,
    });
  } catch (err) {
    console.warn('[API GET /documentos/lista]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
