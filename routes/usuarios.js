const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

function mapRow(row) {
  return {
    ID: row.ID,
    USUARIO: row.USUARIO,
    NIVEL: row.NIVEL,
    EMAIL: row.EMAIL ?? '',
    LOGGED: row.LOGGED ?? 0,
    PASS: row.PASS ?? '',
  };
}

async function nextUsuarioId(pool) {
  const result = await pool.request().query('SELECT ISNULL(MAX(ID), 0) + 1 AS nextId FROM dbo.USUARIOS');
  return result.recordset[0].nextId;
}

function parsePassBody(body, required) {
  const pass = body?.PASS ?? body?.pass;
  if (pass === undefined || pass === null || String(pass).trim() === '') {
    if (required) {
      const err = new Error('La clave es obligatoria');
      err.status = 400;
      throw err;
    }
    return { empty: true, value: null };
  }
  return { empty: false, value: String(pass) };
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().query(`
      SELECT ID, USUARIO, NIVEL, EMAIL, PASS, LOGGED
      FROM dbo.USUARIOS
      ORDER BY USUARIO
    `);
    const rows = result.recordset.map(mapRow);
    res.json({ rows, total: rows.length });
  } catch (err) {
    console.warn('[API GET /usuarios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const usuario = String(req.body?.USUARIO ?? '').trim();
  const email = String(req.body?.EMAIL ?? '').trim();
  const nivel = parseInt(req.body?.NIVEL, 10);
  if (!usuario) {
    return res.status(400).json({ error: 'USUARIO es obligatorio' });
  }
  if (Number.isNaN(nivel)) {
    return res.status(400).json({ error: 'NIVEL es obligatorio' });
  }
  let passPrep;
  try {
    passPrep = parsePassBody(req.body, true);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const dup = await pool
      .request()
      .input('USUARIO', sql.VarChar(100), usuario)
      .query(`
        SELECT TOP 1 ID FROM dbo.USUARIOS
        WHERE UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
      `);
    if (dup.recordset.length) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    }
    const id = await nextUsuarioId(pool);
    await pool
      .request()
      .input('ID', sql.Int, id)
      .input('USUARIO', sql.VarChar(100), usuario)
      .input('NIVEL', sql.Int, nivel)
      .input('EMAIL', sql.VarChar(250), email || null)
      .input('PASS', sql.VarChar(255), passPrep.value)
      .input('LOGGED', sql.Int, 0)
      .query(`
        INSERT INTO dbo.USUARIOS (ID, USUARIO, NIVEL, EMAIL, PASS, LOGGED, WEBPASS)
        VALUES (@ID, @USUARIO, @NIVEL, @EMAIL, @PASS, @LOGGED, NULL)
      `);
    res.status(201).json({ ok: true, ID: id, USUARIO: usuario });
  } catch (err) {
    console.warn('[API POST /usuarios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const usuario = String(req.body?.USUARIO ?? '').trim();
  const email = String(req.body?.EMAIL ?? '').trim();
  const nivel = parseInt(req.body?.NIVEL, 10);
  if (!usuario) {
    return res.status(400).json({ error: 'USUARIO es obligatorio' });
  }
  if (Number.isNaN(nivel)) {
    return res.status(400).json({ error: 'NIVEL es obligatorio' });
  }
  let passPrep = { empty: true, value: null };
  try {
    passPrep = parsePassBody(req.body, false);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const dup = await pool
      .request()
      .input('ID', sql.Int, id)
      .input('USUARIO', sql.VarChar(100), usuario)
      .query(`
        SELECT TOP 1 ID FROM dbo.USUARIOS
        WHERE UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
          AND ID <> @ID
      `);
    if (dup.recordset.length) {
      return res.status(409).json({ error: 'Ya existe otro usuario con ese nombre' });
    }
    if (passPrep.empty) {
      const result = await pool
        .request()
        .input('ID', sql.Int, id)
        .input('USUARIO', sql.VarChar(100), usuario)
        .input('NIVEL', sql.Int, nivel)
        .input('EMAIL', sql.VarChar(250), email || null)
        .query(`
          UPDATE dbo.USUARIOS
          SET USUARIO = @USUARIO, NIVEL = @NIVEL, EMAIL = @EMAIL
          WHERE ID = @ID
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
    } else {
      const result = await pool
        .request()
        .input('ID', sql.Int, id)
        .input('USUARIO', sql.VarChar(100), usuario)
        .input('NIVEL', sql.Int, nivel)
        .input('EMAIL', sql.VarChar(250), email || null)
        .input('PASS', sql.VarChar(255), passPrep.value)
        .query(`
          UPDATE dbo.USUARIOS
          SET USUARIO = @USUARIO, NIVEL = @NIVEL, EMAIL = @EMAIL, PASS = @PASS
          WHERE ID = @ID
        `);
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
      }
    }
    res.json({ ok: true, ID: id });
  } catch (err) {
    console.warn('[API PUT /usuarios/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('ID', sql.Int, id)
      .query('DELETE FROM dbo.USUARIOS WHERE ID = @ID');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    res.json({ ok: true, ID: id });
  } catch (err) {
    console.warn('[API DELETE /usuarios/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
