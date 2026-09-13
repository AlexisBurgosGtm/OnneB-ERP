/**
 * Agenda de reportes WhatsApp (filtrada por EMPNIT).
 */
const express = require('express');
const { isDbConfigured } = require('../config/database');
const {
  listAgenda,
  saveContacto,
  deleteContacto,
  saveProgramacion,
  deleteProgramacion,
} = require('../lib/whatsapp-programacion');

const router = express.Router();

function getEmpNit(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNit(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

async function poolOrFail(req, res) {
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'Base de datos no configurada' });
    return null;
  }
  const pool = await req.app.locals.getDbPool();
  if (!pool) {
    res.status(503).json({ error: 'No hay conexión a la base de datos' });
    return null;
  }
  return pool;
}

function sendError(res, err, label) {
  const status = err.statusCode || 500;
  if (status >= 500) console.warn(label, err.message);
  res.status(status).json({ error: err.message || 'Error' });
}

router.get('/programacion', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    res.json(await listAgenda(pool, empnit));
  } catch (err) {
    sendError(res, err, '[API GET /whatsapp/programacion]');
  }
});

router.post('/programacion/contactos', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    const row = await saveContacto(pool, empnit, req.body || {});
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, '[API POST /whatsapp/programacion/contactos]');
  }
});

router.put('/programacion/contactos/:id', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    res.json(await saveContacto(pool, empnit, req.body || {}, id));
  } catch (err) {
    sendError(res, err, '[API PUT /whatsapp/programacion/contactos/:id]');
  }
});

router.delete('/programacion/contactos/:id', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    res.json(await deleteContacto(pool, empnit, id));
  } catch (err) {
    sendError(res, err, '[API DELETE /whatsapp/programacion/contactos/:id]');
  }
});

router.post('/programacion', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    const row = await saveProgramacion(pool, empnit, req.body || {});
    res.status(201).json(row);
  } catch (err) {
    sendError(res, err, '[API POST /whatsapp/programacion]');
  }
});

router.put('/programacion/:id', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    res.json(await saveProgramacion(pool, empnit, req.body || {}, id));
  } catch (err) {
    sendError(res, err, '[API PUT /whatsapp/programacion/:id]');
  }
});

router.delete('/programacion/:id', async (req, res) => {
  try {
    const empnit = requireEmpNit(req, res);
    if (!empnit) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const pool = await poolOrFail(req, res);
    if (!pool) return;
    res.json(await deleteProgramacion(pool, empnit, id));
  } catch (err) {
    sendError(res, err, '[API DELETE /whatsapp/programacion/:id]');
  }
});

module.exports = router;
