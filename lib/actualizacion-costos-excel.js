const XLSX = require('xlsx');

function cellCodprod(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value)).trim();
  }
  return String(value)
    .trim()
    .replace(/\.0+$/, '');
}

function cellCosto(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function headerKey(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Lee Excel de actualización de costos.
 * Encabezados esperados: CODPROD, COSTO (fila 1).
 * También acepta columnas por posición: col1=CODPROD, col2=COSTO.
 * @param {Buffer} buffer
 * @returns {{
 *   rows: Array<{ CODPROD: string, COSTO: number, excelRow: number }>,
 *   skipped: string[]
 * }}
 */
function parseActualizacionCostosExcel(buffer) {
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

  const header = Array.isArray(matrix[0]) ? matrix[0] : [];
  let idxCod = 0;
  let idxCosto = 1;
  const h0 = headerKey(header[0]);
  const h1 = headerKey(header[1]);
  if (h0 === 'CODPROD' || h1 === 'COSTO') {
    idxCod = header.findIndex((c) => headerKey(c) === 'CODPROD');
    idxCosto = header.findIndex((c) => headerKey(c) === 'COSTO');
    if (idxCod < 0) idxCod = 0;
    if (idxCosto < 0) idxCosto = 1;
  }

  const dataRows = matrix.slice(1);
  const rows = [];
  const skipped = [];
  const seen = new Set();

  dataRows.forEach((raw, idx) => {
    const excelRow = idx + 2;
    const cols = Array.isArray(raw) ? raw : [];
    const codprod = cellCodprod(cols[idxCod]);
    const costo = cellCosto(cols[idxCosto]);

    if (!codprod && (costo == null || costo === 0)) return;
    if (!codprod) {
      skipped.push(`Fila ${excelRow}: sin CODPROD`);
      return;
    }
    if (costo == null || costo < 0) {
      skipped.push(`Fila ${excelRow} (${codprod}): COSTO inválido`);
      return;
    }
    const key = codprod.toUpperCase();
    if (seen.has(key)) {
      skipped.push(`Fila ${excelRow} (${codprod}): código duplicado en Excel (se conserva el primero)`);
      return;
    }
    seen.add(key);
    rows.push({ CODPROD: codprod, COSTO: costo, excelRow });
  });

  if (!rows.length) {
    const err = new Error('No se encontraron filas válidas con CODPROD y COSTO');
    err.statusCode = 400;
    throw err;
  }

  return { rows, skipped };
}

module.exports = {
  parseActualizacionCostosExcel,
};
