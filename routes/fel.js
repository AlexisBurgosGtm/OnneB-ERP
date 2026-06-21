const express = require('express');
const { isDbConfigured } = require('../config/database');
const { certificarDocumentoFel } = require('../lib/fel/certificar');
const { anularDocumentoFel } = require('../lib/fel/anular');

const {
  TIPODOC_CERTIFICABLES,
  TIPODOC_FEL_DESCRIPCION,
} = require('../lib/fel/constants');

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

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

router.get('/tipos-certificables', (_req, res) => {
  const tipos = [...TIPODOC_CERTIFICABLES];
  res.json({
    tipos,
    descripcion: TIPODOC_FEL_DESCRIPCION,
    regimen: 'IVA general — pequeño contribuyente (FES) excluido',
  });
});

router.post('/certificar/:coddoc/:correlativo', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await certificarDocumentoFel(pool, empnit, coddoc, correlativo);
    res.json(result);
  } catch (err) {
    console.warn('[API POST /fel/certificar]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/anular/:coddoc/:correlativo', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = parseCorrelativo(req.params.correlativo);
  if (!coddoc || correlativo === null) {
    return res.status(400).json({ error: 'Documento inválido' });
  }

  const motivo = String(req.body?.motivo ?? req.body?.MOTIVO ?? '').trim();
  const adminPass = String(req.body?.adminPass ?? req.body?.pass ?? req.body?.PASS ?? '');

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await anularDocumentoFel(pool, empnit, coddoc, correlativo, {
      motivo,
      adminPass,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /fel/anular]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
