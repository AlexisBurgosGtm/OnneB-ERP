const express = require('express');
const {
  ensureTable,
  listDocumentosEliminados,
  getDocumentoEliminadoById,
} = require('../lib/documentos-eliminados');
const { isDbConfigured } = require('../config/database');

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

function parseMesAnio(req) {
  const now = new Date();
  const mes = parseInt(req.query.mes ?? req.body?.mes, 10);
  const anio = parseInt(req.query.anio ?? req.body?.anio, 10);
  return {
    mes: Number.isFinite(mes) && mes >= 1 && mes <= 12 ? mes : now.getMonth() + 1,
    anio: Number.isFinite(anio) && anio >= 2000 && anio <= 2100 ? anio : now.getFullYear(),
  };
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { mes, anio } = parseMesAnio(req);
  const q = String(req.query.q || '').trim();
  const limit = req.query.limit;

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const rows = await listDocumentosEliminados(pool, { empnit, mes, anio, q, limit });
    res.json({ rows, mes, anio, total: rows.length });
  } catch (err) {
    console.warn('[API GET /documentos-eliminados]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const row = await getDocumentoEliminadoById(pool, { empnit, id });
    if (!row) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(row);
  } catch (err) {
    console.warn('[API GET /documentos-eliminados/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
