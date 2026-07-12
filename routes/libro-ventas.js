const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLibroVentas, TIPODOC_LIBRO_VENTAS } = require('../lib/libro-ventas');

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

function parseMes(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > 12) return null;
  return n;
}

function parseAnio(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 2020 || n > 2035) return null;
  return n;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const mes = parseMes(req.query.mes);
  const anio = parseAnio(req.query.anio);
  if (mes === null) return res.status(400).json({ error: 'MES inválido (1-12)' });
  if (anio === null) return res.status(400).json({ error: 'ANIO inválido (2020-2035)' });

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await listLibroVentas(pool, require('mssql'), empnit, mes, anio);
    res.json({
      rows: data.rows,
      totals: data.totals,
      mes: data.mes,
      anio: data.anio,
      tipodocs: TIPODOC_LIBRO_VENTAS,
    });
  } catch (err) {
    console.warn('[API GET /libro-ventas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
