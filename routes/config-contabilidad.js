const express = require('express');
const { isDbConfigured } = require('../config/database');
const { requireEmpNit } = require('../lib/libro-contable-utils');
const {
  IMPUESTOS_CONTABILIDAD,
  getImpuestosContabilidad,
  saveImpuestosContabilidad,
} = require('../lib/impuestos');
const { recalcImpuestosDocumentos } = require('../lib/recalc-impuestos');

const router = express.Router();

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    const impuestos = await getImpuestosContabilidad(pool);
    res.json({
      impuestos,
      catalogo: IMPUESTOS_CONTABILIDAD,
    });
  } catch (err) {
    console.warn('[API GET /config-contabilidad]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await saveImpuestosContabilidad(pool, req.body || {});
    res.json({ ok: true, ...result });
  } catch (err) {
    console.warn('[API PUT /config-contabilidad]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/recalcular', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const stats = await recalcImpuestosDocumentos(pool, empnit);
    res.json(stats);
  } catch (err) {
    console.warn('[API POST /config-contabilidad/recalcular]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
