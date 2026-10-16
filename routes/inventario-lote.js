const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLotesSaldo } = require('../lib/inventario-lote');

const router = express.Router();

function requireEmpNit(req, res) {
  const empnit = String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido' });
    return null;
  }
  return empnit;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codprod = String(req.query.codprod || '').trim() || null;
  const q = String(req.query.q || '').trim() || null;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listLotesSaldo(pool, empnit, { codprod, q, limit: req.query.limit });
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /inventario/lotes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
