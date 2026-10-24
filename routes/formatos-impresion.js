const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { normalizeDocumentoRows, fechaIsoFromRow } = require('../lib/documento-fecha');
const { SETTING_OPCION, getSettingValue, getSettingSino } = require('../lib/settings');
const {
  renderTemplate,
  buildPrintContext,
  getDefaultTemplate,
  getFelTicketTemplate,
  isFelTicketTipodoc,
  FEL_TICKET_TIPODOCS,
  samplePrintContext,
} = require('../lib/formato-impresion-engine');
const { buildPrintContextAsync, loadFelCredForPrint } = require('../lib/print-document-context');
const { sanitizeDesignerHtml } = require('../lib/formato-impresion-designer-html');

const {
  loadAbonosRetencion,
  loadCalcParams,
  calcRetencionSobreBase,
} = require('../lib/retenciones-facturas');

const TIPODOC_RETENCION_PRINT = ['RTV', 'RTI', 'RVR', 'RIR'];

const router = express.Router();

const CREATE_TABLE_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'FORMATOS_IMPRESION' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.FORMATOS_IMPRESION (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    TIPODOC VARCHAR(10) NOT NULL,
    PAPEL VARCHAR(10) NOT NULL,
    NOMBRE VARCHAR(100) NOT NULL,
    HTML NVARCHAR(MAX) NOT NULL,
    CSS NVARCHAR(MAX) NULL,
    ACTIVO VARCHAR(2) NOT NULL CONSTRAINT DF_FORMATOS_IMPRESION_ACTIVO DEFAULT ('SI'),
    FECHA_MOD DATETIME NULL,
    USUARIO_MOD VARCHAR(50) NULL,
    CONSTRAINT UQ_FORMATOS_IMPRESION_NOMBRE UNIQUE (EMPNIT, TIPODOC, PAPEL, NOMBRE)
  );
  CREATE INDEX IX_FORMATOS_IMPRESION_EMPNIT ON dbo.FORMATOS_IMPRESION (EMPNIT);
END;
`;

let tableEnsured = false;

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

function normalizePapel(value) {
  return String(value || 'CARTA').trim().toUpperCase() === 'TICKET' ? 'TICKET' : 'CARTA';
}

function normalizeTipodoc(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeActivo(value, def = 'SI') {
  const s = String(value ?? def).trim().toUpperCase();
  return s === 'SI' ? 'SI' : 'NO';
}

async function ensureTable(pool) {
  if (tableEnsured) return;
  await pool.request().query(CREATE_TABLE_SQL);
  tableEnsured = true;
}

function mapFormatoRow(r) {
  if (!r) return null;
  return {
    ID: r.ID,
    EMPNIT: r.EMPNIT,
    TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
    PAPEL: normalizePapel(r.PAPEL),
    NOMBRE: r.NOMBRE || '',
    HTML: r.HTML || '',
    CSS: r.CSS || '',
    ACTIVO: normalizeActivo(r.ACTIVO),
    FECHA_MOD: r.FECHA_MOD || null,
    USUARIO_MOD: r.USUARIO_MOD || null,
    ES_DEFAULT: false,
  };
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
    const v = await getSettingValue(pool, SETTING_OPCION.URL_FEL);
    return String(v || '').trim();
  } catch {
    return '';
  }
}

async function ensureFelTicketFormats(pool, empnit, usuario = 'SISTEMA') {
  for (const tipodoc of FEL_TICKET_TIPODOCS) {
    const tpl = getFelTicketTemplate(tipodoc);
    const existing = await findFormato(pool, empnit, tipodoc, 'TICKET');
    if (existing) {
      const html = String(existing.HTML || '');
      const wrongEmisorLine =
        html.includes('EMPRESA.RAZON_SOCIAL') ||
        /fel-line-emisor|fel-emisor-nombre|fel-razon[\s\S]{0,160}\{\{FEL_CRED\.NOMBRE_COMERCIAL\}\}/.test(html) ||
        (html.includes('{{EMPRESA.NOMBRE}}') && html.includes('fel-razon'));
      const needsFelFrasesObs =
        html.includes('SUJETO A PAGOS TRIMESTRALES') ||
        html.includes('DESPUES DE 15 DIAS') ||
        html.includes('EMPRESA.FRASE_FISCAL');
      const needsFelExentoLeyenda = !html.includes('FEL_EXENTO_LEYENDA');
      const needsFelSubtotalTotales = !html.includes('TOTALES.SUBTOTAL_FMT');
      const needsFelClienteLabels = html.includes('<strong>NIT=</strong>') || html.includes('<strong>NOMBRE=</strong>');
      const needsFelHeader =
        !html.includes('fel-header-cred-v10') ||
        wrongEmisorLine ||
        needsFelFrasesObs ||
        needsFelExentoLeyenda ||
        needsFelSubtotalTotales ||
        needsFelClienteLabels;
      const needsFecComplemento =
        tipodoc === 'FEC' &&
        String(existing.NOMBRE || '').trim() === String(tpl.NOMBRE || '').trim() &&
        !html.includes('fel-complemento');
      if (needsFelHeader || needsFecComplemento) {
        await pool
          .request()
          .input('EMPNIT', sql.VarChar, empnit)
          .input('ID', sql.Int, existing.ID)
          .input('HTML', sql.NVarChar(sql.MAX), tpl.HTML)
          .input('CSS', sql.NVarChar(sql.MAX), tpl.CSS)
          .input('USUARIO_MOD', sql.VarChar, usuario)
          .query(`
            UPDATE dbo.FORMATOS_IMPRESION
            SET HTML = @HTML, CSS = @CSS, FECHA_MOD = GETDATE(), USUARIO_MOD = @USUARIO_MOD
            WHERE EMPNIT = @EMPNIT AND ID = @ID
          `);
      }
      continue;
    }
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('TIPODOC', sql.VarChar, tipodoc)
      .input('PAPEL', sql.VarChar, 'TICKET')
      .input('NOMBRE', sql.VarChar, tpl.NOMBRE)
      .input('HTML', sql.NVarChar(sql.MAX), tpl.HTML)
      .input('CSS', sql.NVarChar(sql.MAX), tpl.CSS)
      .input('ACTIVO', sql.VarChar, 'SI')
      .input('USUARIO_MOD', sql.VarChar, usuario)
      .query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.FORMATOS_IMPRESION
          WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND PAPEL = @PAPEL
        )
        INSERT INTO dbo.FORMATOS_IMPRESION
          (EMPNIT, TIPODOC, PAPEL, NOMBRE, HTML, CSS, ACTIVO, FECHA_MOD, USUARIO_MOD)
        VALUES
          (@EMPNIT, @TIPODOC, @PAPEL, @NOMBRE, @HTML, @CSS, @ACTIVO, GETDATE(), @USUARIO_MOD)
      `);
  }
}

