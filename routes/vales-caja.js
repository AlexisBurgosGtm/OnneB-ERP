const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  parseMesAnio,
  listValesCaja,
  listCajasAbiertas,
  listTiposUsados,
  createValeCaja,
  updateValeCaja,
  deleteValeCaja,
  getLimitaEfectivoValesCaja,
  TIPOS_VALE_CAJA_COMUNES,
} = require('../lib/vales-caja');
const {
  resolveEmpleadoCoddocPreferido,
  pickCajaDefault,
  OPCION_SERIES,
} = require('../lib/empleado-coddoc-preferido');
const { assertAdminPass, assertEliminacionRegistro } = require('../lib/config-auth');

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

async function cajasConDefault(pool, empnit, codempleado) {
  const cajas = await listCajasAbiertas(pool, empnit);
  const preferred = await resolveEmpleadoCoddocPreferido(
    pool,
    sql,
    empnit,
    codempleado,
    OPCION_SERIES.CAJAS
  );
  return {
    cajas,
    cajaDefault: pickCajaDefault(cajas, preferred),
    preferredCaja: preferred,
  };
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const { mes, anio } = parseMesAnio(req.query.mes, req.query.anio);
  try {
    const pool = await req.app.locals.getDbPool();
    const [rows, cajaData, tipos, limitaEfectivo] = await Promise.all([
      listValesCaja(pool, empnit, mes, anio),
      cajasConDefault(pool, empnit, req.query.codempleado),
      listTiposUsados(pool, empnit),
      getLimitaEfectivoValesCaja(pool),
    ]);
    res.json({
      mes,
      anio,
      rows,
      cajas: cajaData.cajas,
      cajaDefault: cajaData.cajaDefault,
      preferredCaja: cajaData.preferredCaja,
      tipos,
      tiposComunes: TIPOS_VALE_CAJA_COMUNES,
      limitaEfectivoDisponible: limitaEfectivo,
    });
  } catch (err) {
    console.warn('[API GET /vales-caja]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/lookups', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const [cajaData, tipos, limitaEfectivo] = await Promise.all([
      cajasConDefault(pool, empnit, req.query.codempleado),
      listTiposUsados(pool, empnit),
      getLimitaEfectivoValesCaja(pool),
    ]);
    res.json({
      cajas: cajaData.cajas,
      cajaDefault: cajaData.cajaDefault,
      preferredCaja: cajaData.preferredCaja,
      tipos,
      tiposComunes: TIPOS_VALE_CAJA_COMUNES,
      limitaEfectivoDisponible: limitaEfectivo,
    });
  } catch (err) {
    console.warn('[API GET /vales-caja/lookups]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await createValeCaja(pool, empnit, req.body || {});
    res.status(201).json({ ok: true, ...result });
  } catch (err) {
    console.warn('[API POST /vales-caja]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/:novale', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const novale = parseInt(req.params.novale, 10);
  if (!Number.isFinite(novale) || novale <= 0) return res.status(400).json({ error: 'NOVALE inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const body = { ...(req.body || {}) };
    if (req.query.mes != null) body.listMes = req.query.mes;
    if (req.query.anio != null) body.listAnio = req.query.anio;
    const result = await updateValeCaja(pool, empnit, novale, body);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.warn('[API PUT /vales-caja/:novale]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:novale', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const novale = parseInt(req.params.novale, 10);
  if (!Number.isFinite(novale) || novale <= 0) return res.status(400).json({ error: 'NOVALE inválido' });
  const pass = String(req.body?.pass ?? req.body?.adminPass ?? req.body?.PASS ?? '');
  try {
    const pool = await req.app.locals.getDbPool();
    await assertEliminacionRegistro(pool, pass);
    const deleted = await deleteValeCaja(pool, empnit, novale);
    const { mes, anio } = parseMesAnio(req.query.mes ?? deleted.mes, req.query.anio ?? deleted.anio);
    const rows = await listValesCaja(pool, empnit, mes, anio);
    res.json({ ok: true, ...deleted, rows, mes, anio });
  } catch (err) {
    console.warn('[API DELETE /vales-caja/:novale]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
