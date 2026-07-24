const express = require('express');
const multer = require('multer');
const {
  publicStatusPayload,
  activateLicense,
  clearLicense,
  getLicenseStatus,
} = require('../lib/license');

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
