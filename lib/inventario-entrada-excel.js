const XLSX = require('xlsx');

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    return String(value);
  }
  return String(value).trim();
}

function cellCodprod(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).trim();
  }
  return String(value)
    .trim()
    .replace(/\.0+$/, '');
}

function cellQty(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee Excel de entrada de inventario.
 * Columnas (con encabezado en fila 1, se ignora): CODPROD, DESPROD, TOTALUNIDADES.
 * También acepta posición fija: col1=CODPROD, col2=DESPROD, col3=TOTALUNIDADES.
 * Filas con error se omiten (no detienen la importación).
 * @param {Buffer} buffer
 * @returns {{
 *   rows: Array<{ CODPROD: string, DESPROD: string, TOTALUNIDADES: number, excelRow: number }>,
 *   skipped: string[]
 * }}
 */
function parseEntradaInventarioExcel(buffer) {
  if (!buffer || !buffer.length) {
    const err = new Error('Archivo Excel vacío');
    err.statusCode = 400;
    throw err;
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error('El archivo Excel no contiene hojas');
    err.statusCode = 400;
    throw err;
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  });

  if (!matrix.length) {
    const err = new Error('El archivo Excel no tiene datos');
    err.statusCode = 400;
    throw err;
  }

  // Fila 1 = encabezado (no se toma en cuenta)
  const dataRows = matrix.slice(1);
  const rows = [];
  const skipped = [];

  dataRows.forEach((raw, idx) => {
    const excelRow = idx + 2; // 1-based, +1 por encabezado
    const cols = Array.isArray(raw) ? raw : [];
    const codprod = cellCodprod(cols[0]);
    const desprod = cellText(cols[1]);
    const totalUnidades = cellQty(cols[2]);

    if (!codprod && (totalUnidades === null || totalUnidades === 0) && !desprod) {
      return;
    }
    if (!codprod) {
      skipped.push(`Fila ${excelRow}: falta CODPROD`);
      return;
    }
    if (totalUnidades === null) {
      skipped.push(`Fila ${excelRow} (${codprod}): TOTALUNIDADES inválido`);
      return;
    }
    if (totalUnidades <= 0) {
      skipped.push(`Fila ${excelRow} (${codprod}): TOTALUNIDADES debe ser mayor a cero`);
      return;
    }

    rows.push({
      CODPROD: codprod,
      DESPROD: desprod,
      TOTALUNIDADES: totalUnidades,
      excelRow,
    });
  });

  if (!rows.length) {
    const err = new Error(
      skipped.length
        ? 'No hay filas válidas para importar (todas se omitieron por errores)'
        : 'No hay filas de productos en el Excel (después del encabezado)'
    );
    err.statusCode = 400;
    err.details = skipped;
    throw err;
  }

  if (rows.length > 5000) {
    const err = new Error('El Excel supera el máximo de 5000 líneas');
    err.statusCode = 400;
    throw err;
  }

  return { rows, skipped };
}

module.exports = {
  parseEntradaInventarioExcel,
};
