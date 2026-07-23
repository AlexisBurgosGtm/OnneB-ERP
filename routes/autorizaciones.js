const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  listAutorizaciones,
  createAutorizacion,
  autorizarAutorizacion,
} = require('../lib/autorizaciones');
const {
  emitAutorizacionNueva,
  emitAutorizacionAutorizada,
} = require('../lib/socket-hub');

const router = express.Router();

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const rows = await listAutorizaciones(pool, empnit);
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /autorizaciones]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await createAutorizacion(pool, {
      EMPNIT: empnit,
      FECHA: req.body?.FECHA,
      HORA: req.body?.HORA,
      TIPO: req.body?.TIPO,
      DESCRIPCION: req.body?.DESCRIPCION,
      USUARIO: req.body?.USUARIO,
    });
    const io = req.app.locals.io;
    if (io && row) {
      emitAutorizacionNueva(io, empnit, {
        id: row.ID,
        tipo: row.TIPO,
        usuario: row.USUARIO,
        descripcion: row.DESCRIPCION,
        mensaje: `${row.USUARIO || 'Usuario'} solicita autorización: ${row.TIPO || '—'}`,
      });
    }
    res.status(201).json({ row });
  } catch (err) {
    const status = err.statusCode || 500;
    console.warn('[API POST /autorizaciones]', err.message);
    res.status(status).json({ error: err.message });
  }
});

router.post('/:id/autorizar', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const usuarioAutoriza = String(req.body?.USUARIOAUTORIZA || req.body?.USUARIO || '').trim();
  try {
    const pool = await req.app.locals.getDbPool();
    const row = await autorizarAutorizacion(pool, empnit, id, usuarioAutoriza);
    const io = req.app.locals.io;
    if (io && row) {
      const quienAutoriza = String(row.USUARIOAUTORIZA || usuarioAutoriza || '').trim();
      emitAutorizacionAutorizada(io, empnit, {
        id: row.ID,
        tipo: row.TIPO,
        usuario: row.USUARIO,
        usuarioAutoriza: quienAutoriza,
        USUARIOAUTORIZA: quienAutoriza,
        descripcion: row.DESCRIPCION,
        mensaje: `Autorizado (${row.TIPO}): ${quienAutoriza}`,
      });
    }
    res.json({ row });
  } catch (err) {
    const status = err.statusCode || 500;
    console.warn('[API POST /autorizaciones/:id/autorizar]', err.message);
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
