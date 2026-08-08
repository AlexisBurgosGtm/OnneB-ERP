const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  RIR_CODDOC,
  ensureRetencionesIsrRecibidasSetup,
  getTipoDocRir,
  listRetencionesIsrRecibidas,
  createRetencionIsrRecibida,
  updateRetencionIsrRecibida,
  finalizarRetencionIsrRecibida,
  loadDocumento,
  searchClientes,
  parseCorrelativo,
  listFacturasCreditoPendientesCliente,
  diagnoseFacturasClienteRetencion,
  loadCalcParams,
} = require('../lib/retenciones-isr-recibidas');
const { parsePeriod, requireEmpNit } = require('../lib/libro-contable-utils');

const router = express.Router();

router.get('/config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIsrRecibidasSetup(pool, empnit);
    const tipo = await getTipoDocRir(pool, empnit);
    const calc = await loadCalcParams(pool, 'isr');
    res.json({ tipo, setup, calc });
  } catch (err) {
    console.warn('[API GET /retenciones-isr-recibidas/config]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/setup', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const setup = await ensureRetencionesIsrRecibidasSetup(pool, empnit);
    res.json(setup);
  } catch (err) {
    console.warn('[API POST /retenciones-isr-recibidas/setup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await searchClientes(pool, empnit, q, limit);
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /retenciones-isr-recibidas/clientes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/clientes/:codcliente/facturas-pendientes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcliente = parseInt(req.params.codcliente, 10);
  if (!Number.isFinite(codcliente) || codcliente <= 0) {
    return res.status(400).json({ error: 'Cliente inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listFacturasCreditoPendientesCliente(pool, empnit, codcliente, {
      q: String(req.query.q || '').trim(),
      limit: req.query.limit,
    });
    const calc = await loadCalcParams(pool, 'isr');
    const diag =
      rows.length > 0 ? null : await diagnoseFacturasClienteRetencion(pool, empnit, codcliente);
    res.json({ rows, calc, diag, tipodocs: ['FEF', 'FEC', 'FES'], codcliente });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API GET /retenciones-isr-recibidas/.../facturas-pendientes]', err.message);
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
    await ensureRetencionesIsrRecibidasSetup(pool, empnit);
    const rows = await listRetencionesIsrRecibidas(pool, empnit, period.mes, period.anio);
    res.json({ rows, mes: period.mes, anio: period.anio, coddoc: RIR_CODDOC });
  } catch (err) {
    console.warn('[API GET /retenciones-isr-recibidas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const doc = await createRetencionIsrRecibida(pool, empnit, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-isr-recibidas]', err.message);
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
    console.warn('[API GET /retenciones-isr-recibidas/:coddoc/:correlativo]', err.message);
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
    const doc = await updateRetencionIsrRecibida(pool, empnit, coddoc, correlativo, req.body || {});
    res.json(doc);
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API PATCH /retenciones-isr-recibidas]', err.message);
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
    const doc = await finalizarRetencionIsrRecibida(pool, empnit, coddoc, correlativo, req.body || {});
    res.json({ ok: true, documento: doc });
  } catch (err) {
    const code = err.statusCode || 500;
    if (code >= 500) console.warn('[API POST /retenciones-isr-recibidas/finalizar]', err.message);
    res.status(code).json({ error: err.message });
  }
});

module.exports = router;
