const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

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

function parseBody(body) {
  const data = {};
  const numericKeys = ['CODTIPOEMPRESA', 'OBJETIVO', 'PRESUPUESTO'];
  for (const key of FIELDS) {
    const raw = body[key];
    if (raw === undefined || raw === '') {
      data[key] = numericKeys.includes(key) ? null : null;
    } else if (numericKeys.includes(key)) {
      data[key] = raw;
    } else {
      data[key] = raw;
    }
  }
  return data;
}

function bindFields(request, data, prefix = '') {
  for (const key of FIELDS) {
    const param = prefix + key;
    const value = data[key];
    if (['CODTIPOEMPRESA'].includes(key)) {
      request.input(param, sql.Int, value === null || value === '' ? null : Number(value));
    } else if (['OBJETIVO', 'PRESUPUESTO'].includes(key)) {
      request.input(param, sql.Float, value === null || value === '' ? null : Number(value));
    } else {
      request.input(param, sql.VarChar, value);
    }
  }
}

/** Lista para combo de login: EMPNIT + EMPNOMBRE desde dbo.Empresas */
router.get('/combo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .query('SELECT EMPNIT, EMPNOMBRE FROM app.Empresas ORDER BY EMPNOMBRE');
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
    const result = await pool.request().query('SELECT * FROM app.Empresas ORDER BY EMPNOMBRE');
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
      INSERT INTO dbo.Empresas (
        EMPNIT, EMPNOMBRE, EMPRAZONSOCIAL, EMPDIRECCION, EMPTELEFONO, EMPEMAIL,
        EMPCONTACTO, EMPTELCONTACTO, CODTIPOEMPRESA, OBJETIVO, PRESUPUESTO
      ) VALUES (
        @EMPNIT, @EMPNOMBRE, @EMPRAZONSOCIAL, @EMPDIRECCION, @EMPTELEFONO, @EMPEMAIL,
        @EMPCONTACTO, @EMPTELCONTACTO, @CODTIPOEMPRESA, @OBJETIVO, @PRESUPUESTO
      )
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
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    request.input('EMPNIT_KEY', sql.VarChar, empNit);
    bindFields(request, data);
    const result = await request.query(`
      UPDATE dbo.Empresas SET
        EMPNOMBRE = @EMPNOMBRE,
        EMPRAZONSOCIAL = @EMPRAZONSOCIAL,
        EMPDIRECCION = @EMPDIRECCION,
        EMPTELEFONO = @EMPTELEFONO,
        EMPEMAIL = @EMPEMAIL,
        EMPCONTACTO = @EMPCONTACTO,
        EMPTELCONTACTO = @EMPTELCONTACTO,
        CODTIPOEMPRESA = @CODTIPOEMPRESA,
        OBJETIVO = @OBJETIVO,
        PRESUPUESTO = @PRESUPUESTO
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
