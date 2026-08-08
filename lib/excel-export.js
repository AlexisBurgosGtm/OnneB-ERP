/**
 * Helpers de exportación Excel: fechas reales con formato dd/mm/yyyy.
 * Excepción: DOCUMENTOS.FEL_FECHA (y clave FEL_FECHA) se exporta como texto.
 */

const EXCEL_DATE_NUMFMT = 'dd/mm/yyyy';

function isFelFechaKey(key) {
  return String(key || '').toUpperCase() === 'FEL_FECHA';
}

/** Columnas de fecha (excluye FEL_FECHA, que es string). */
function isExcelDateColumnKey(key) {
  if (!key || isFelFechaKey(key)) return false;
  return /FECHA|DATE|VENCIM|FECHAINICIO|FECHAFIN/i.test(String(key));
}

/**
 * Convierte valor SQL/JS a Date local a mediodía (evita desfases por TZ en Excel).
 * MSSQL DATE/datetime suelen llegar como medianoche UTC: usar componentes UTC.
 * @returns {Date|null}
 */
function toExcelDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
      12,
      0,
      0,
      0
    );
  }
  const s = String(value).trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d, 12, 0, 0, 0);
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), 12, 0, 0, 0);
}

/**
 * Valor de celda: Date de Excel o vacío. No usar para FEL_FECHA.
 */
function excelDateCellValue(value) {
  return toExcelDate(value) || '';
}

/**
 * Aplica numFmt de fecha a columnas por clave (índice 1-based vía headers de addRow).
 * @param {import('exceljs').Worksheet} sheet
 * @param {Array<{ key: string, type?: string }>} columns
 * @param {{ headerRow?: number }} [opts]
 */
function applyExcelDateFormats(sheet, columns, opts = {}) {
  const headerRow = opts.headerRow || 1;
  (columns || []).forEach((col, idx) => {
    const forceDate = col.type === 'date';
    const forceString = col.type === 'string' || col.type === 'text';
    if (forceString || isFelFechaKey(col.key)) return;
    if (!forceDate && !isExcelDateColumnKey(col.key)) return;
    const colIndex = idx + 1;
    sheet.getColumn(colIndex).numFmt = EXCEL_DATE_NUMFMT;
    // Asegura formato en celdas de datos (por si ExcelJS no hereda del column)
    for (let r = headerRow + 1; r <= sheet.rowCount; r += 1) {
      const cell = sheet.getRow(r).getCell(colIndex);
      if (cell.value instanceof Date) cell.numFmt = EXCEL_DATE_NUMFMT;
    }
  });
}

/**
 * Normaliza valor de fila según tipo/clave de columna antes de escribir en Excel.
 */
function normalizeExportCellValue(col, raw) {
  if (!col) return raw == null ? '' : raw;
  if (col.type === 'string' || col.type === 'text' || isFelFechaKey(col.key)) {
    if (raw == null || raw === '') return '';
    if (raw instanceof Date) {
      const y = raw.getFullYear();
      const m = String(raw.getMonth() + 1).padStart(2, '0');
      const d = String(raw.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(raw);
  }
  if (col.type === 'date' || isExcelDateColumnKey(col.key)) {
    return excelDateCellValue(raw);
  }
  return raw == null ? '' : raw;
}

module.exports = {
  EXCEL_DATE_NUMFMT,
  isFelFechaKey,
  isExcelDateColumnKey,
  toExcelDate,
  excelDateCellValue,
  applyExcelDateFormats,
  normalizeExportCellValue,
};
