/**
 * Excel de la lista de cuentas por cobrar / pagar.
 */
const ExcelJS = require('exceljs');
const { applyExcelDateFormats, excelDateCellValue, normalizeExportCellValue } = require('./excel-export');

async function sendCuentasListaExcel(res, { filename, sheetName, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName || 'Lista');
  sheet.columns = columns.map((col) => ({
    header: col.header,
    key: col.key,
    width: col.width || 16,
  }));
  (rows || []).forEach((row) => {
    const out = {};
    columns.forEach((col) => {
      const raw = row?.[col.key];
      if (col.type === 'date') out[col.key] = excelDateCellValue(raw);
      else if (col.type === 'number') out[col.key] = Number(raw) || 0;
      else out[col.key] = normalizeExportCellValue(col, raw);
    });
    sheet.addRow(out);
  });
  sheet.getRow(1).font = { bold: true };
  applyExcelDateFormats(sheet, columns);
  const buffer = await workbook.xlsx.writeBuffer();
  const safe = String(filename || 'cuentas.xlsx').replace(/[^\w.\-]+/g, '_');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
  res.send(Buffer.from(buffer));
}

function wantsVencidas(query) {
  return ['1', 'si', 'true', 'vencidas'].includes(String(query?.vencidas || '').trim().toLowerCase());
}

function wantsXlsx(query) {
  return String(query?.format || '').trim().toLowerCase() === 'xlsx';
}

const SQL_SOLO_VENCIDAS = `
  AND d.VENCIMIENTO IS NOT NULL
  AND CAST(d.VENCIMIENTO AS date) < CAST(GETDATE() AS date)
`;

module.exports = {
  sendCuentasListaExcel,
  wantsVencidas,
  wantsXlsx,
  SQL_SOLO_VENCIDAS,
};
