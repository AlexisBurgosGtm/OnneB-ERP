const express = require('express');
const { isDbConfigured } = require('../config/database');
const { parseMesAnio, loadAdminDashboard } = require('../lib/dashboard-admin');

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

function defaultPeriod() {
  const now = new Date();
  return { mes: now.getMonth() + 1, anio: now.getFullYear() };
}

router.get('/admin', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fallback = defaultPeriod();
  const period = parseMesAnio(req.query.mes ?? fallback.mes, req.query.anio ?? fallback.anio);
  if (!period) {
    return res.status(400).json({ error: 'MES o ANIO inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadAdminDashboard(pool, sql, empnit, period.mes, period.anio);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /dashboard/admin]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
