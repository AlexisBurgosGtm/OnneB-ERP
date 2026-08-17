const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, fechaIsoFromValue, nowParts } = require('../lib/documento-fecha');
const { TIPODOC_FACTURA } = require('../lib/corte-caja-docs');

const {
  fetchPickingEmbarque,
  fetchDocumentosEmbarque,
  fetchFacturasProductoEmbarque,
} = require('../lib/asignacion-pedidos-picking');

const router = express.Router();

const TIPODOCS = [...TIPODOC_FACTURA, 'FEL'].filter((v, i, a) => a.indexOf(v) === i);
const SQL_TIPODOCS = TIPODOCS.map((t) => `'${t}'`).join(', ');
const DEFAULT_LIMIT = 2000;

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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function defaultFechaRange() {
  const now = nowParts();
  const day = {
    anio: now.anio,
    mes: now.mes,
    dia: now.dia,
    fecha: now.fecha,
  };
  return { from: day, to: day };
}

function mapRow(r) {
  return {
    EMPLEADO: String(r.EMPLEADO || '').trim(),
    CODVEN: r.CODVEN ?? null,
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    CODDOC: r.CODDOC ?? null,
    TIPODOC: r.TIPODOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    CLIENTE: String(r.CLIENTE || r.DOC_NOMCLIE || '').trim(),
    MUNICIPIO: String(r.MUNICIPIO || '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    CODEMBARQUE: String(r.CODEMBARQUE || '').trim(),
    STATUS: r.STATUS ?? null,
  };
}

/** Lista FAC y FEL (FEF/FEC/FES/FEL), todos los STATUS. Filtros: fechas + embarque. */
router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const q = String(req.query.q || '').trim();
  const qLike = q ? `%${q}%` : null;
  const defaults = defaultFechaRange();
  const fromParts = parseFechaInput(req.query.from || req.query.fechaDesde) || defaults.from;
  const toParts = parseFechaInput(req.query.to || req.query.fechaHasta) || defaults.to;
  const codEmbarque = String(req.query.codembarque || req.query.CODEMBARQUE || '').trim();
  let limit = DEFAULT_LIMIT;
  const requested = parseInt(req.query.limit, 10);
  if (!Number.isNaN(requested)) limit = Math.min(Math.max(requested, 1), 5000);

  try {
    const pool = await req.app.locals.getDbPool();
    const sqlEmpleado = `ISNULL((
      SELECT TOP 1 e.NOMEMPLEADO
      FROM dbo.Empleados e
      WHERE e.EMPNIT = d.EMPNIT AND e.CODEMPLEADO = d.CODVEN
    ), '')`;

    const bindBase = (request) => {
      request
        .input('EMPNIT', sql.VarChar, empnit)
        .input('q', sql.NVarChar, q || null)
        .input('qLike', sql.NVarChar, qLike)
        .input('FECHA_FROM', sql.Date, fromParts.fecha)
        .input('FECHA_TO', sql.Date, toParts.fecha);
      if (codEmbarque) {
        request.input('CODEMBARQUE', sql.VarChar, codEmbarque);
      }
      return request;
    };

    const embarqueSql = codEmbarque
      ? `AND LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) = @CODEMBARQUE`
      : '';

    const baseWhere = `
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOCS})
        AND d.FECHA >= @FECHA_FROM
        AND d.FECHA <= @FECHA_TO
        ${embarqueSql}
        AND (
          @q IS NULL OR @q = ''
          OR ${sqlEmpleado} LIKE @qLike
          OR d.CODDOC LIKE @qLike
          OR CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
          OR d.DOC_NOMCLIE LIKE @qLike
          OR c.NOMBRECLIENTE LIKE @qLike
          OR m.DESMUNICIPIO LIKE @qLike
          OR LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) LIKE @qLike
          OR t.TIPODOC LIKE @qLike
          OR d.STATUS LIKE @qLike
        )
    `;

    const baseFrom = `
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      LEFT JOIN dbo.MUNICIPIOS m ON m.CODMUNICIPIO = c.CODMUNICIPIO
    `;

    const totalsRes = await bindBase(pool.request()).query(`
      SELECT
        COUNT(*) AS cantidad,
        ISNULL(SUM(ISNULL(d.TOTALPRECIO, 0)), 0) AS importe
      ${baseFrom}
      ${baseWhere}
    `);
    const totalsRow = totalsRes.recordset[0] || {};
    const cantidad = toNumber(totalsRow.cantidad);
    const importe = toNumber(totalsRow.importe);

    const listRes = await bindBase(pool.request()).input('limit', sql.Int, limit).query(`
      SELECT TOP (@limit)
        ${sqlEmpleado} AS EMPLEADO,
        d.CODVEN,
        d.FECHA,
        d.CODDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), ISNULL(c.NOMBRECLIENTE, '')) AS CLIENTE,
        ISNULL(m.DESMUNICIPIO, '') AS MUNICIPIO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) AS CODEMBARQUE,
        d.STATUS
      ${baseFrom}
      ${baseWhere}
      ORDER BY ${sqlEmpleado} ASC, d.FECHA DESC, d.CODDOC, d.CORRELATIVO DESC
    `);

    const rows = listRes.recordset.map(mapRow);
    res.json({
      rows,
      total: rows.length,
      truncated: cantidad > rows.length,
      cantidad,
      importe,
      from: fromParts.fecha,
      to: toParts.fecha,
      codembarque: codEmbarque || '',
      tipodocs: TIPODOCS,
      empnit,
    });
  } catch (err) {
    console.warn('[API GET /asignacion-pedidos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Actualiza CODEMBARQUE de un documento (asignación inmediata desde la grilla). */
router.patch('/codembarque', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.body?.CODDOC || req.body?.coddoc || '').trim();
  const correlativo = Number(req.body?.CORRELATIVO ?? req.body?.correlativo);
  const codEmbarque = String(req.body?.CODEMBARQUE ?? req.body?.codembarque ?? '').trim().slice(0, 50);
  if (!coddoc) return res.status(400).json({ error: 'CODDOC requerido' });
  if (!Number.isFinite(correlativo)) return res.status(400).json({ error: 'CORRELATIVO inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .input('CODEMBARQUE', sql.VarChar, codEmbarque || null)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET CODEMBARQUE = @CODEMBARQUE
        WHERE EMPNIT = @EMPNIT
          AND CODDOC = @CODDOC
          AND CORRELATIVO = @CORRELATIVO
      `);
    if (!result.rowsAffected[0]) {
      return res.status(404).json({ error: 'Documento no encontrado' });
    }
    res.json({ ok: true, CODDOC: coddoc, CORRELATIVO: correlativo, CODEMBARQUE: codEmbarque });
  } catch (err) {
    console.warn('[API PATCH /asignacion-pedidos/codembarque]', err.message);
    res.status(500).json({ error: err.message });
  }
});

function requireCodEmbarque(req, res) {
  const cod = String(req.query.codembarque || req.query.CODEMBARQUE || '').trim();
  if (!cod) {
    res.status(400).json({ error: 'CODEMBARQUE requerido' });
    return null;
  }
  return cod;
}

/** Picking agrupado por producto (solo empnit + codembarque; sin anuladas). */
router.get('/picking', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codembarque = requireCodEmbarque(req, res);
  if (!codembarque) return;
  const conExistencia =
    String(req.query.existencia || req.query.conExistencia || '').trim() === '1' ||
    String(req.query.existencia || '').toLowerCase() === 'true';

  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await fetchPickingEmbarque(pool, empnit, codembarque, { conExistencia });
    res.json({ rows, total: rows.length, codembarque, empnit });
  } catch (err) {
    console.warn('[API GET /asignacion-pedidos/picking]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Listado de documentos del embarque (solo empnit + codembarque; sin anuladas). */
router.get('/documentos-embarque', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codembarque = requireCodEmbarque(req, res);
  if (!codembarque) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await fetchDocumentosEmbarque(pool, empnit, codembarque);
    res.json({ rows, total: rows.length, codembarque, empnit });
  } catch (err) {
    console.warn('[API GET /asignacion-pedidos/documentos-embarque]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Facturas del embarque que contienen un producto. */
router.get('/facturas-producto', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codembarque = requireCodEmbarque(req, res);
  if (!codembarque) return;
  const codprod = String(req.query.codprod || req.query.CODPROD || '').trim();
  if (!codprod) return res.status(400).json({ error: 'CODPROD requerido' });

  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await fetchFacturasProductoEmbarque(pool, empnit, codembarque, codprod);
    res.json({ rows, total: rows.length, codembarque, codprod, empnit });
  } catch (err) {
    console.warn('[API GET /asignacion-pedidos/facturas-producto]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
