const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

const TABLE = 'FEL_CREDENCIALES';

const WRITABLE_FIELDS = [
  'CERTIFICACION_USUARIO',
  'CERTIFICACION_LLAVE',
  'FIRMA_ALIAS',
  'FIRMA_LLAVE',
  'EMISOR_CODIGOESTABLECIMIENTO',
  'EMISOR_CODIGOPOSTAL',
  'EMISOR_DEPARTAMENTO',
  'EMISOR_DIRECCION',
  'EMISOR_MUNICIPIO',
  'EMISOR_NOMBRE',
  'EMISOR_NOMBRECOMECIAL',
  'EMISOR_NIT',
  'EMISOR_FRASE',
  'EMISOR_ESCENARIO',
  'EMISOR_FRASE2',
  'EMISOR_ESCENARIO2',
  'NIT_RESOLUCION',
  'NIT_FECHA_RESOLUCION',
  'ADENDA_SUCURSAL',
  'ADENDA_TELSUCURSAL',
  'ADENDA_TELSUPERVISOR',
  'VENCE_CERTIFICADO',
];

const INT_FIELDS = new Set(['EMISOR_FRASE', 'EMISOR_ESCENARIO', 'EMISOR_FRASE2', 'EMISOR_ESCENARIO2']);
const LIST_COLUMNS = ['EMPNIT', 'CERTIFICACION_USUARIO', 'EMISOR_NOMBRECOMECIAL', 'EMISOR_NIT', 'VENCE_CERTIFICADO'];

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

function requireMatchingEmpNit(req, res) {
  const empnit = requireEmpNit(req, res);
  if (!empnit) return null;
  const param = String(req.params.empnit ?? '').trim();
  if (param && param !== empnit) {
    res.status(403).json({ error: 'No puede modificar credenciales de otra empresa' });
    return null;
  }
  return empnit;
}

function parseFieldValue(name, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (INT_FIELDS.has(name)) {
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (name === 'VENCE_CERTIFICADO') {
    const s = String(raw).trim();
    return s || null;
  }
  return String(raw).trim();
}

function readBody(req) {
  const data = {};
  for (const name of WRITABLE_FIELDS) {
    data[name] = parseFieldValue(name, req.body[name]);
  }
  return data;
}

function validateCreate(data) {
  if (!data.CERTIFICACION_USUARIO) return 'CERTIFICACION_USUARIO es obligatorio';
  if (!data.CERTIFICACION_LLAVE) return 'CERTIFICACION_LLAVE es obligatoria';
  return null;
}

function bindFields(request, data, fields) {
  for (const name of fields) {
    if (INT_FIELDS.has(name)) {
      request.input(name, sql.Int, data[name]);
    } else if (name === 'VENCE_CERTIFICADO') {
      request.input(name, sql.Date, data[name]);
    } else {
      request.input(name, sql.VarChar, data[name]);
    }
  }
}

async function countForEmpresa(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`SELECT COUNT(*) AS total FROM dbo.[${TABLE}] WHERE EMPNIT = @EMPNIT`);
  return Number(result.recordset[0]?.total) || 0;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const cols = LIST_COLUMNS.join(', ');
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT ${cols}
        FROM dbo.[${TABLE}]
        WHERE EMPNIT = @EMPNIT
        ORDER BY CERTIFICACION_USUARIO
      `);
    res.json({ rows: result.recordset, total: result.recordset.length, empnit });
  } catch (err) {
    console.warn('[API GET /credenciales-fel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:empnit', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireMatchingEmpNit(req, res);
  if (!empnit) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const cols = ['EMPNIT', ...WRITABLE_FIELDS].join(', ');
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT ${cols}
        FROM dbo.[${TABLE}]
        WHERE EMPNIT = @EMPNIT
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Credenciales no encontradas' });
    }
    res.json({ row: result.recordset[0] });
  } catch (err) {
    console.warn('[API GET /credenciales-fel/:empnit]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const data = readBody(req);
  const errReq = validateCreate(data);
  if (errReq) return res.status(400).json({ error: errReq });

  try {
    const pool = await req.app.locals.getDbPool();
    const existing = await countForEmpresa(pool, empnit);
    if (existing > 0) {
      return res.status(409).json({
        error: 'Ya existe un registro de credenciales FEL para esta empresa. Edítelo o elimínelo antes de agregar otro.',
      });
    }

    const insertCols = ['EMPNIT', ...WRITABLE_FIELDS];
    const insertParams = insertCols.map((c) => `@${c}`);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    bindFields(request, data, WRITABLE_FIELDS);

    await request.query(`
      INSERT INTO dbo.[${TABLE}] (${insertCols.join(', ')})
      VALUES (${insertParams.join(', ')})
    `);
    res.status(201).json({ ok: true, EMPNIT: empnit, ...data });
  } catch (err) {
    console.warn('[API POST /credenciales-fel]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:empnit', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireMatchingEmpNit(req, res);
  if (!empnit) return;

  const data = readBody(req);
  if (!data.CERTIFICACION_USUARIO) {
    return res.status(400).json({ error: 'CERTIFICACION_USUARIO es obligatorio' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const fieldsToUpdate = [...WRITABLE_FIELDS];

    if (!fieldsToUpdate.length) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const setClause = fieldsToUpdate.map((n) => `${n} = @${n}`).join(', ');
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    bindFields(
      request,
      Object.fromEntries(fieldsToUpdate.map((n) => [n, data[n]])),
      fieldsToUpdate
    );

    const result = await request.query(`
      UPDATE dbo.[${TABLE}] SET ${setClause}
      WHERE EMPNIT = @EMPNIT
    `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Credenciales no encontradas' });
    }
    res.json({ ok: true, EMPNIT: empnit });
  } catch (err) {
    console.warn('[API PUT /credenciales-fel/:empnit]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:empnit', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireMatchingEmpNit(req, res);
  if (!empnit) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`DELETE FROM dbo.[${TABLE}] WHERE EMPNIT = @EMPNIT`);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Credenciales no encontradas' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /credenciales-fel/:empnit]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
