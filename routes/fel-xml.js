const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { requireEmpNit } = require('./lib/catalogo-empresa');
const { parseCertifiedFelXml } = require('../lib/fel/parse-certified-xml');
const {
  buildPrintContext,
  getFelTicketTemplate,
  getDefaultTemplate,
  renderTemplate,
  isFelTicketTipodoc,
} = require('../lib/formato-impresion-engine');
const { getSettingValue, SETTING_OPCION } = require('../lib/settings');

const router = express.Router();

function normalizePapel(raw) {
  return String(raw || 'TICKET').trim().toUpperCase() === 'CARTA' ? 'CARTA' : 'TICKET';
}

async function loadEmpresa(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT EMPNIT, EMPNOMBRE, EMPRAZONSOCIAL, EMPDIRECCION, EMPTELEFONO, EMPEMAIL
      FROM dbo.Empresas
      WHERE EMPNIT = @EMPNIT
    `);
  return (
    result.recordset[0] || {
      EMPNIT: empnit,
      EMPNOMBRE: empnit,
      EMPRAZONSOCIAL: '',
      EMPDIRECCION: '',
      EMPTELEFONO: '',
      EMPEMAIL: '',
    }
  );
}

async function loadFelUrlBase(pool) {
  try {
    return String((await getSettingValue(pool, SETTING_OPCION.URL_FEL)) || '').trim();
  } catch {
    return '';
  }
}

function wrapPreviewHtml({ title, bodyHtml, css, papel = 'TICKET' }) {
  const safeTitle = String(title || 'Documento')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const isTicket = String(papel || '').trim().toUpperCase() === 'TICKET';
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
body{font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:${isTicket ? '8px' : '16px'};font-size:12px;color:#111;background:#fff}
${css || ''}
</style></head><body>${bodyHtml}</body></html>`;
}

router.post('/render', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const xml = String(req.body?.xml || '').trim();
  if (!xml) return res.status(400).json({ error: 'XML requerido' });

  const papel = normalizePapel(req.body?.papel);
  const logoUrl = String(req.body?.logoUrl || req.body?.LOGO_URL || '').trim();

  try {
    const pool = await req.app.locals.getDbPool();
    const parsed = parseCertifiedFelXml(xml);
    const tipodoc = String(parsed.tipodoc || 'FEF').trim().toUpperCase();

    const formato =
      isFelTicketTipodoc(tipodoc) && papel === 'TICKET'
        ? getFelTicketTemplate(tipodoc)
        : getDefaultTemplate(papel, tipodoc);

    const empresaDb = await loadEmpresa(pool, empnit);
    const empresa = {
      ...empresaDb,
      EMPNOMBRE: empresaDb.EMPNOMBRE || parsed.empresa?.EMPNOMBRE || '',
      EMPRAZONSOCIAL: empresaDb.EMPRAZONSOCIAL || parsed.empresa?.EMPRAZONSOCIAL || '',
      EMPDIRECCION: empresaDb.EMPDIRECCION || parsed.empresa?.EMPDIRECCION || '',
    };
    if (logoUrl) empresa.LOGO_URL = logoUrl;

    const felUrlBase = await loadFelUrlBase(pool);
    const title = `FEL ${tipodoc} — XML SAT`;
    const ctx = buildPrintContext({
      empresa,
      header: parsed.header,
      lines: parsed.lines,
      title,
      footerNote: 'Vista generada desde XML SAT — referencia de formato local',
      felUrlBase,
      muestraPeso: false,
    });

    const bodyHtml = renderTemplate(formato.HTML, ctx);
    const fullHtml = wrapPreviewHtml({ title, bodyHtml, css: formato.CSS, papel });

    res.json({
      tipodoc,
      satTipo: parsed.satTipo,
      papel,
      title,
      html: fullHtml,
      bodyHtml,
      css: formato.CSS || '',
      header: parsed.header,
      lineCount: parsed.lines.length,
    });
  } catch (err) {
    console.warn('[API POST /fel-xml/render]', err.message);
    res.status(400).json({ error: err.message || 'No se pudo interpretar el XML' });
  }
});

module.exports = router;
