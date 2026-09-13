/**
 * Genera PDF de reportes tabulares simples (p. ej. facturas pendientes CXC).
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { documentosDir } = require('./app-paths');

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeName(name) {
  return String(name || 'documento')
    .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]+/g, '_')
    .trim()
    .slice(0, 120) || 'documento';
}

/**
 * @param {object} report
 * @param {{ fileName?: string }} [opts]
 * @returns {Promise<{ filePath: string, fileName: string }>}
 */
function writePendientesPdf(report, opts = {}) {
  const dir = documentosDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = safeName(opts.fileName || report?.fileName || `facturas-pendientes-${stamp}`);
  const fileName = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  const filePath = path.join(dir, fileName);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'LETTER' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const empresa = String(report?.empresa || '—');
    const title = String(report?.title || 'Facturas pendientes');
    const partyTitle = String(report?.partyTitle || 'Cliente');
    const partyName = String(report?.partyName || '—');
    const codigo = String(report?.codigo || '—');
    const nit = String(report?.nit || '').trim();
    const fecha = String(report?.fecha || '');
    const abonoLabel = String(report?.abonoLabel || 'Abonos');
    const rows = Array.isArray(report?.rows) ? report.rows : [];
    const totals = report?.totals || {};

    doc.fontSize(12).font('Helvetica-Bold').text(empresa, { align: 'left' });
    doc.moveDown(0.3);
    doc.fontSize(14).text(title);
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica');
    doc.text(`${partyTitle}: ${partyName}`);
    doc.text(`Código: ${codigo}`);
    if (nit) doc.text(`NIT: ${nit}`);
    if (fecha) doc.text(`Fecha: ${fecha}`);
    doc.moveDown(0.6);

    const cols = [
      { key: 'doc', label: 'Documento', w: 110, align: 'left' },
      { key: 'fecha', label: 'Fecha', w: 70, align: 'left' },
      { key: 'vence', label: 'Vence', w: 70, align: 'left' },
      { key: 'importe', label: 'Importe', w: 75, align: 'right' },
      { key: 'abono', label: abonoLabel, w: 75, align: 'right' },
      { key: 'saldo', label: 'Saldo', w: 75, align: 'right' },
    ];
    const startX = doc.page.margins.left;
    let y = doc.y;
    const rowH = 16;

    function drawHeader() {
      let x = startX;
      doc.font('Helvetica-Bold').fontSize(8);
      cols.forEach((c) => {
        doc.text(c.label, x, y, { width: c.w, align: c.align });
        x += c.w;
      });
      y += rowH;
      doc.moveTo(startX, y - 2).lineTo(startX + cols.reduce((a, c) => a + c.w, 0), y - 2).stroke('#999');
      doc.font('Helvetica').fontSize(8);
    }

    drawHeader();

    rows.forEach((r) => {
      if (y > doc.page.height - 60) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeader();
      }
      let x = startX;
      const cells = [
        String(r.doc || '—'),
        String(r.fecha || '—'),
        String(r.vence || '—'),
        money(r.importe),
        money(r.abono),
        money(r.saldo),
      ];
      cells.forEach((val, i) => {
        doc.text(val, x, y, { width: cols[i].w, align: cols[i].align });
        x += cols[i].w;
      });
      y += rowH;
    });

    y += 4;
    doc.moveTo(startX, y).lineTo(startX + cols.reduce((a, c) => a + c.w, 0), y).stroke('#666');
    y += 6;
    doc.font('Helvetica-Bold');
    let x = startX;
    const footer = [
      `${rows.length} documento(s)`,
      '',
      '',
      money(totals.importe),
      money(totals.abono),
      money(totals.saldo),
    ];
    footer.forEach((val, i) => {
      doc.text(val, x, y, { width: cols[i].w, align: cols[i].align });
      x += cols[i].w;
    });

    doc.end();
    stream.on('finish', () => resolve({ filePath, fileName }));
    stream.on('error', reject);
    doc.on('error', reject);
  });
}

module.exports = {
  writePendientesPdf,
  documentosDir,
};
