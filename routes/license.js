const express = require('express');
const multer = require('multer');
const sql = require('mssql');
const {
  publicStatusPayload,
  activateLicense,
  clearLicense,
  getLicenseStatus,
} = require('../lib/license');
const { getAppToken } = require('../lib/app-token');
const { getUpdateDbPool } = require('../lib/update-db-pool');
const { isUpdateDbConfigured } = require('../config/update-database');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 256 * 1024 },
});

router.get('/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.json(publicStatusPayload());
  } catch (err) {
    console.warn('[API GET /license/status]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Descarga la licencia publicada en TOKENS.LICENCIA del host UPDATE_*
 * para el TOKEN de esta instalación (.env).
 */
router.get('/from-host', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!isUpdateDbConfigured()) {
      return res.status(503).json({
        error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
      });
    }
    const token = getAppToken();
    if (!token) {
      return res.status(400).json({ error: 'TOKEN no configurado en .env' });
    }

    const pool = await getUpdateDbPool();
    if (!pool) {
      return res.status(503).json({ error: 'No se pudo conectar al host de actualizaciones' });
    }

    const result = await pool
      .request()
      .input('TOKEN', sql.VarChar(100), token)
      .query(`
        SELECT TOP 1
          LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) AS TOKEN,
          LTRIM(RTRIM(ISNULL(EMPRESA, ''))) AS EMPRESA,
          CAST(LICENCIA AS NVARCHAR(MAX)) AS LICENCIA
        FROM dbo.TOKENS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
      `);

    const row = result.recordset?.[0];
    if (!row) {
      return res.status(404).json({ error: 'No se encontró el TOKEN de esta instalación en la nube' });
    }
    const raw = row.LICENCIA == null ? '' : String(row.LICENCIA).trim();
    if (!raw) {
      return res.status(404).json({
        error: 'Este TOKEN no tiene licencia publicada en la nube (campo LICENCIA vacío)',
      });
    }

    let doc;
    try {
      doc = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'LICENCIA en la nube no es un JSON válido' });
    }
    if (!doc?.payload || !doc?.signature) {
      return res.status(500).json({ error: 'LICENCIA en la nube incompleta (falta payload o signature)' });
    }

    const safeToken = String(row.TOKEN || token).replace(/[^\w\-]+/g, '_').slice(0, 40);
    res.json({
      ok: true,
      token: row.TOKEN,
      empresa: row.EMPRESA,
      license: doc,
      filename: `onneb-license-${safeToken}.json`,
    });
  } catch (err) {
    console.warn('[API GET /license/from-host]', err.message);
    const msg = String(err.message || '');
    if (/LICENCIA|Invalid column/i.test(msg)) {
      return res.status(500).json({
        error: 'La tabla TOKENS no tiene columna LICENCIA en el host de actualizaciones',
      });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * Descarga desde la nube y activa la licencia en esta instalación.
 */
router.post('/from-host/activate', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!isUpdateDbConfigured()) {
      return res.status(503).json({
        error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
      });
    }
    const token = getAppToken();
    if (!token) {
      return res.status(400).json({ error: 'TOKEN no configurado en .env' });
    }

    const pool = await getUpdateDbPool();
    if (!pool) {
      return res.status(503).json({ error: 'No se pudo conectar al host de actualizaciones' });
    }

    const result = await pool
      .request()
      .input('TOKEN', sql.VarChar(100), token)
      .query(`
        SELECT TOP 1 CAST(LICENCIA AS NVARCHAR(MAX)) AS LICENCIA
        FROM dbo.TOKENS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
      `);
    const raw = result.recordset?.[0]?.LICENCIA;
    const text = raw == null ? '' : String(raw).trim();
    if (!text) {
      return res.status(404).json({
        error: 'Este TOKEN no tiene licencia publicada en la nube (campo LICENCIA vacío)',
      });
    }
    const doc = JSON.parse(text);
    activateLicense(doc);
    res.json({ ok: true, ...publicStatusPayload(), source: 'host' });
  } catch (err) {
    console.warn('[API POST /license/from-host/activate]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/activate', upload.single('file'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let doc = null;
    if (req.file?.buffer) {
      doc = JSON.parse(req.file.buffer.toString('utf8'));
    } else if (req.body?.license) {
      doc = typeof req.body.license === 'string' ? JSON.parse(req.body.license) : req.body.license;
    } else if (req.body?.payload && req.body?.signature) {
      doc = { payload: req.body.payload, signature: req.body.signature };
    }
    if (!doc) {
      return res.status(400).json({ error: 'Envíe el archivo de licencia o el JSON firmado' });
    }
    const status = activateLicense(doc);
    res.json({ ok: true, ...publicStatusPayload(), activated: status.status });
  } catch (err) {
    console.warn('[API POST /license/activate]', err.message);
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const confirm = String(req.body?.confirm || req.query.confirm || '').trim().toUpperCase();
    if (confirm !== 'QUITAR') {
      return res.status(400).json({ error: 'Confirme con confirm=QUITAR' });
    }
    clearLicense();
    res.json({ ok: true, ...publicStatusPayload() });
  } catch (err) {
    console.warn('[API DELETE /license]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/reload', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    getLicenseStatus({ refresh: true });
    res.json(publicStatusPayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
