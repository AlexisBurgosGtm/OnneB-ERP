const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  ALL_MENUS,
  MENU_LABELS,
  loadTiposEmpleado,
  loadMenuAccesoMap,
  setAccesoForTipo,
  menuGroupsPayload,
} = require('../lib/roles-usuarios');
const {
  OPCION_SERIES_LIST,
  OPCION_SERIES_RULES,
  listSeriesDefault,
  listEmpleadosLookup,
  listTipodocsLookup,
  listCajasLookup,
  createSeriesDefault,
  updateSeriesDefault,
  deleteSeriesDefault,
} = require('../lib/empleados-default');

const router = express.Router();

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || req.body?.empnit || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function accesoToOut(acceso) {
  const accesoOut = {};
  for (const [cod, val] of Object.entries(acceso)) {
    accesoOut[String(cod)] = val;
  }
  return accesoOut;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    const tipos = loadTiposEmpleado();
    const acceso = await loadMenuAccesoMap(pool, sql);
    res.json({
      tipos,
      menus: ALL_MENUS.map((key) => ({ key, label: MENU_LABELS[key] || key })),
      groups: menuGroupsPayload(),
      acceso: accesoToOut(acceso),
      opcionSeries: OPCION_SERIES_LIST,
    });
  } catch (err) {
    console.warn('[API GET /roles-usuarios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/acceso', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    const acceso = await loadMenuAccesoMap(pool, sql);
    res.json({ acceso: accesoToOut(acceso) });
  } catch (err) {
    console.warn('[API GET /roles-usuarios/acceso]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/series-default', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const [rows, empleados, tipodocs, cajas] = await Promise.all([
      listSeriesDefault(pool, sql, empnit),
      listEmpleadosLookup(pool, sql, empnit),
      listTipodocsLookup(pool, sql, empnit),
      listCajasLookup(pool, sql, empnit),
    ]);
    res.json({
      empnit,
      rows,
      empleados,
      tipodocs,
      cajas,
      opciones: OPCION_SERIES_LIST,
      reglas: OPCION_SERIES_RULES,
    });
  } catch (err) {
    console.warn('[API GET /roles-usuarios/series-default]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/series-default', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await createSeriesDefault(pool, sql, empnit, req.body);
    res.status(201).json({ ok: true, row });
  } catch (err) {
    console.warn('[API POST /roles-usuarios/series-default]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/series-default/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await updateSeriesDefault(pool, sql, empnit, req.params.id, req.body);
    res.json({ ok: true, row });
  } catch (err) {
    console.warn('[API PUT /roles-usuarios/series-default/:id]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/series-default/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await deleteSeriesDefault(pool, sql, empnit, req.params.id);
    res.json(result);
  } catch (err) {
    console.warn('[API DELETE /roles-usuarios/series-default/:id]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/:codtipo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const codtipo = parseInt(req.params.codtipo, 10);
  if (!Number.isFinite(codtipo) || codtipo <= 0) {
    return res.status(400).json({ error: 'Tipo de empleado inválido' });
  }
  try {
    const tipos = loadTiposEmpleado();
    if (!tipos.some((t) => Number(t.value) === codtipo)) {
      return res.status(404).json({ error: 'Tipo de empleado no encontrado' });
    }
    const pool = await req.app.locals.getDbPool();
    const fullAccess = Boolean(req.body?.fullAccess ?? req.body?.accesoTotal);
    const menus = req.body?.menus ?? req.body?.MENUS;
    const map = fullAccess || menus === null
      ? await setAccesoForTipo(pool, sql, codtipo, null)
      : await setAccesoForTipo(pool, sql, codtipo, menus);
    res.json({
      ok: true,
      codtipo,
      menus: map[codtipo],
    });
  } catch (err) {
    console.warn('[API PUT /roles-usuarios/:codtipo]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
