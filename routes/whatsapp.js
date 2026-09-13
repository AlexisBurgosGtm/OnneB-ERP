/**
 * API sesión WhatsApp (Baileys) — config general / integraciones.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  LIBRARY,
  getStatus,
  startSession,
  logout,
  sendText,
  sendDocument,
  sendImage,
  tryAutoConnect,
} = require('../lib/whatsapp-baileys');
const { writePendientesPdf } = require('../lib/pdf-report');
const { writeHtmlPdf } = require('../lib/html-to-pdf');
const { documentosDir } = require('../lib/app-paths');

function decodeImageBase64(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
  if (m) {
    return { buffer: Buffer.from(m[2], 'base64'), mimetype: m[1] };
  }
  return { buffer: Buffer.from(s, 'base64'), mimetype: null };
}

const router = express.Router();

router.get('/status', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getStatus());
});

/** Restaura sesión guardada (sin forzar QR). Usado al login / arranque. */
router.post('/auto-connect', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const status = await tryAutoConnect();
    res.json(status);
  } catch (err) {
    console.warn('[API POST /whatsapp/auto-connect]', err.message);
    res.status(500).json({ error: err.message, library: LIBRARY });
  }
});

router.post('/connect', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const forceNewQr = Boolean(req.body?.forceNewQr || req.query?.forceNewQr === '1');
    const status = await startSession({ forceNewQr });
    res.json(status);
  } catch (err) {
    console.warn('[API POST /whatsapp/connect]', err.message);
    res.status(500).json({ error: err.message, library: LIBRARY });
  }
});

router.post('/logout', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const status = await logout();
    res.json(status);
  } catch (err) {
    console.warn('[API POST /whatsapp/logout]', err.message);
    res.status(500).json({ error: err.message, library: LIBRARY });
  }
});

router.post('/send', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const to = req.body?.to ?? req.body?.phone ?? req.body?.numero;
    const text = req.body?.text ?? req.body?.mensaje ?? req.body?.message;
    const result = await sendText(to, text);
    res.json(result);
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[API POST /whatsapp/send]', err.message);
    res.status(status).json({ error: err.message, library: LIBRARY });
  }
});

/**
 * Genera PDF (DOCUMENTOS/) y lo envía por WhatsApp.
 * Body: { to, fileName?, caption?, report?, html? }
 * - html: convierte el imprimible HTML → PDF (Chrome/Edge) — preferido si viene
 * - report (sin html): listado tabular (pdfkit)
 * Así el PDF de WhatsApp queda idéntico al imprimible (p. ej. detalle de productos).
 */
router.post('/send-pdf', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const st = getStatus();
    if (st.state !== 'ready') {
      return res.status(409).json({
        error: 'WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.',
        library: LIBRARY,
        status: st,
      });
    }
    const to = req.body?.to ?? req.body?.phone ?? req.body?.numero;
    const report = req.body?.report;
    const html = typeof req.body?.html === 'string' ? req.body.html : '';
    const hasReport = report && typeof report === 'object';
    const hasHtml = Boolean(html.trim());
    if (!hasReport && !hasHtml) {
      return res.status(400).json({ error: 'Falta el reporte (report) o el HTML del imprimible' });
    }
    const caption = String(req.body?.caption ?? req.body?.text ?? '').trim();
    const wantedName = String(
      req.body?.fileName || report?.fileName || (hasHtml ? 'documento.pdf' : 'facturas-pendientes.pdf')
    ).trim();

    let pdf;
    let mode;
    if (hasHtml) {
      pdf = await writeHtmlPdf(html, { fileName: wantedName });
      mode = 'html';
    } else {
      pdf = await writePendientesPdf(report, { fileName: wantedName });
      mode = 'report';
    }

    const result = await sendDocument(to, {
      filePath: pdf.filePath,
      fileName: pdf.fileName,
      mimetype: 'application/pdf',
      caption,
    });
    res.json({
      ok: true,
      ...result,
      filePath: pdf.filePath,
      fileName: pdf.fileName,
      library: LIBRARY,
      mode,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[API POST /whatsapp/send-pdf]', err.message);
    res.status(status).json({ error: err.message, library: LIBRARY });
  }
});

/**
 * Envía imagen por WhatsApp (Baileys). Guarda copia en DOCUMENTOS/ si viene base64.
 * Body: { to, imageBase64, fileName?, caption?, mimetype? }
 */
router.post('/send-image', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const st = getStatus();
    if (st.state !== 'ready') {
      return res.status(409).json({
        error: 'WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.',
        library: LIBRARY,
        status: st,
      });
    }
    const to = req.body?.to ?? req.body?.phone ?? req.body?.numero;
    const decoded = decodeImageBase64(req.body?.imageBase64 ?? req.body?.image ?? req.body?.base64);
    if (!decoded?.buffer?.length) {
      return res.status(400).json({ error: 'Falta la imagen (imageBase64)' });
    }
    const mimetype = String(req.body?.mimetype || decoded.mimetype || 'image/jpeg').trim();
    const caption = String(req.body?.caption ?? req.body?.text ?? '').trim();
    const ext = mimetype.includes('png') ? 'png' : mimetype.includes('webp') ? 'webp' : 'jpg';
    const wantedName = String(req.body?.fileName || `whatsapp-imagen.${ext}`).trim();
    const safeBase = wantedName.replace(/[^\w.\-]+/g, '_').slice(0, 120) || `whatsapp-imagen.${ext}`;
    const fileName = /\.(jpe?g|png|webp)$/i.test(safeBase) ? safeBase : `${safeBase}.${ext}`;
    const filePath = path.join(documentosDir(), fileName);
    fs.writeFileSync(filePath, decoded.buffer);

    const result = await sendImage(to, {
      filePath,
      fileName,
      mimetype,
      caption,
    });
    res.json({
      ok: true,
      ...result,
      filePath,
      fileName,
      library: LIBRARY,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[API POST /whatsapp/send-image]', err.message);
    res.status(status).json({ error: err.message, library: LIBRARY });
  }
});

module.exports = router;
