const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { listCajasAbiertasConDefault } = require('../lib/empleado-coddoc-preferido');
const {
  parseCorrelativo,
  listTiposDocPrc,
  previewSiguientePrc,
  listRecibos,
  loadRecibo,
  listFacturasPendientesCliente,
  crearRecibo,
  actualizarRecibo,
  guardarAbonos,
  finalizarRecibo,
  eliminarRecibo,
} = require('../lib/recibos-caja-cxc');

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

function sendErr(res, err, label) {
  const status = err.statusCode || 500;
  if (status >= 500) console.warn(label, err.message);
  res.status(status).json({ error: err.message || 'Error' });
}

router.get('/tipos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listTiposDocPrc(pool, sql, empnit);
    res.json({ rows });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc/tipos]');
  }
});

router.get('/siguiente', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const siguiente = await previewSiguientePrc(pool, sql, empnit, req.query.coddoc);
    if (!siguiente) {
      return res.status(404).json({ error: 'No hay tipo PRC activo para la empresa' });
    }
    res.json({ siguiente });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc/siguiente]');
  }
});

router.get('/cajas-abiertas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rawEmp = req.query.codempleado;
    const codempleado =
      rawEmp !== undefined && rawEmp !== null && String(rawEmp).trim() !== ''
        ? parseInt(rawEmp, 10)
        : null;
    const result = await listCajasAbiertasConDefault(
      pool,
      sql,
      empnit,
      Number.isFinite(codempleado) ? codempleado : null
    );
    res.json({
      rows: result.rows || [],
      cajaDefault: result.cajaDefault,
      preferredCaja: result.preferredCaja,
      empnit,
    });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc/cajas-abiertas]');
  }
});

router.get('/clientes/:codcliente/facturas-pendientes', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listFacturasPendientesCliente(pool, sql, empnit, req.params.codcliente, {
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json({ rows });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc/facturas-pendientes]');
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listRecibos(pool, sql, empnit, {
      fecha: req.query.fecha,
      q: req.query.q,
      limit: req.query.limit,
    });
    res.json({ rows });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc]');
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const recibo = await crearRecibo(pool, sql, empnit, {
      ...req.body,
      USUARIO: req.body?.USUARIO || req.body?.usuario || req.headers['x-user'] || 'CXC',
    });
    res.status(201).json({ ok: true, recibo });
  } catch (err) {
    sendErr(res, err, '[API POST /recibos-caja-cxc]');
  }
});

router.get('/:coddoc/:correlativo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (correlativo === null) return res.status(400).json({ error: 'Correlativo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const recibo = await loadRecibo(pool, sql, empnit, req.params.coddoc, correlativo);
    if (!recibo) return res.status(404).json({ error: 'Recibo no encontrado' });
    res.json({ recibo });
  } catch (err) {
    sendErr(res, err, '[API GET /recibos-caja-cxc/:coddoc/:correlativo]');
  }
});

router.patch('/:coddoc/:correlativo', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (correlativo === null) return res.status(400).json({ error: 'Correlativo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const recibo = await actualizarRecibo(pool, sql, empnit, req.params.coddoc, correlativo, req.body);
    res.json({ ok: true, recibo });
  } catch (err) {
    sendErr(res, err, '[API PATCH /recibos-caja-cxc/:coddoc/:correlativo]');
  }
});

router.put('/:coddoc/:correlativo/abonos', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (correlativo === null) return res.status(400).json({ error: 'Correlativo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const recibo = await guardarAbonos(pool, sql, empnit, req.params.coddoc, correlativo, req.body);
    res.json({ ok: true, recibo });
  } catch (err) {
    sendErr(res, err, '[API PUT /recibos-caja-cxc/.../abonos]');
  }
});

router.post('/:coddoc/:correlativo/finalizar', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (correlativo === null) return res.status(400).json({ error: 'Correlativo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const recibo = await finalizarRecibo(pool, sql, empnit, req.params.coddoc, correlativo, req.body);
    res.json({ ok: true, recibo });
  } catch (err) {
    sendErr(res, err, '[API POST /recibos-caja-cxc/.../finalizar]');
  }
});

router.delete('/:coddoc/:correlativo', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (correlativo === null) return res.status(400).json({ error: 'Correlativo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await eliminarRecibo(pool, sql, empnit, req.params.coddoc, correlativo, {
      pass: req.body?.pass ?? req.body?.PASS,
    });
    res.json(result);
  } catch (err) {
    sendErr(res, err, '[API DELETE /recibos-caja-cxc]');
  }
});

module.exports = router;