async function ensureFacTicketFormat(pool, empnit, usuario = 'SISTEMA') {
  const tpl = getDefaultTemplate('TICKET', 'FAC');
  const existing = await findFormato(pool, empnit, 'FAC', 'TICKET');
  if (existing) {
    const html = String(existing.HTML || '');
    const css = String(existing.CSS || '');
    const looksLikeCartaOnTicket =
      html.includes('doc-meta-grid') || html.includes('doc-lines-table') || html.includes('report-header');
    const needsFacTicketLayout = looksLikeCartaOnTicket || !html.includes('fel-ticket');
    const needsFacLogoV2 = !css.includes('fac-ticket-logo-v2') || !html.includes('fac-ticket-doc');
    if (needsFacTicketLayout || needsFacLogoV2) {
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, existing.ID)
        .input('HTML', sql.NVarChar(sql.MAX), tpl.HTML)
        .input('CSS', sql.NVarChar(sql.MAX), tpl.CSS)
        .input('NOMBRE', sql.VarChar, tpl.NOMBRE)
        .input('USUARIO_MOD', sql.VarChar, usuario)
        .query(`
          UPDATE dbo.FORMATOS_IMPRESION
          SET HTML = @HTML, CSS = @CSS, NOMBRE = @NOMBRE, FECHA_MOD = GETDATE(), USUARIO_MOD = @USUARIO_MOD
          WHERE EMPNIT = @EMPNIT AND ID = @ID
        `);
    }
    return;
  }
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('TIPODOC', sql.VarChar, 'FAC')
    .input('PAPEL', sql.VarChar, 'TICKET')
    .input('NOMBRE', sql.VarChar, tpl.NOMBRE)
    .input('HTML', sql.NVarChar(sql.MAX), tpl.HTML)
    .input('CSS', sql.NVarChar(sql.MAX), tpl.CSS)
    .input('ACTIVO', sql.VarChar, 'SI')
    .input('USUARIO_MOD', sql.VarChar, usuario)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.FORMATOS_IMPRESION
        WHERE EMPNIT = @EMPNIT AND TIPODOC = 'FAC' AND PAPEL = 'TICKET'
      )
      INSERT INTO dbo.FORMATOS_IMPRESION
        (EMPNIT, TIPODOC, PAPEL, NOMBRE, HTML, CSS, ACTIVO, FECHA_MOD, USUARIO_MOD)
      VALUES
        (@EMPNIT, 'FAC', 'TICKET', @NOMBRE, @HTML, @CSS, 'SI', GETDATE(), @USUARIO_MOD)
    `);
}

async function loadDocumentoPrintData(pool, empnit, coddoc, correlativo) {
  const headerRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC, t.OBS AS TIPODOC_OBS,
        c.NEGOCIO AS CLI_NEGOCIO,
        ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
        ISNULL(emp.TELEFONOS, '') AS VENDEDOR_TELEFONO,
        ISNULL(cj.DESCAJA, '') AS DESCAJA
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      LEFT JOIN dbo.Empleados emp ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
      LEFT JOIN dbo.Cajas cj ON cj.EMPNIT = d.EMPNIT AND cj.CODCAJA = d.CODCAJA
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  if (!headerRes.recordset.length) return null;
  const header = normalizeDocumentoRows(headerRes.recordset)[0];
  header.FECHA_ISO = fechaIsoFromRow(header);

  const tipodoc = String(header.TIPODOC || '').trim().toUpperCase();
  let lines = [];
  if (TIPODOC_RETENCION_PRINT.includes(tipodoc)) {
    const abonos = await loadAbonosRetencion(pool, empnit, coddoc, correlativo);
    const kind = tipodoc === 'RTI' || tipodoc === 'RIR' ? 'isr' : 'iva';
    const calc = await loadCalcParams(pool, kind);
    lines = (abonos || []).map((a) => {
      const total = Number(a.FAC_TOTALPRECIO) || 0;
      const des = calcRetencionSobreBase(total, calc.ivaFactor, calc.retencionPorcentaje, kind);
      const base = Number(a.FAC_TOTALSINIVA) > 0 ? Number(a.FAC_TOTALSINIVA) : des.base;
      const iva = Number(a.FAC_TOTALIVA) > 0 ? Number(a.FAC_TOTALIVA) : des.iva;
      const serieNum = [a.FAC_SERIEFAC, a.FAC_NOFAC].filter(Boolean).join('-') || '—';
      const detalle =
        kind === 'iva'
          ? `${serieNum} · Base ${base.toFixed(2)} · IVA ${iva.toFixed(2)} · ${des.pct}%`
          : `${serieNum} · Base ${base.toFixed(2)} · ${des.pct}%`;
      return {
        CODPROD: `${a.CODDOC_FAC || ''} #${a.CORRELATIVO_FAC ?? ''}`.trim(),
        DESPROD: detalle,
        CODMEDIDA: '',
        CANTIDAD: 1,
        PRECIO: total,
        TOTALPRECIO: Number(a.ABONO) || 0,
        EQUIVALE: 1,
        TOTALUNIDADES: 1,
      };
    });
  } else {
    const linesRes = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
      SELECT
        l.Id AS ID, l.CODPROD, l.DESPROD, l.CODMEDIDA, l.CANTIDAD, l.EQUIVALE, l.PRECIO, l.COSTO,
        l.TOTALPRECIO, l.TOTALCOSTO, l.TOTALUNIDADES, l.TIPOPRECIO,
        ISNULL(l.EXENTO, 0) AS EXENTO,
        ISNULL(m.DESMARCA, '') AS DESMARCA
      FROM dbo.DOCPRODUCTOS l
      LEFT JOIN dbo.PRODUCTOS p
        ON p.EMPNIT = l.EMPNIT AND p.CODPROD = l.CODPROD
      LEFT JOIN dbo.MARCAS m
        ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
      WHERE l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
      ORDER BY l.Id
    `);
    lines = linesRes.recordset || [];
  }

  return { header, lines };
}

async function loadNombrePlantillaImpresion(pool, empnit, coddoc) {
  const cod = String(coddoc || '').trim();
  if (!cod) return null;
  try {
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, cod)
      .query(`
        SELECT NOMBRE_PLANTILLA_IMPRESION
        FROM dbo.TIPODOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    const v = String(result.recordset[0]?.NOMBRE_PLANTILLA_IMPRESION || '').trim();
    return v || null;
  } catch (err) {
    if (String(err.message || '').includes('NOMBRE_PLANTILLA_IMPRESION')) return null;
    throw err;
  }
}

