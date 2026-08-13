const express = require('express');
const QRCode = require('qrcode');

const router = express.Router();

/**
 * GET /api/qr?data=...&size=200
 * Genera PNG de código QR (local, sin CDN).
 */
router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const data = String(req.query.data ?? '').trim();
  if (!data) {
    return res.status(400).json({ error: 'Indique data para el QR' });
  }
  if (data.length > 500) {
    return res.status(400).json({ error: 'data demasiado largo' });
  }
  let size = parseInt(req.query.size, 10);
  if (!Number.isFinite(size) || size < 64) size = 200;
  if (size > 512) size = 512;

  try {
    const png = await QRCode.toBuffer(data, {
      type: 'png',
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    });
    res.setHeader('Content-Type', 'image/png');
    res.send(png);
  } catch (err) {
    console.warn('[API GET /qr]', err.message);
    res.status(500).json({ error: err.message || 'No se pudo generar el QR' });
  }
});

module.exports = router;
