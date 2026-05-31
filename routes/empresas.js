const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

/** Columnas editables de dbo.Empresas (sin EMPLOGO, EMPMESPROCESO, EMPANIOPROCESO). */
const FIELDS = [
  'EMPNIT',
  'EMPNOMBRE',
  'EMPRAZONSOCIAL',
  'EMPDIRECCION',
  'EMPTELEFONO',
  'EMPEMAIL',
  'EMPCONTACTO',
  'EMPTELCONTACTO',
  'CODTIPOEMPRESA',
  'OBJETIVO',
  'PRESUPUESTO',
];

const INT_FIELDS = ['CODTIPOEMPRESA'];
const FLOAT_FIELDS = ['OBJETIVO', 'PRESUPUESTO'];

function parseBody(body) {
  const data = {};
  for (const key of FIELDS) {
    const raw = body[key];
    if (raw === undefined || raw === '') {
      data[key] = null;
    } else if (INT_FIELDS.includes(key)) {
      const n = Number(raw);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (FLOAT_FIELDS.includes(key)) {
      const n = Number(raw);
      data[key] = Number.isNaN(n) ? null : n;
    } else {
      data[key] = String(raw).trim();
    }
  }
  return data;
}

function bindFields(request, data) {
  for (const key of FIELDS) {
    const value = data[key];
    if (INT_FIELDS.includes(key)) {
      request.input(key, sql.Int, value);
    } else if (FLOAT_FIELDS.includes(key)) {
      request.input(key, sql.Float, value);
    } else {
      request.input(key, sql.VarChar, value);
    }
  }
}

const insertCols = FIELDS.join(', ');
const insertVals = FIELDS.map((k) => `@${k}`).join(', ');
const updateSet = FIELDS.filter((k) => k !== 'EMPNIT')
  .map((k) => `${k} = @${k}`)
  .join(', ');

/** Login: solo EMPNIT y EMPNOMBRE */
router.get('/combo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .query(`
        SELECT EMPNIT, EMPNOMBRE
        FROM dbo.Empresas
        WHERE EMPNIT IS NOT NULL AND LTRIM(RTRIM(EMPNIT)) <> ''
        ORDER BY EMPNOMBRE
      `);
    res.json({ rows: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.warn('[API GET /empresas/combo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const cols = FIELDS.join(', ');
    const result = await pool
      .request()
      .query(`SELECT ${cols} FROM dbo.Empresas ORDER BY EMPNOMBRE`);
    res.json({ rows: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.warn('[API GET /empresas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const data = parseBody(req.body);
  if (!data.EMPNIT) {
    return res.status(400).json({ error: 'EMPNIT es obligatorio' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    bindFields(request, data);
    await request.query(`
      INSERT INTO dbo.Empresas (${insertCols})
      VALUES (${insertVals})
    `);
    res.status(201).json({ ok: true, EMPNIT: data.EMPNIT });
  } catch (err) {
    console.warn('[API POST /empresas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:empnit', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empNit = req.params.empnit;
  const data = parseBody(req.body);
  data.EMPNIT = empNit;
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    request.input('EMPNIT_KEY', sql.VarChar, empNit);
    bindFields(request, data);
    const result = await request.query(`
      UPDATE dbo.Empresas SET ${updateSet}
      WHERE EMPNIT = @EMPNIT_KEY
    `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({ ok: true, EMPNIT: empNit });
  } catch (err) {
    console.warn('[API PUT /empresas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:empnit', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, req.params.empnit)
      .query('DELETE FROM dbo.Empresas WHERE EMPNIT = @EMPNIT');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /empresas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
