const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();
const ADMIN_CONFIG_ID = 2;

router.get('/:id/pass', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
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
      .query('SELECT ID, PASS, DESCRIPCION, CONFIG FROM Config WHERE ID = @ID');
    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    const row = result.recordset[0];
    res.json({
      id: row.ID,
      pass: row.PASS ?? '',
      descripcion: row.DESCRIPCION ?? '',
      config: row.CONFIG ?? '',
    });
  } catch (err) {
    console.warn('[API GET /config/:id/pass]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/pass', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const pass = req.body?.pass;
  if (pass === undefined || pass === null) {
    return res.status(400).json({ error: 'El valor PASS es obligatorio' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('ID', sql.Int, id)
      .input('PASS', sql.NVarChar(200), String(pass))
      .query('UPDATE Config SET PASS = @PASS WHERE ID = @ID');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Configuración no encontrada' });
    }
    res.json({ ok: true, id });
  } catch (err) {
    console.warn('[API PUT /config/:id/pass]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, ADMIN_CONFIG_ID };
