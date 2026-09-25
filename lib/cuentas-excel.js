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

const MESES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function buildSaldoMesesExcelRows(data) {
  const rows = (data?.rows || []).map((r) => ({
    CODIGO: r.CODCLIENTE ?? '',
    NOMBRE: r.CLIENTE ?? '',
    NEGOCIO: r.NEGOCIO ?? '',
    NIT: r.NIT ?? '',
    SALDO_ANTERIOR: Number(r.SALDO_ANTERIOR) || 0,
    CREDITOS: Number(r.CREDITOS) || 0,
    ABONOS: Number(r.ABONOS) || 0,
    SALDO_ACTUAL: Number(r.SALDO_ACTUAL) || 0,
  }));
  const t = data?.totales || {};
  if (rows.length) {
    rows.push({
      CODIGO: '',
      NOMBRE: `Total (${Number(t.count) || rows.length})`,
      NEGOCIO: '',
      NIT: '',
      SALDO_ANTERIOR: Number(t.saldoAnterior) || 0,
      CREDITOS: Number(t.creditos) || 0,
      ABONOS: Number(t.abonos) || 0,
      SALDO_ACTUAL: Number(t.saldoActual) || 0,
    });
  }
  return rows;
}

function saldoMesesSheetLabel(mes, anio) {
  const m = Number(mes);
  const y = Number(anio);
  const name = MESES_ES[m - 1] || `Mes ${m}`;
  return `Saldo ${name} ${y}`.slice(0, 31);
}

function saldoMesesFilename(prefix, mes, anio, empnit) {
  const safeEmp = String(empnit || '').replace(/[^\w-]+/g, '_');
  const mm = String(Number(mes) || 0).padStart(2, '0');
  const yy = Number(anio) || 0;
  return `${prefix}_saldo_meses_${yy}-${mm}_${safeEmp}.xlsx`;
}

async function sendCuentasSaldoMesesExcel(res, { filename, sheetName, columns, data }) {
  await sendCuentasListaExcel(res, {
    filename,
    sheetName,
    columns,
    rows: buildSaldoMesesExcelRows(data),
  });
}

module.exports = {
  sendCuentasListaExcel,
  sendCuentasSaldoMesesExcel,
  buildSaldoMesesExcelRows,
  saldoMesesSheetLabel,
  saldoMesesFilename,
  wantsVencidas,
  wantsXlsx,
  SQL_SOLO_VENCIDAS,
};
