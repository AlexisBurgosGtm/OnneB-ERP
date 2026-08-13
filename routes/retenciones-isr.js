const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  RTI_CODDOC,
  ensureRetencionesIsrSetup,
  getTipoDocRti,
  listRetencionesIsr,
  createRetencionIsr,
  updateRetencionIsr,
  finalizarRetencionIsr,
  loadDocumento,
  searchProveedores,
  parseCorrelativo,
  listComprasCreditoPendientesProveedor,
  findCompraPorSerieNumero,
  loadCalcParams,
} = require('../lib/retenciones-isr');
const { parsePeriod, requireEmpNit } = require('../lib/libro-contable-utils');

const router = express.Router();

router.get('/factura-por-fel', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await findCompraPorSerieNumero(pool, empnit, {
      serie: req.query.serie || req.query.FEL_SERIE,
      numero: req.query.numero || req.query.FEL_NUMERO,
    });
    res.json({ rows });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API GET /retenciones-isr/factura-por-fel]', err.message);
    res.status(code).json({ error: err.message });
  }
});

router.get('/config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIsrSetup(pool, empnit);
    const tipo = await getTipoDocRti(pool, empnit);
    const calc = await loadCalcParams(pool, 'isr');
    res.json({ tipo, setup, calc });
  } catch (err) {
    console.warn('[API GET /retenciones-isr/config]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/setup', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIsrSetup(pool, empnit);
    res.json(setup);
  } catch (err) {
    console.warn('[API POST /retenciones-isr/setup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedores', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await searchProveedores(pool, empnit, q, limit);
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /retenciones-isr/proveedores]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/proveedores/:codprov/compras-pendientes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codprov = parseInt(req.params.codprov, 10);
  if (!Number.isFinite(codprov) || codprov <= 0) {
    return res.status(400).json({ error: 'Proveedor inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listComprasCreditoPendientesProveedor(pool, empnit, codprov, {
      q: String(req.query.q || '').trim(),
      limit: req.query.limit,
    });
    const calc = await loadCalcParams(pool, 'isr');
    res.json({ rows, calc });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API GET /retenciones-isr/.../compras-pendientes]', err.message);
    res.status(code).json({ error: err.message });
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
    await ensureRetencionesIsrSetup(pool, empnit);
    const rows = await listRetencionesIsr(pool, empnit, period.mes, period.anio);
    res.json({ rows, mes: period.mes, anio: period.anio, coddoc: RTI_CODDOC });
  } catch (err) {
    console.warn('[API GET /retenciones-isr]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await createRetencionIsr(pool, empnit, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-isr]', err.message);
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
    console.warn('[API GET /retenciones-isr/:coddoc/:correlativo]', err.message);
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
    const doc = await updateRetencionIsr(pool, empnit, coddoc, correlativo, req.body || {});
    res.json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API PATCH /retenciones-isr]', err.message);
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
    const doc = await finalizarRetencionIsr(pool, empnit, coddoc, correlativo, req.body || {});
    res.json({ ok: true, documento: doc });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-isr/finalizar]', err.message);
    res.status(code).json({ error: err.message });
  }
});

module.exports = router;