/**
 * @param {string} [nombrePlantilla] — NOMBRE en FORMATOS_IMPRESION (desde TIPODOCUMENTOS por CODDOC)
 */
async function findFormato(pool, empnit, tipodoc, papel, nombrePlantilla, opts = {}) {
  const nombre = String(nombrePlantilla || '').trim();
  const strictName = Boolean(opts.strictPlantillaNombre && nombre);
  const req = pool.request().input('EMPNIT', sql.VarChar, empnit).input('PAPEL', sql.VarChar, papel);
  if (nombre) {
    req.input('NOMBRE', sql.VarChar, nombre);
    req.input('TIPODOC', sql.VarChar, tipodoc);
    const byName = await req.query(`
      SELECT TOP 1 *
      FROM dbo.FORMATOS_IMPRESION
      WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND PAPEL = @PAPEL
        AND NOMBRE = @NOMBRE AND ACTIVO = 'SI'
    `);
    if (byName.recordset[0]) return mapFormatoRow(byName.recordset[0]);
    if (strictName) return null;
  }
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('TIPODOC', sql.VarChar, tipodoc)
    .input('PAPEL', sql.VarChar, papel)
    .query(`
      SELECT TOP 1 *
      FROM dbo.FORMATOS_IMPRESION
      WHERE EMPNIT = @EMPNIT AND TIPODOC = @TIPODOC AND PAPEL = @PAPEL AND ACTIVO = 'SI'
      ORDER BY ID
    `);
  return mapFormatoRow(result.recordset[0]);
}

async function resolveFormatoForDocument(pool, empnit, coddoc, tipodoc, papel) {
  const nombre = await loadNombrePlantillaImpresion(pool, empnit, coddoc);
  return findFormato(pool, empnit, tipodoc, papel, nombre, {
    strictPlantillaNombre: Boolean(nombre),
  });
}

function isCartaHtmlOnTicket(html) {
  const h = String(html || '');
  return (
    h.includes('doc-meta-grid') ||
    h.includes('doc-lines-table') ||
    (h.includes('report-header') && h.includes('doc-print-sheet') && !h.includes('fel-ticket'))
  );
}

/** Evita plantillas ticket FAC rotas (layout carta) que congelan el navegador. */
function coerceFacTicketFormat(formato, tipodoc, papel) {
  const t = String(tipodoc || '').trim().toUpperCase();
  const p = normalizePapel(papel);
  if (t !== 'FAC' || p !== 'TICKET') return formato;
  const html = String(formato?.HTML || '');
  if (html.includes('fel-ticket') && !isCartaHtmlOnTicket(html)) return formato;
  const def = getDefaultTemplate('TICKET', 'FAC');
  return {
    ...formato,
    ...def,
    HTML: def.HTML,
    CSS: def.CSS,
    NOMBRE: def.NOMBRE,
    TIPODOC: 'FAC',
    PAPEL: 'TICKET',
  };
}

function isDocAnulado(header) {
  return String(header?.STATUS || '').trim().toUpperCase() === 'A';
}

function anuladoStampHtml() {
  return `<div class="doc-anulado-stamp" aria-label="Anulado">ANULADO</div>`;
}

function normalizePrioridadPrint(raw) {
  const p = String(raw || '').trim().toUpperCase();
  return p === 'BAJA' || p === 'MEDIA' || p === 'ALTA' ? p : '';
}

