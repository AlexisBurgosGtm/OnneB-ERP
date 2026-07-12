const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  RTV_CODDOC,
  ensureRetencionesIvaSetup,
  getTipoDocRtv,
  listRetencionesIva,
  createRetencionIva,
  updateRetencionIva,
  finalizarRetencionIva,
  loadDocumento,
  searchProveedores,
  parseCorrelativo,
} = require('../lib/retenciones-iva');
const { parsePeriod, requireEmpNit } = require('../lib/libro-contable-utils');

const router = express.Router();

router.get('/config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIvaSetup(pool, empnit);
    const tipo = await getTipoDocRtv(pool, empnit);
    res.json({ tipo, setup });
  } catch (err) {
    console.warn('[API GET /retenciones-iva/config]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/setup', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIvaSetup(pool, empnit);
    res.json(setup);
  } catch (err) {
    console.warn('[API POST /retenciones-iva/setup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedores', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await searchProveedores(pool, empnit, q);
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /retenciones-iva/proveedores]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const period = parsePeriod(req, res);
  if (!period) return;
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureRetencionesIvaSetup(pool, empnit);
    const rows = await listRetencionesIva(pool, empnit, period.mes, period.anio);
    res.json({ rows, mes: period.mes, anio: period.anio, coddoc: RTV_CODDOC });
  } catch (err) {
    console.warn('[API GET /retenciones-iva]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await createRetencionIva(pool, empnit, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-iva]', err.message);
    res.status(code).json({ error: err.message });
  }
});

router.get('/:coddoc/:correlativo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await loadDocumento(pool, empnit, coddoc, correlativo);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json(doc);
  } catch (err) {
    console.warn('[API GET /retenciones-iva/:coddoc/:correlativo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:coddoc/:correlativo', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await updateRetencionIva(pool, empnit, coddoc, correlativo, req.body || {});
    res.json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API PATCH /retenciones-iva]', err.message);
    res.status(code).json({ error: err.message });
  }
});

router.post('/:coddoc/:correlativo/finalizar', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) return res.status(400).json({ error: 'Documento inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await finalizarRetencionIva(pool, empnit, coddoc, correlativo, req.body || {});
    res.json({ ok: true, documento: doc });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-iva/finalizar]', err.message);
    res.status(code).json({ error: err.message });
  }
});

module.exports = router;
