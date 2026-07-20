const express = require('express');
const { isDbConfigured } = require('../config/database');
const { parseFechaIso, loadResumenDelDia } = require('../lib/resumen-del-dia');

const router = express.Router();

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

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fecha = parseFechaIso(req.query.fecha);
  if (!fecha) {
    return res.status(400).json({ error: 'fecha inválida (use YYYY-MM-DD)' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadResumenDelDia(pool, sql, empnit, fecha);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /resumen-del-dia]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
