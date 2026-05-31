const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const usuario = String(req.body?.usuario || '').trim();
  const password = req.body?.password;
  if (!usuario) {
    return res.status(400).json({ error: 'Usuario obligatorio' });
  }
  if (password === undefined || password === null || String(password) === '') {
    return res.status(400).json({ error: 'Contraseña obligatoria' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('USUARIO', sql.VarChar(100), usuario)
      .query(`
        SELECT TOP 1 ID, USUARIO, NIVEL, EMAIL, PASS
        FROM dbo.USUARIOS
        WHERE UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
      `);
    if (!result.recordset.length) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const row = result.recordset[0];
    const stored = String(row.PASS ?? '');
    if (stored !== String(password)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    res.json({
      ok: true,
      user: {
        id: row.ID,
        usuario: row.USUARIO,
        nivel: row.NIVEL,
        email: row.EMAIL ?? '',
      },
    });
  } catch (err) {
    console.warn('[API POST /auth/login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
