const express = require('express');
const { isDbConfigured } = require('../config/database');
const { parseMesAnio, loadAdminDashboard } = require('../lib/dashboard-admin');
const {
  parseMesAnio: parseMesAnioVendedor,
  parseFechaIso,
  normalizeGrupo,
  parseCodven,
  loadVendedorResumen,
  loadVendedorDocumentos,
} = require('../lib/dashboard-vendedor');
const {
  parseMesAnio: parseMesAnioTransporte,
  loadTransporteDashboard,
} = require('../lib/dashboard-transporte');
const { parseFechaIso: parseFechaIsoCajero, loadCajeroDashboard } = require('../lib/dashboard-cajero');

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

router.get('/vendedor/resumen', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fallback = defaultPeriod();
  const period = parseMesAnioVendedor(req.query.mes ?? fallback.mes, req.query.anio ?? fallback.anio);
  if (!period) {
    return res.status(400).json({ error: 'MES o ANIO inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadVendedorResumen(pool, sql, empnit, period.mes, period.anio);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /dashboard/vendedor/resumen]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/vendedor/documentos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fecha = parseFechaIso(req.query.fecha) || parseFechaIso(new Date().toISOString());
  if (!fecha) {
    return res.status(400).json({ error: 'FECHA inválida (YYYY-MM-DD)' });
  }
  const codven = parseCodven(req.query.codven);
  const grupo = normalizeGrupo(req.query.grupo);

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadVendedorDocumentos(pool, sql, empnit, { fecha, codven, grupo });
    res.json(data);
  } catch (err) {
    console.warn('[API GET /dashboard/vendedor/documentos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/transporte', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fallback = defaultPeriod();
  const period = parseMesAnioTransporte(req.query.mes ?? fallback.mes, req.query.anio ?? fallback.anio);
  if (!period) {
    return res.status(400).json({ error: 'MES o ANIO inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadTransporteDashboard(pool, sql, empnit, period.mes, period.anio);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /dashboard/transporte]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/cajero', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fecha = parseFechaIsoCajero(req.query.fecha) || parseFechaIsoCajero(new Date().toISOString());
  if (!fecha) {
    return res.status(400).json({ error: 'FECHA inválida (YYYY-MM-DD)' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const sql = require('mssql');
    const data = await loadCajeroDashboard(pool, sql, empnit, fecha);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /dashboard/cajero]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