function prioridadBadgeHtml(prioridad) {
  const p = normalizePrioridadPrint(prioridad);
  if (!p) return '';
  const cls = p === 'ALTA' ? 'alta' : p === 'MEDIA' ? 'media' : 'baja';
  return `<div class="doc-prioridad-badge doc-prioridad-badge--${cls}" aria-label="Prioridad ${p}">${p}</div>`;
}

const PRIORIDAD_BADGE_CSS = `
.doc-prioridad-badge{
  position:fixed;top:8px;right:12px;z-index:60;
  padding:5px 12px;font-size:11px;font-weight:800;letter-spacing:.08em;
  text-transform:uppercase;border-radius:4px;line-height:1.2;
  box-shadow:0 1px 3px rgba(0,0,0,.12);
  -webkit-print-color-adjust:exact;print-color-adjust:exact
}
.doc-prioridad-badge--baja{background:#86efac;color:#14532d}
.doc-prioridad-badge--media{background:#facc15;color:#713f12}
.doc-prioridad-badge--alta{background:#ef4444;color:#fff}
@media print{
  .doc-prioridad-badge{position:absolute;top:4px;right:6px}
}
`;

/** Fuerza papel térmico 80mm al imprimir; en pantalla maximizada el contenido usa todo el ancho legible. */
const TICKET_PAPER_OVERRIDE_CSS = `
.doc-prioridad-badge{display:none!important;visibility:hidden!important}
@page{size:80mm auto!important;margin:1mm 2mm!important}
html{width:100%;margin:0;padding:0;box-sizing:border-box}
html,body{zoom:1!important;transform:none!important}
body{
  width:100%!important;max-width:none!important;margin:0!important;
  padding:2mm 2.5mm!important;box-sizing:border-box
}
.doc-print-sheet,.fel-ticket{
  width:100%!important;max-width:none!important;margin:0!important;box-sizing:border-box
}
@media screen{
  html,body{width:100%!important;max-width:none!important;margin:0!important}
  body{padding:1.25rem 1.75rem!important;font-size:15px!important;line-height:1.35!important}
  .doc-print-sheet,.fel-ticket{width:100%!important;max-width:none!important;margin:0!important}
  .report-logo{max-height:72px!important;max-width:140px!important}
  .fel-logo{max-height:84px!important;max-width:140px!important}
  .fac-ticket-doc .fel-logo{max-height:168px!important;max-width:280px!important}
  .report-empresa-nombre,.fel-nombre{font-size:1.35rem!important}
  .report-title,.fel-dte-tipo{font-size:1.1rem!important}
  .report-subtitle,.doc-meta-item,.fel-meta,.fel-muted{font-size:14px!important}
  .doc-lines-table th,.doc-lines-table td,
  .fel-table th,.fel-table td{font-size:13px!important;padding:6px 8px!important}
  .doc-totals,.doc-totals-row,.fel-totals-row{font-size:14px!important}
  .doc-totals-row.grand,.fel-totals-row.grand{font-size:1.15rem!important}
  .doc-footer,.fel-scan,.fel-uuid{font-size:12px!important}
  .fel-qr{width:110px!important;height:110px!important}
  .fel-fel-badge svg{width:120px!important}
}
@media print{
  html,body{width:100%!important;max-width:80mm!important;margin:0 auto!important;padding:0!important}
  body{padding:1mm 1.5mm!important;font-size:11px!important;-webkit-print-color-adjust:economy;print-color-adjust:economy}
  img{max-width:100%!important;height:auto!important}
}
`;

/** Vista previa en ventana maximizada: ticket centrado, zoom 100%, tipografía legible. */
const TICKET_SCREEN_PREVIEW_CSS = `
@media screen{
  html,body{
    height:100%;margin:0;background:#e8eaed;
    zoom:1!important;transform:none!important;
    -webkit-text-size-adjust:100%;text-size-adjust:100%;
  }
  body{
    display:flex;justify-content:center;align-items:flex-start;
    min-height:100%;padding:20px 16px;box-sizing:border-box;
  }
  .fel-ticket,.doc-print-sheet{
    width:80mm!important;max-width:80mm!important;min-width:0!important;
    margin:0 auto!important;background:#fff!important;
    box-shadow:0 6px 28px rgba(15,23,42,.14);
  }
}
`;

