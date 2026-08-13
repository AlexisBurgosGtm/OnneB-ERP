const express = require('express');
const { isDbConfigured } = require('../config/database');
const { nowParts } = require('../lib/documento-fecha');
const {
  AsistenciaError,
  parseQrPayload,
  getEstadoAsistencia,
  marcarAsistencia,
  listAsistenciaDia,
  buscarEmpleados,
} = require('../lib/asistencia');

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

function parseFecha(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function usuarioFromReq(req) {
  return String(
    req.body?.USUARIO ||
      req.body?.usuario ||
      req.headers['x-usuario'] ||
      req.user?.usuario ||
      ''
  ).trim();
}

router.get('/hoy', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const fecha = parseFecha(req.query.fecha) || nowParts().fecha;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listAsistenciaDia(pool, empnit, fecha);
    res.json({ fecha, rows, empnit });
  } catch (err) {
    console.warn('[API GET /asistencia/hoy]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/empleados/buscar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await buscarEmpleados(pool, empnit, req.query.q);
    res.json({ rows, empnit });
  } catch (err) {
    console.warn('[API GET /asistencia/empleados/buscar]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/estado/:codempleado', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codempleado = parseInt(req.params.codempleado, 10);
  if (!Number.isFinite(codempleado) || codempleado <= 0) {
    return res.status(400).json({ error: 'CODEMPLEADO inválido' });
  }
  const fecha = parseFecha(req.query.fecha) || undefined;
  try {
    const pool = await req.app.locals.getDbPool();
    const data = await getEstadoAsistencia(pool, empnit, codempleado, fecha);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /asistencia/estado]', err.message);
    const status = err instanceof AsistenciaError ? err.statusCode : 500;
    res.status(status || 500).json({ error: err.message });
  }
});

router.post('/preview-qr', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const { codempleado } = parseQrPayload(req.body?.QR ?? req.body?.qr, empnit);
    const pool = await req.app.locals.getDbPool();
    const data = await getEstadoAsistencia(pool, empnit, codempleado);
    res.json(data);
  } catch (err) {
    console.warn('[API POST /asistencia/preview-qr]', err.message);
    const status = err instanceof AsistenciaError ? err.statusCode : 500;
    res.status(status || 500).json({ error: err.message });
  }
});

router.post('/marcar', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  try {
    let codempleado = parseInt(req.body?.CODEMPLEADO ?? req.body?.codempleado, 10);
    const qr = req.body?.QR ?? req.body?.qr;
    if ((!Number.isFinite(codempleado) || codempleado <= 0) && qr) {
      ({ codempleado } = parseQrPayload(qr, empnit));
    }
    if (!Number.isFinite(codempleado) || codempleado <= 0) {
      return res.status(400).json({ error: 'Indique CODEMPLEADO o QR válido' });
    }
    const pool = await req.app.locals.getDbPool();
    const result = await marcarAsistencia(pool, empnit, codempleado, usuarioFromReq(req));
    res.json(result);
  } catch (err) {
    console.warn('[API POST /asistencia/marcar]', err.message);
    const status = err instanceof AsistenciaError ? err.statusCode : 500;
    res.status(status || 500).json({ error: err.message });
  }
});

module.exports = router;
