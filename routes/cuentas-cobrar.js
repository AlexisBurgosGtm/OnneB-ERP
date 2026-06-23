const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { STATUS_OPERADO } = require('../lib/documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_DOC_SALDO_PENDIENTE,
} = require('../lib/cuentas-docs');

const router = express.Router();
const DEFAULT_LIMIT = 500;
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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(r) {
  const docSaldo = toNumber(r.DOC_SALDO);
  const docAbono = toNumber(r.DOC_ABONO);
  const saldoPendiente = toNumber(r.SALDO_PENDIENTE ?? docSaldo - docAbono);
  return {
    FECHA: r.FECHA ?? null,
    VENCIMIENTO: r.VENCIMIENTO ?? null,
    CODDOC: r.CODDOC ?? null,
    DESDOC: r.DESDOC ?? null,
    TIPODOC: r.TIPODOC ?? null,
    CORRELATIVO: r.CORRELATIVO ?? null,
    DOC_NOMCLIE: r.DOC_NOMCLIE ?? null,
    DOC_NIT: r.DOC_NIT ?? null,
    NEGOCIO: r.NEGOCIO ?? null,
    VENDEDOR: String(r.VENDEDOR ?? '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    DOC_SALDO: docSaldo,
    DOC_ABONO: docAbono,
    SALDO_PENDIENTE: saldoPendiente,
    CONCRE: r.CONCRE ?? null,
    STATUS: r.STATUS ?? null,
    FEL_UUDI: r.FEL_UUDI ?? null,
    FEL_SERIE: r.FEL_SERIE ?? null,
    FEL_NUMERO: r.FEL_NUMERO ?? null,
    CORTE: r.CORTE ?? null,
  };
}

router.get('/documentos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const q = String(req.query.q || '').trim();
  const qLike = q ? `%${q}%` : null;
  let limit = DEFAULT_LIMIT;
  const requested = parseInt(req.query.limit, 10);
  if (!Number.isNaN(requested)) {
    limit = Math.min(Math.max(requested, 1), SEARCH_LIMIT);
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const baseFrom = `
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON d.EMPNIT = c.EMPNIT AND d.CODCLIENTE = c.CODCLIENTE
      LEFT JOIN dbo.Empleados emp ON d.EMPNIT = emp.EMPNIT AND d.CODVEN = emp.CODEMPLEADO
    `;
    const baseWhere = `
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${SQL_DOC_SALDO_PENDIENTE} > 0
        AND (
          @q IS NULL OR @q = ''
          OR CAST(d.CORRELATIVO AS VARCHAR(30)) LIKE @qLike
          OR d.CODDOC LIKE @qLike
          OR t.DESDOC LIKE @qLike
          OR d.DOC_NOMCLIE LIKE @qLike
          OR c.NEGOCIO LIKE @qLike
          OR d.DOC_NIT LIKE @qLike
          OR emp.NOMEMPLEADO LIKE @qLike
          OR t.TIPODOC LIKE @qLike
        )
    `;

    const bind = (request) =>
      request
        .input('EMPNIT', sql.VarChar, empnit)
        .input('q', sql.NVarChar, q || null)
        .input('qLike', sql.NVarChar, qLike);

    const totalsRes = await bind(pool.request()).query(`
      SELECT
        COUNT(*) AS total,
        ISNULL(SUM(${SQL_DOC_SALDO_PENDIENTE}), 0) AS sumSaldo,
        ISNULL(SUM(ISNULL(d.DOC_ABONO, 0)), 0) AS sumAbono,
        ISNULL(SUM(ISNULL(d.TOTALPRECIO, 0)), 0) AS sumTotal
      ${baseFrom}
      ${baseWhere}
    `);
    const totals = totalsRes.recordset[0] || {};

    const listReq = bind(pool.request()).input('limit', sql.Int, limit);
    const listRes = await listReq.query(`
      SELECT TOP (@limit)
        d.FECHA,
        d.VENCIMIENTO,
        d.CODDOC,
        t.DESDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        d.DOC_NOMCLIE,
        d.DOC_NIT,
        c.NEGOCIO,
        ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.DOC_SALDO, 0) AS DOC_SALDO,
        ISNULL(d.DOC_ABONO, 0) AS DOC_ABONO,
        ${SQL_DOC_SALDO_PENDIENTE} AS SALDO_PENDIENTE,
        ISNULL(d.CONCRE, 'CON') AS CONCRE,
        d.STATUS,
        ISNULL(d.CORTE, 'NO') AS CORTE,
        d.FEL_UUDI,
        d.FEL_SERIE,
        d.FEL_NUMERO
      ${baseFrom}
      ${baseWhere}
      ORDER BY
        CASE WHEN d.VENCIMIENTO IS NULL THEN 1 ELSE 0 END,
        d.VENCIMIENTO ASC,
        d.FECHA DESC,
        d.CORRELATIVO DESC
    `);

    const rows = listRes.recordset.map(mapRow);
    const total = Number(totals.total) || 0;

    res.json({
      rows,
      total,
      sumSaldo: toNumber(totals.sumSaldo),
      sumAbono: toNumber(totals.sumAbono),
      sumTotal: toNumber(totals.sumTotal),
      limit,
      truncated: total > rows.length,
      empnit,
      q: q || null,
      tiposFactura: ['FAC', 'FEF', 'FEC', 'FES'],
    });
  } catch (err) {
    console.warn('[API GET /cuentas-cobrar/documentos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
