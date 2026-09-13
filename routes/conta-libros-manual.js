const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  LIBRO_VENTAS,
  LIBRO_COMPRAS,
  tipodocsForLibro,
  listManual,
  getManual,
  createManual,
  updateManual,
  anularManual,
  deleteManual,
  normalizeLibro,
} = require('../lib/conta-libros-manual');
const { usuarioFromReq } = require('../lib/documentos-eliminados');

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

function parsePeriod(req, res) {
  const mes = parseInt(req.query.mes, 10);
  const anio = parseInt(req.query.anio, 10);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
    res.status(400).json({ error: 'mes inválido (1-12)' });
    return null;
  }
  if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) {
    res.status(400).json({ error: 'anio inválido' });
    return null;
  }
  return { mes, anio };
}

function requireLibro(req, res) {
  try {
    return normalizeLibro(req.query.libro || req.body?.libro || req.body?.LIBRO);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return null;
  }
}

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sendErr(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.warn('[API conta-libros-manual]', err.message);
  res.status(status).json({ error: err.message || 'Error' });
}

router.get('/meta', (req, res) => {
  const libro = requireLibro(req, res);
  if (!libro) return;
  res.json({
    libro,
    tipodocs: tipodocsForLibro(libro),
  });
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const libro = requireLibro(req, res);
  if (!libro) return;
  const period = parsePeriod(req, res);
  if (!period) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listManual(pool, sql, empnit, libro, period.mes, period.anio);
    res.json({
      rows,
      mes: period.mes,
      anio: period.anio,
      libro,
      tipodocs: tipodocsForLibro(libro),
    });
  } catch (err) {
    sendErr(res, err);
  }
});

router.get('/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await getManual(pool, sql, empnit, id);
    if (!row) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(row);
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const libro = requireLibro(req, res);
  if (!libro) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await createManual(pool, sql, empnit, libro, req.body || {}, usuarioFromReq(req));
    res.status(201).json(row);
  } catch (err) {
    sendErr(res, err);
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await updateManual(pool, sql, empnit, id, req.body || {}, usuarioFromReq(req));
    res.json(row);
  } catch (err) {
    sendErr(res, err);
  }
});

router.post('/:id/anular', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await anularManual(pool, sql, empnit, id, usuarioFromReq(req));
    res.json(row);
  } catch (err) {
    sendErr(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await deleteManual(pool, sql, empnit, id);
    res.json(result);
  } catch (err) {
    sendErr(res, err);
  }
});

module.exports = router;
module.exports.LIBRO_VENTAS = LIBRO_VENTAS;
module.exports.LIBRO_COMPRAS = LIBRO_COMPRAS;
