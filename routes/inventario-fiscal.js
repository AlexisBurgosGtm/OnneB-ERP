const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listInventarioFiscal } = require('../lib/inventario-fiscal');

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

  const mes = parseInt(req.query.mes, 10);
  const anio = parseInt(req.query.anio, 10);
  const q = String(req.query.q || '').trim();
  const limit = parseInt(req.query.limit, 10);

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await listInventarioFiscal(pool, {
      empnit,
      mes,
      anio,
      q,
      limit: Number.isFinite(limit) ? limit : 500,
    });
    res.json(data);
  } catch (err) {
    console.warn('[API GET /inventario-fiscal]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
