const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().query(`
      SELECT TIPO
      FROM dbo.TIPONEGOCIOS
      ORDER BY TIPO
    `);
    res.json({ rows: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.warn('[API GET /tipo-negocios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