function wrapPrintHtml({ title, bodyHtml, css, preview = false, anulado = false, prioridad = '', papel = 'CARTA' }) {
  const safeTitle = String(title || 'Documento')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const isTicket = String(papel || '').trim().toUpperCase() === 'TICKET';
  const previewCss = preview
    ? `
body{padding:${isTicket ? '8px' : '16px'};background:#fff}
`
    : '';
  const stamp = anulado ? anuladoStampHtml() : '';
  const badge = isTicket ? '' : prioridadBadgeHtml(prioridad);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${safeTitle}</title>
<style>
html,body{zoom:1!important;transform:none!important;-webkit-text-size-adjust:100%}
body{font-family:Segoe UI,Helvetica,Arial,sans-serif;padding:1.25rem;font-size:12px;color:#111;background:#fff;position:relative}
.doc-print-sheet,.fel-ticket{zoom:1!important;transform:none!important}
.doc-anulado-stamp{
  text-align:center;color:#dc2626;font-size:3.25rem;font-weight:900;
  letter-spacing:.14em;text-transform:uppercase;line-height:1.1;
  margin:0 0 .85rem;padding:.45rem .6rem;border:3px solid #dc2626;
  background:rgba(254,226,226,.55)
}
${PRIORIDAD_BADGE_CSS}
@media print{
  html,body{zoom:1!important;transform:none!important}
  body{padding:.5rem}
  .doc-anulado-stamp{font-size:2.75rem;-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
${previewCss}
${css || ''}
${isTicket ? TICKET_PAPER_OVERRIDE_CSS : ''}
${isTicket ? TICKET_SCREEN_PREVIEW_CSS : ''}
</style></head><body>${stamp}${badge}${bodyHtml}</body></html>`;
}

/** Catálogo de variables disponibles para el editor. */
router.get('/variables', (_req, res) => {
  res.json({
    groups: [
      {
        name: 'Documento (DOC)',
        vars: [
          'DOC.CODDOC',
          'DOC.CORRELATIVO',
          'DOC.DOCUMENTO_LABEL',
          'DOC.TIPODOC',
          'DOC.DESDOC',
          'DOC.FECHA',
          'DOC.HORA',
          'DOC.DOC_NOMCLIE',
          'DOC.DOC_NIT',
          'DOC.DOC_DIRCLIE',
          'DOC.F_ENTREGA',
          'DOC.DIRENTREGA',
          'DOC.NEGOCIO',
          'DOC.CONCRE',
          'DOC.CONCRE_LABEL',
          'DOC.VENDEDOR',
          'DOC.VENDEDOR_TELEFONO',
          'DOC.OBS',
          'DOC.PRIORIDAD',
          'DOC.FEL_COMPLEMENTO_SHOW',
          'DOC.FEL_NUM_CUOTAS',
          'DOC.FEL_CUOTAS (bloque {{#DOC.FEL_CUOTAS}}…{{/DOC.FEL_CUOTAS}})',
          'NUM',
          'FECHA',
          'MONTO_FMT',
          'DOC.FEL_UUDI',
          'DOC.FEL_SERIE',
          'DOC.FEL_NUMERO',
          'DOC.FEL_FECHA',
          'DOC.FEL_TITULO',
          'DOC.SERIEFAC',
          'DOC.NOFAC',
          'DOC.SERIE',
          'DOC.NUMERO',
          'DOC.NO_INTERNO',
          'DOC.FEL_CONSULTA_URL',
          'DOC.FEL_QR_IMG',
          'DOC.USUARIO',
          'DOC.DESCAJA',
          'DOC.STATUS',
          'DOC.IS_ANULADO',
        ],
      },
      {
        name: 'Empresa (EMPRESA)',
        vars: [
          'EMPRESA.NIT',
          'EMPRESA.NOMBRE',
          'EMPRESA.RAZON_SOCIAL',
          'EMPRESA.DIRECCION',
          'EMPRESA.TELEFONO',
          'EMPRESA.EMAIL',
          'EMPRESA.LOGO_URL',
          'EMPRESA.FRASE_FISCAL',
          'EMPRESA.FEL_URL',
        ],
      },
      {
        name: 'FEL / certificador',
        vars: [
          'FEL.CERTIFICADOR',
          'FEL.CERTIFICADOR_NIT',
          'FEL.UUID',
          'FEL.FECHA_CERT',
          'FEL.URL_BASE',
          'FEL.CONSULTA_URL',
          'FEL.QR_IMG',
        ],
      },
      {
        name: 'Credenciales FEL (encabezado)',
        vars: [
          'FEL_CRED.NOMBRE_COMERCIAL',
          'FEL_CRED.NOMBRE_EMISOR',
          'FEL_CRED.EMISOR_NOMBRECOMECIAL',
          'FEL_CRED.EMISOR_NOMBRE',
          'FEL_CRED.RAZON_SOCIAL',
          'FEL_CRED.DIRECCION',
          'FEL_CRED.EMISOR_DIRECCION',
          'FEL_CRED.EMISOR_MUNICIPIO',
          'FEL_CRED.EMISOR_DEPARTAMENTO',
          'FEL_CRED.FRASE1',
          'FEL_CRED.FRASE2',
          'FEL_CRED.FRASE3',
          'FEL_CRED.NIT',
          'DOC.TIPODOC_OBS',
          'DOC.FEL_EXENTO_LEYENDA',
          'FEL_CRED.TEL_SUCURSAL',
        ],
      },
      {
        name: 'Líneas (LINES)',
        vars: [
          'LINES (bloque {{#LINES}}…{{/LINES}})',
          'CODPROD',
          'DESPROD',
          'CODMEDIDA',
          'CANTIDAD',
          'PRECIO_FMT',
          'PRECIO_LETRAS',
          'TOTALPRECIO_FMT',
          'TOTALPRECIO',
          'PRECIO',
        ],
      },
      {
        name: 'Totales / general',
        vars: [
          'TITLE',
          'FOOTER',
          'TOTALES.TOTALPRECIO_FMT',
          'TOTALES.SUBTOTAL_FMT',
          'TOTALES.DESCUENTO_FMT',
          'TOTALES.TOTAL_LETRAS',
          'TOTALES.LINEAS',
        ],
      },
    ],
  });
});

router.get('/default', (req, res) => {
  const papel = normalizePapel(req.query.papel);
  const tipodoc = normalizeTipodoc(req.query.tipodoc);
  res.json(getDefaultTemplate(papel, tipodoc));
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    await ensureFelTicketFormats(pool, empnit);
    await ensureFacTicketFormat(pool, empnit);
    const tipodoc = normalizeTipodoc(req.query.tipodoc);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    let filter = '';
    if (tipodoc) {
      request.input('TIPODOC', sql.VarChar, tipodoc);
      filter = ' AND TIPODOC = @TIPODOC';
    }
    const result = await request.query(`
      SELECT ID, EMPNIT, TIPODOC, PAPEL, NOMBRE, ACTIVO, FECHA_MOD, USUARIO_MOD,
        LEN(HTML) AS HTML_LEN, LEN(ISNULL(CSS,'')) AS CSS_LEN
      FROM dbo.FORMATOS_IMPRESION
      WHERE EMPNIT = @EMPNIT ${filter}
      ORDER BY TIPODOC, PAPEL
    `);
    res.json({
      rows: result.recordset.map((r) => ({
        ID: r.ID,
        EMPNIT: r.EMPNIT,
        TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
        PAPEL: normalizePapel(r.PAPEL),
        NOMBRE: r.NOMBRE || '',
        ACTIVO: normalizeActivo(r.ACTIVO),
        FECHA_MOD: r.FECHA_MOD || null,
        USUARIO_MOD: r.USUARIO_MOD || null,
        HTML_LEN: r.HTML_LEN || 0,
        CSS_LEN: r.CSS_LEN || 0,
      })),
    });
  } catch (err) {
    console.warn('[API GET /formatos-impresion]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/tipodocs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    let result;
    try {
      result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .query(`
          SELECT DISTINCT t.TIPODOC,
            ISNULL(c.DESCRIPCION, t.TIPODOC) AS DESCRIPCION
          FROM dbo.TIPODOCUMENTOS t
          LEFT JOIN dbo.CONFIG_TIPODOCUMENTOS c ON c.TIPODOC = t.TIPODOC
          WHERE t.EMPNIT = @EMPNIT AND ISNULL(t.ACTIVO, 'SI') = 'SI'
          ORDER BY t.TIPODOC
        `);
    } catch (_joinErr) {
      result = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .query(`
          SELECT DISTINCT TIPODOC, TIPODOC AS DESCRIPCION
          FROM dbo.TIPODOCUMENTOS
          WHERE EMPNIT = @EMPNIT AND ISNULL(ACTIVO, 'SI') = 'SI'
          ORDER BY TIPODOC
        `);
    }
    res.json({
      rows: result.recordset.map((r) => ({
        TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
        DESCRIPCION: String(r.DESCRIPCION || r.TIPODOC || '').trim(),
      })),
    });
  } catch (err) {
    console.warn('[API GET /formatos-impresion/tipodocs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** Nombres de plantillas internas (FORMATOS_IMPRESION) para selector en TIPODOCUMENTOS. */
router.get('/plantillas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const tipodoc = normalizeTipodoc(req.query.tipodoc);
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    let filterSql = '';
    if (tipodoc) {
      request.input('TIPODOC', sql.VarChar, tipodoc);
      filterSql = ' AND TIPODOC = @TIPODOC';
    }
    const result = await request.query(`
      SELECT NOMBRE, TIPODOC, PAPEL
      FROM dbo.FORMATOS_IMPRESION
      WHERE EMPNIT = @EMPNIT AND ACTIVO = 'SI'${filterSql}
      ORDER BY TIPODOC, PAPEL, NOMBRE
    `);
    res.json({
      rows: (result.recordset || []).map((r) => {
        const nombre = String(r.NOMBRE || '').trim();
        const td = String(r.TIPODOC || '').trim().toUpperCase();
        const papel = normalizePapel(r.PAPEL);
        return {
          NOMBRE: nombre,
          TIPODOC: td,
          PAPEL: papel,
          value: nombre,
          label: `${nombre} (${td} · ${papel})`,
        };
      }),
    });
  } catch (err) {
    console.warn('[API GET /formatos-impresion/plantillas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/resolve', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const tipodoc = normalizeTipodoc(req.query.tipodoc);
  const papel = normalizePapel(req.query.papel);
  if (!tipodoc) return res.status(400).json({ error: 'TIPODOC requerido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    await ensureFelTicketFormats(pool, empnit);
    await ensureFacTicketFormat(pool, empnit);
    const found = await findFormato(pool, empnit, tipodoc, papel);
    if (found) return res.json(found);
    const def = getDefaultTemplate(papel, tipodoc);
    res.json({
      ...def,
      EMPNIT: empnit,
      TIPODOC: tipodoc,
      ID: null,
      ACTIVO: 'SI',
    });
  } catch (err) {
    console.warn('[API GET /formatos-impresion/resolve]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Renderiza un documento real: EMPNIT + CODDOC + CORRELATIVO → TIPODOC → plantilla.
 * GET o POST (POST permite enviar logoUrl como data URL).
 */
async function handleRender(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const src = req.method === 'POST' ? { ...req.query, ...req.body } : req.query;
  const coddoc = String(src.coddoc || '').trim();
  const correlativo = Number(src.correlativo);
  const papel = normalizePapel(src.papel);
  const logoUrl = String(src.logoUrl || src.LOGO_URL || '').trim();
  if (!coddoc || !Number.isFinite(correlativo)) {
    return res.status(400).json({ error: 'CODDOC y CORRELATIVO requeridos' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    await ensureFelTicketFormats(pool, empnit);
    await ensureFacTicketFormat(pool, empnit);
    const doc = await loadDocumentoPrintData(pool, empnit, coddoc, correlativo);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });

    const tipodoc = normalizeTipodoc(doc.header.TIPODOC);
    let formato = (await resolveFormatoForDocument(pool, empnit, coddoc, tipodoc, papel)) || {
      ...getDefaultTemplate(papel, tipodoc),
      EMPNIT: empnit,
      TIPODOC: tipodoc,
    };
    formato = coerceFacTicketFormat(formato, tipodoc, papel);

    const empresa = await loadEmpresa(pool, empnit);
    if (logoUrl) empresa.LOGO_URL = logoUrl;
    const felUrlBase = await loadFelUrlBase(pool);
    const muestraPeso =
      (await getSettingSino(pool, SETTING_OPCION.MUESTRA_PESO_EN_DOCUMENTOS)) === 'SI';
    const muestraMarcas =
      (await getSettingSino(pool, SETTING_OPCION.MUESTRA_MARCAS_EN_DOCUMENTOS)) === 'SI';

    const title = String(src.title || doc.header.DESDOC || tipodoc || 'Documento').trim();
    const footerNote =
      tipodoc === 'COT'
        ? 'Cotización — documento sin validez fiscal'
        : 'Documento generado por POS OnneB';

    const felCredencial = await loadFelCredForPrint(pool, empnit, tipodoc, {
      felUuid: doc.header?.FEL_UUDI,
    });
    const ctx = await buildPrintContextAsync({
      pool,
      empnit,
      empresa,
      header: doc.header,
      lines: doc.lines,
      title,
      footerNote,
      felUrlBase,
      muestraPeso,
      muestraMarcas,
      felCredencial,
      tipodocObs: doc.header?.TIPODOC_OBS,
    });
    const bodyHtml = renderTemplate(sanitizeDesignerHtml(formato.HTML), ctx);
    const fullHtml = wrapPrintHtml({
      title,
      bodyHtml,
      css: formato.CSS,
      anulado: isDocAnulado(doc.header),
      prioridad: doc.header?.PRIORIDAD,
      papel,
    });

    res.json({
      tipodoc,
      papel,
      formatoId: formato.ID || null,
      esDefault: Boolean(formato.ES_DEFAULT),
      title,
      bodyHtml,
      css: formato.CSS || '',
      html: fullHtml,
      header: doc.header,
    });
  } catch (err) {
    console.warn('[API /formatos-impresion/render]', err.message);
    res.status(500).json({ error: err.message });
  }
}

router.get('/render', handleRender);
router.post('/render', handleRender);

/** Vista previa con HTML/CSS del editor (sin guardar) o plantilla guardada. */
router.post('/preview', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const papel = normalizePapel(req.body?.papel);
  const htmlTpl = String(req.body?.HTML ?? req.body?.html ?? '');
  const css = String(req.body?.CSS ?? req.body?.css ?? '');
  const coddoc = String(req.body?.coddoc || '').trim();
  const correlativo = Number(req.body?.correlativo);
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    let ctx;
    let title = 'Vista previa';
    const logoUrl = String(req.body?.logoUrl || req.body?.LOGO_URL || '').trim();
    if (coddoc && Number.isFinite(correlativo)) {
      const doc = await loadDocumentoPrintData(pool, empnit, coddoc, correlativo);
      if (!doc) return res.status(404).json({ error: 'Documento no encontrado' });
      const empresa = await loadEmpresa(pool, empnit);
      if (logoUrl) empresa.LOGO_URL = logoUrl;
      const felUrlBase = await loadFelUrlBase(pool);
      title = doc.header.DESDOC || doc.header.TIPODOC || title;
      const muestraPeso =
        (await getSettingSino(pool, SETTING_OPCION.MUESTRA_PESO_EN_DOCUMENTOS)) === 'SI';
      const muestraMarcas =
        (await getSettingSino(pool, SETTING_OPCION.MUESTRA_MARCAS_EN_DOCUMENTOS)) === 'SI';
      ctx = await buildPrintContextAsync({
        pool,
        empnit,
        empresa,
        header: doc.header,
        lines: doc.lines,
        title,
        footerNote: 'Vista previa',
        felUrlBase,
        muestraPeso,
        muestraMarcas,
        tipodocObs: doc.header?.TIPODOC_OBS,
      });
    } else {
      const felUrlBase = await loadFelUrlBase(pool);
      ctx = samplePrintContext();
      const empresa = await loadEmpresa(pool, empnit);
      ctx.EMPRESA.NIT = empresa.EMPNIT || ctx.EMPRESA.NIT;
      ctx.EMPRESA.NOMBRE = empresa.EMPNOMBRE || ctx.EMPRESA.NOMBRE;
      ctx.EMPRESA.RAZON_SOCIAL = empresa.EMPRAZONSOCIAL || ctx.EMPRESA.RAZON_SOCIAL || '';
      ctx.EMPRESA.DIRECCION = empresa.EMPDIRECCION || ctx.EMPRESA.DIRECCION || '';
      ctx.EMPRESA.TELEFONO = empresa.EMPTELEFONO || ctx.EMPRESA.TELEFONO || '';
      ctx.EMPRESA.EMAIL = empresa.EMPEMAIL || ctx.EMPRESA.EMAIL || '';
      ctx.EMPRESA.FEL_URL = felUrlBase || ctx.EMPRESA.FEL_URL || '';
      if (logoUrl) ctx.EMPRESA.LOGO_URL = logoUrl;
      if (felUrlBase && ctx.DOC?.FEL_UUDI) {
        const rebuilt = await buildPrintContextAsync({
          empresa: { ...empresa, LOGO_URL: logoUrl || '', FEL_URL: felUrlBase },
          header: {
            CODDOC: ctx.DOC.CODDOC,
            CORRELATIVO: ctx.DOC.CORRELATIVO,
            TIPODOC: ctx.DOC.TIPODOC,
            DESDOC: ctx.DOC.DESDOC,
            FECHA_ISO: ctx.DOC.FECHA_ISO,
            DOC_NOMCLIE: ctx.DOC.DOC_NOMCLIE,
            DOC_NIT: ctx.DOC.DOC_NIT,
            DOC_DIRCLIE: ctx.DOC.DOC_DIRCLIE,
            F_ENTREGA: ctx.DOC.F_ENTREGA,
            DIRENTREGA: ctx.DOC.DIRENTREGA,
            TOTALPRECIO: ctx.TOTALES.TOTALPRECIO,
            TOTALDESCUENTO: ctx.TOTALES.DESCUENTO,
            FEL_UUDI: ctx.DOC.FEL_UUDI,
            FEL_SERIE: ctx.DOC.FEL_SERIE,
            FEL_NUMERO: ctx.DOC.FEL_NUMERO,
            FEL_FECHA: ctx.DOC.FEL_FECHA,
          },
          lines: ctx.LINES,
          title: ctx.TITLE,
          footerNote: ctx.FOOTER,
          felUrlBase,
        });
        Object.assign(ctx, rebuilt);
      }
    }

    const tipodocPreview = normalizeTipodoc(req.body?.tipodoc || ctx?.DOC?.TIPODOC);
    const tpl = sanitizeDesignerHtml(htmlTpl || getDefaultTemplate(papel, tipodocPreview).HTML);
    const style = css || getDefaultTemplate(papel, tipodocPreview).CSS;
    const bodyHtml = renderTemplate(tpl, ctx);
    const fullHtml = wrapPrintHtml({
      title,
      bodyHtml,
      css: style,
      preview: true,
      anulado: Boolean(ctx?.DOC?.IS_ANULADO) || isDocAnulado({ STATUS: ctx?.DOC?.STATUS }),
      prioridad: ctx?.DOC?.PRIORIDAD,
      papel,
    });
    res.json({ html: fullHtml, bodyHtml, css: style, papel });
  } catch (err) {
    console.warn('[API POST /formatos-impresion/preview]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .query(`
        SELECT * FROM dbo.FORMATOS_IMPRESION
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    const row = mapFormatoRow(result.recordset[0]);
    if (!row) return res.status(404).json({ error: 'Formato no encontrado' });
    res.json(row);
  } catch (err) {
    console.warn('[API GET /formatos-impresion/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const tipodoc = normalizeTipodoc(req.body?.TIPODOC);
  const papel = normalizePapel(req.body?.PAPEL);
  const nombre = String(req.body?.NOMBRE || `Formato ${tipodoc} ${papel}`).trim().slice(0, 100);
  const html = sanitizeDesignerHtml(String(req.body?.HTML ?? ''));
  const css = String(req.body?.CSS ?? '');
  const activo = normalizeActivo(req.body?.ACTIVO, 'SI');
  const usuario = String(req.body?.USUARIO || req.body?.usuario || '').trim().slice(0, 50) || null;
  if (!tipodoc) return res.status(400).json({ error: 'TIPODOC es obligatorio' });
  if (!html.trim()) return res.status(400).json({ error: 'HTML es obligatorio' });
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('TIPODOC', sql.VarChar, tipodoc)
      .input('PAPEL', sql.VarChar, papel)
      .input('NOMBRE', sql.VarChar, nombre)
      .input('HTML', sql.NVarChar(sql.MAX), html)
      .input('CSS', sql.NVarChar(sql.MAX), css || null)
      .input('ACTIVO', sql.VarChar, activo)
      .input('USUARIO', sql.VarChar, usuario)
      .query(`
        INSERT INTO dbo.FORMATOS_IMPRESION
          (EMPNIT, TIPODOC, PAPEL, NOMBRE, HTML, CSS, ACTIVO, FECHA_MOD, USUARIO_MOD)
        VALUES
          (@EMPNIT, @TIPODOC, @PAPEL, @NOMBRE, @HTML, @CSS, @ACTIVO, GETDATE(), @USUARIO);
        SELECT SCOPE_IDENTITY() AS ID;
      `);
    const id = Number(result.recordset?.[0]?.ID);
    res.status(201).json({ ok: true, ID: id, EMPNIT: empnit, TIPODOC: tipodoc, PAPEL: papel });
  } catch (err) {
    if (
      String(err.message || '').includes('UQ_FORMATOS_IMPRESION') ||
      String(err.message || '').includes('UQ_FORMATOS_IMPRESION_NOMBRE') ||
      err.number === 2627
    ) {
      return res.status(409).json({
        error: `Ya existe un formato con el mismo nombre para ${tipodoc} / ${papel} en esta empresa`,
      });
    }
    console.warn('[API POST /formatos-impresion]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  const nombre = String(req.body?.NOMBRE || '').trim().slice(0, 100);
  const html = sanitizeDesignerHtml(String(req.body?.HTML ?? ''));
  const css = String(req.body?.CSS ?? '');
  const activo = normalizeActivo(req.body?.ACTIVO, 'SI');
  const usuario = String(req.body?.USUARIO || req.body?.usuario || '').trim().slice(0, 50) || null;
  if (!html.trim()) return res.status(400).json({ error: 'HTML es obligatorio' });
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .input('NOMBRE', sql.VarChar, nombre || `Formato ${id}`)
      .input('HTML', sql.NVarChar(sql.MAX), html)
      .input('CSS', sql.NVarChar(sql.MAX), css || null)
      .input('ACTIVO', sql.VarChar, activo)
      .input('USUARIO', sql.VarChar, usuario)
      .query(`
        UPDATE dbo.FORMATOS_IMPRESION
        SET NOMBRE = @NOMBRE, HTML = @HTML, CSS = @CSS, ACTIVO = @ACTIVO,
            FECHA_MOD = GETDATE(), USUARIO_MOD = @USUARIO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Formato no encontrado' });
    res.json({ ok: true, ID: id });
  } catch (err) {
    console.warn('[API PUT /formatos-impresion/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .query(`
        DELETE FROM dbo.FORMATOS_IMPRESION
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (!result.rowsAffected?.[0]) return res.status(404).json({ error: 'Formato no encontrado' });
    res.json({ ok: true, ID: id });
  } catch (err) {
    console.warn('[API DELETE /formatos-impresion/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
