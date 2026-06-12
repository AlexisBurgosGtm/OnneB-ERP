const express = require('express');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');
const { countMissingInvSaldo, syncMissingInvSaldo } = require('../lib/invsaldo');

const router = express.Router();

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

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

function parseListQuery(req) {
  const q = String(req.query.q || '').trim();
  const codmarcaRaw = parseInt(req.query.codmarca, 10);
  const codmarca = Number.isNaN(codmarcaRaw) ? null : codmarcaRaw;
  const habilitadoRaw = String(req.query.habilitado || '').trim().toUpperCase();
  const habilitado = habilitadoRaw === 'SI' || habilitadoRaw === 'NO' ? habilitadoRaw : null;
  let limit = DEFAULT_LIMIT;
  const requested = parseInt(req.query.limit, 10);
  if (!Number.isNaN(requested)) {
    limit = Math.min(Math.max(requested, 1), MAX_LIMIT);
  }
  return { q, codmarca, habilitado, limit };
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function bindSaldoFilters(request, empnit, q, qLike, codmarca, habilitado) {
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('q', sql.NVarChar, q || null);
  request.input('qLike', sql.NVarChar, qLike);
  request.input('codmarca', sql.Int, codmarca);
  request.input('habilitado', sql.VarChar, habilitado);
}

const LIST_SELECT = `
  i.CODPROD,
  p.DESPROD,
  i.SALDO,
  p.EXISTENCIA,
  m.DESMARCA,
  p.TIPOPROD,
  p.COSTO,
  p.HABILITADO,
  CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4)) AS TOTALCOSTO
`;

const LIST_FROM = `
  FROM dbo.INVSALDO i
  LEFT JOIN dbo.PRODUCTOS p ON i.EMPNIT = p.EMPNIT AND i.CODPROD = p.CODPROD
  LEFT JOIN dbo.Marcas m ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
`;

const LIST_WHERE = `
  WHERE i.EMPNIT = @EMPNIT
    AND (@codmarca IS NULL OR p.CODMARCA = @codmarca)
    AND (@habilitado IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(p.HABILITADO, '')))) = @habilitado)
    AND (
      @q IS NULL OR @q = ''
      OR i.CODPROD LIKE @qLike
      OR p.DESPROD LIKE @qLike
      OR m.DESMARCA LIKE @qLike
      OR CAST(p.TIPOPROD AS VARCHAR(50)) LIKE @qLike
    )
`;

router.get('/saldo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return undefined;

  const { q, codmarca, habilitado, limit } = parseListQuery(req);
  const qLike = q ? `%${q}%` : null;

  try {
    const pool = await req.app.locals.getDbPool();

    const countReq = pool.request();
    bindSaldoFilters(countReq, empnit, q, qLike, codmarca, habilitado);
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const total = countResult.recordset[0]?.total ?? 0;

    const listReq = pool.request();
    bindSaldoFilters(listReq, empnit, q, qLike, codmarca, habilitado);
    listReq.input('limit', sql.Int, limit);
    const listResult = await listReq.query(`
      SELECT TOP (@limit) ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY i.CODPROD
    `);

    const totalsReq = pool.request();
    bindSaldoFilters(totalsReq, empnit, q, qLike, codmarca, habilitado);
    const totalsResult = await totalsReq.query(`
      SELECT
        SUM(ISNULL(i.SALDO, 0)) AS SUM_SALDO,
        SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4))) AS SUM_TOTALCOSTO
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const totalsRow = totalsResult.recordset[0] || {};

    const rows = listResult.recordset;
    res.json({
      rows,
      total,
      limit,
      truncated: total > rows.length,
      empnit,
      codmarca,
      habilitado,
      totals: {
        SALDO: totalsRow.SUM_SALDO ?? 0,
        TOTALCOSTO: totalsRow.SUM_TOTALCOSTO ?? 0,
      },
    });
  } catch (err) {
    console.error('[API GET /inventario/saldo]', err.message);
    res.status(500).json({ error: err.message });
  }
  return undefined;
});

router.get('/saldo/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return undefined;

  const { q, codmarca, habilitado } = parseListQuery(req);
  const qLike = q ? `%${q}%` : null;

  try {
    const pool = await req.app.locals.getDbPool();
    const listReq = pool.request();
    bindSaldoFilters(listReq, empnit, q, qLike, codmarca, habilitado);
    const listResult = await listReq.query(`
      SELECT ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY i.CODPROD
    `);

    const totalsReq = pool.request();
    bindSaldoFilters(totalsReq, empnit, q, qLike, codmarca, habilitado);
    const totalsResult = await totalsReq.query(`
      SELECT
        SUM(ISNULL(i.SALDO, 0)) AS SUM_SALDO,
        SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4))) AS SUM_TOTALCOSTO
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const totalsRow = totalsResult.recordset[0] || {};

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventario');
    sheet.columns = [
      { header: 'Código', key: 'CODPROD', width: 14 },
      { header: 'Descripción', key: 'DESPROD', width: 32 },
      { header: 'Marca', key: 'DESMARCA', width: 18 },
      { header: 'Tipo', key: 'TIPOPROD', width: 10 },
      { header: 'Saldo', key: 'SALDO', width: 12 },
      { header: 'Existencia', key: 'EXISTENCIA', width: 12 },
      { header: 'Costo', key: 'COSTO', width: 12 },
      { header: 'Total costo', key: 'TOTALCOSTO', width: 14 },
      { header: 'Habilitado', key: 'HABILITADO', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const row of listResult.recordset) {
      sheet.addRow(row);
    }

    if (listResult.recordset.length) {
      const totalRow = sheet.addRow({
        CODPROD: '',
        DESPROD: '',
        DESMARCA: '',
        TIPOPROD: 'Totales',
        SALDO: totalsRow.SUM_SALDO ?? 0,
        EXISTENCIA: '',
        COSTO: '',
        TOTALCOSTO: totalsRow.SUM_TOTALCOSTO ?? 0,
        HABILITADO: '',
      });
      totalRow.font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    const stamp = todayDateOnly();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventario_${safeEmp}_${stamp}.xlsx"`,
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[API GET /inventario/saldo/export]', err.message);
    res.status(500).json({ error: err.message });
  }
  return undefined;
});

router.get('/saldo/pendientes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return undefined;

  try {
    const pool = await req.app.locals.getDbPool();
    const pendientes = await countMissingInvSaldo(pool, empnit);
    res.json({ empnit, pendientes });
  } catch (err) {
    console.error('[API GET /inventario/saldo/pendientes]', err.message);
    res.status(500).json({ error: err.message });
  }
  return undefined;
});

router.post('/saldo/sincronizar', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return undefined;

  try {
    const pool = await req.app.locals.getDbPool();
    const creados = await syncMissingInvSaldo(pool, empnit);
    const pendientes = await countMissingInvSaldo(pool, empnit);
    res.json({ ok: true, empnit, creados, pendientes });
  } catch (err) {
    console.error('[API POST /inventario/saldo/sincronizar]', err.message);
    res.status(500).json({ error: err.message });
  }
  return undefined;
});

module.exports = router;
