const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  listReportsCatalog,
  normalizeReportCode,
  resolveReportMensaje,
} = require('../lib/consultas-externas');

const router = express.Router();

function getEmpNit(req) {
  return String(req.query.empnit || req.query.EMPNIT || '').trim();
}

router.get('/catalog', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const empnit = getEmpNit(req);
  res.json({ reports: listReportsCatalog(empnit) });
});

router.get('/mensaje', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = getEmpNit(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido' });
  }

  const codigo = normalizeReportCode(req.query.ventadia || req.query.VENTADIA);
  if (!codigo) {
    return res.status(400).json({ error: 'ventadia requerido (código del reporte, ej. VENTADIA)' });
  }

  const fecha = String(req.query.fecha || req.query.FECHA || '').trim() || undefined;

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await resolveReportMensaje(pool, sql, empnit, codigo, { fecha });
    res.json({ mensaje: data.mensaje });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[API GET /consultas-externas/mensaje]', err.message);
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
