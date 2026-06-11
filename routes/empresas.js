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
const LOGO_MAX_HEX_LEN = 2_000_000;

function parseLogo(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const hex = String(raw).trim().replace(/^0x/i, '').replace(/\s/g, '');
  if (!hex) return null;
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('LOGO debe ser una cadena hexadecimal válida');
  }
  if (hex.length > LOGO_MAX_HEX_LEN) {
    throw new Error('Logo demasiado grande');
  }
  return hex;
}

function mapEmpresaRow(r, { includeLogo = false } = {}) {
  const row = {};
  for (const key of FIELDS) {
    row[key] = r[key] ?? null;
  }
  if (includeLogo) {
    row.LOGO = r.EMPLOGO ?? r.LOGO ?? null;
  }
  return row;
}

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

/** LOGO o EMPLOGO en dbo.Empresas; false si no existe ninguna. */
let logoColumnCache;

async function resolveLogoColumn(pool) {
  if (logoColumnCache !== undefined) return logoColumnCache;
  try {
    const r = await pool.request().query(`
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Empresas'
        AND COLUMN_NAME IN ('LOGO', 'EMPLOGO')
    `);
    const names = new Set(
      r.recordset.map((row) => String(row.COLUMN_NAME || '').trim().toUpperCase())
    );
    if (names.has('LOGO')) logoColumnCache = 'LOGO';
    else if (names.has('EMPLOGO')) logoColumnCache = 'EMPLOGO';
    else logoColumnCache = false;
  } catch {
    logoColumnCache = false;
  }
  return logoColumnCache;
}

function emptyLogoResponse(empNit) {
  return { EMPNIT: empNit, hex: null, hasLogo: false };
}

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

router.get('/:empnit/logo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empNit = String(req.params.empnit || '').trim();
  if (!empNit) return res.status(400).json({ error: 'EMPNIT inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const logoCol = await resolveLogoColumn(pool);
    if (!logoCol) {
      return res.json(emptyLogoResponse(empNit));
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empNit)
      .query(`
        SELECT ${logoCol} AS LOGO_VAL
        FROM dbo.Empresas
        WHERE EMPNIT = @EMPNIT
      `);
    if (!result.recordset.length) {
      return res.json(emptyLogoResponse(empNit));
    }
    const hex = result.recordset[0].LOGO_VAL ?? null;
    res.json({ EMPNIT: empNit, hex: hex || null, hasLogo: Boolean(hex) });
  } catch (err) {
    console.warn('[API GET /empresas/logo]', err.message);
    res.json(emptyLogoResponse(empNit));
  }
});

router.get('/:empnit', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empNit = String(req.params.empnit || '').trim();
  if (!empNit) return res.status(400).json({ error: 'EMPNIT inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const cols = FIELDS.join(', ');
    const logoCol = await resolveLogoColumn(pool);
    const logoSelect = logoCol ? `, ${logoCol}` : '';
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empNit)
      .query(`SELECT ${cols}${logoSelect} FROM dbo.Empresas WHERE EMPNIT = @EMPNIT`);
    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    const row = result.recordset[0];
    if (logoCol && row[logoCol] !== undefined) {
      row.LOGO = row[logoCol];
      row.EMPLOGO = row[logoCol];
    }
    res.json(mapEmpresaRow(row, { includeLogo: Boolean(logoCol) }));
  } catch (err) {
    console.warn('[API GET /empresas/:empnit]', err.message);
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
  let logoHex;
  try {
    logoHex = parseLogo(req.body?.LOGO ?? req.body?.EMPLOGO);
  } catch (logoErr) {
    return res.status(400).json({ error: logoErr.message });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    bindFields(request, data);
    const logoCol = await resolveLogoColumn(pool);
    if (logoHex !== undefined && logoCol) {
      request.input('LOGO_HEX', sql.VarChar(sql.MAX), logoHex);
      await request.query(`
        INSERT INTO dbo.Empresas (${insertCols}, ${logoCol})
        VALUES (${insertVals}, @LOGO_HEX)
      `);
    } else {
      await request.query(`
        INSERT INTO dbo.Empresas (${insertCols})
        VALUES (${insertVals})
      `);
    }
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
  let logoHex;
  try {
    logoHex = parseLogo(req.body?.LOGO ?? req.body?.EMPLOGO);
  } catch (logoErr) {
    return res.status(400).json({ error: logoErr.message });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request();
    request.input('EMPNIT_KEY', sql.VarChar, empNit);
    bindFields(request, data);
    const logoCol = await resolveLogoColumn(pool);
    let sqlUpdate = `UPDATE dbo.Empresas SET ${updateSet}`;
    if (logoHex !== undefined && logoCol) {
      request.input('LOGO_HEX', sql.VarChar(sql.MAX), logoHex);
      sqlUpdate += `, ${logoCol} = @LOGO_HEX`;
    }
    sqlUpdate += ' WHERE EMPNIT = @EMPNIT_KEY';
    const result = await request.query(sqlUpdate);
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
