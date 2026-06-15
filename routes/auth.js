const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { isSuperUser, buildSuperUserSession } = require('../lib/auth-login');

const router = express.Router();

router.post('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = String(req.body?.empnit || req.body?.EMPNIT || '').trim();
  const usuario = String(req.body?.usuario || '').trim();
  const password = req.body?.password;

  if (!empnit) {
    return res.status(400).json({ error: 'Empresa obligatoria' });
  }
  if (!usuario) {
    return res.status(400).json({ error: 'Usuario obligatorio' });
  }
  if (password === undefined || password === null || String(password) === '') {
    return res.status(400).json({ error: 'Contraseña obligatoria' });
  }

  try {
    const pool = await req.app.locals.getDbPool();

    const empCheck = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT TOP 1 EMPNIT
        FROM dbo.Empresas
        WHERE EMPNIT = @EMPNIT
      `);
    if (!empCheck.recordset.length) {
      return res.status(400).json({ error: 'Empresa no válida' });
    }

    if (isSuperUser(usuario, password)) {
      return res.json({ ok: true, user: buildSuperUserSession() });
    }

    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('USUARIO', sql.VarChar(100), usuario)
      .query(`
        SELECT TOP 1 CODEMPLEADO, NOMEMPLEADO, USUARIO, CLAVE, EMAIL
        FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT
          AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
          AND ACTIVO = 'SI'
      `);

    if (!result.recordset.length) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const row = result.recordset[0];
    const stored = String(row.CLAVE ?? '');
    if (stored !== String(password)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    res.json({
      ok: true,
      user: {
        codempleado: row.CODEMPLEADO,
        usuario: row.USUARIO,
        nomempleado: row.NOMEMPLEADO,
        superUser: false,
        email: row.EMAIL ?? '',
      },
    });
  } catch (err) {
    console.warn('[API POST /auth/login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
