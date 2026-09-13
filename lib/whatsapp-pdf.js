/**
 * PDF tabular por secciones para reportes programados de WhatsApp.
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { documentosDir } = require('./app-paths');

function safeName(name) {
  return String(name || 'reporte')
    .replace(/[^\w.\-áéíóúÁÉÍÓÚñÑ ]+/g, '_')
    .trim()
    .slice(0, 80) || 'reporte';
}

function clip(value, max = 48) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text || '—';
  return `${text.slice(0, Math.max(1, max - 3))}...`;
}

function writeSectionsPdf(spec = {}) {
  const dir = documentosDir();
  const base = safeName(spec.fileName || 'reporte-whatsapp');
  const fileName = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
  const filePath = path.join(dir, fileName);
  const pageWidth = 612 - 72;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'LETTER' });
    const stream = fs.createWriteStream(filePath);
    stream.on('error', reject);
    doc.on('error', reject);
    doc.pipe(stream);

    doc.fontSize(12).font('Helvetica-Bold').text(String(spec.empresa || '—'));
    doc.moveDown(0.2);
    doc.fontSize(14).text(String(spec.title || 'Reporte'));
    if (spec.subtitle) {
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').fillColor('#444').text(String(spec.subtitle));
      doc.fillColor('#000');
    }
    doc.moveDown(0.6);

    const sections = Array.isArray(spec.sections) ? spec.sections : [];
    sections.forEach((section) => {
      drawSection(doc, section, pageWidth);
    });

    doc.end();
    stream.on('finish', () => resolve({ filePath, fileName }));
  });
}

function drawSection(doc, section, pageWidth) {
  if (!section) return;
  if (section.title) {
    ensureSpace(doc, 28);
    doc.font('Helvetica-Bold').fontSize(10).text(String(section.title));
    doc.moveDown(0.25);
  }
  if (section.note) {
    doc.font('Helvetica').fontSize(8).fillColor('#555').text(String(section.note));
    doc.fillColor('#000');
    doc.moveDown(0.3);
  }
  if (Array.isArray(section.lines) && section.lines.length) {
    doc.font('Helvetica').fontSize(9);
    section.lines.forEach((line) => {
      ensureSpace(doc, 14);
      doc.text(String(line));
    });
    doc.moveDown(0.4);
  }
  if (Array.isArray(section.columns) && section.columns.length) {
    drawTable(doc, section, pageWidth);
    doc.moveDown(0.5);
  }
}

function drawTable(doc, section, pageWidth) {
  const columns = section.columns;
  const rows = Array.isArray(section.rows) ? section.rows : [];
  const totalW = columns.reduce((sum, col) => sum + (Number(col.w) || 0), 0) || pageWidth;
  const scale = totalW > pageWidth ? pageWidth / totalW : 1;
  const cols = columns.map((col) => ({
    ...col,
    w: Math.max(36, Math.floor((Number(col.w) || pageWidth / columns.length) * scale)),
  }));
  const rowH = 14;
  let y = doc.y;

  function header() {
    let x = doc.page.margins.left;
    doc.font('Helvetica-Bold').fontSize(7);
    cols.forEach((col) => {
      doc.text(String(col.label || ''), x, y, { width: col.w - 4, align: col.align || 'left', lineBreak: false });
      x += col.w;
    });
    y += rowH;
    doc.moveTo(doc.page.margins.left, y - 2)
      .lineTo(doc.page.margins.left + cols.reduce((a, c) => a + c.w, 0), y - 2)
      .stroke('#999');
    doc.font('Helvetica').fontSize(7);
  }

  header();
  if (!rows.length) {
    ensureSpace(doc, rowH);
    doc.text('Sin registros', doc.page.margins.left, y);
    y += rowH;
    doc.y = y;
    return;
  }
  rows.forEach((row) => {
    if (y > doc.page.height - 48) {
      doc.addPage();
      y = doc.page.margins.top;
      header();
    }
    let x = doc.page.margins.left;
    cols.forEach((col) => {
      const raw = row?.[col.key];
      doc.text(clip(raw, col.max || 40), x, y, {
        width: col.w - 4,
        align: col.align || 'left',
        lineBreak: false,
      });
      x += col.w;
    });
    y += rowH;
  });
  doc.y = y;
}

function ensureSpace(doc, needed) {
  if (doc.y + needed <= doc.page.height - 40) return;
  doc.addPage();
}

module.exports = {
  writeSectionsPdf,
};
