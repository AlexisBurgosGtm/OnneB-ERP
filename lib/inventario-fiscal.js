const sql = require('mssql');
const ExcelJS = require('exceljs');
const { STATUS_ANULADO } = require('./documento-status');
const {
  normalizeExportCellValue,
  applyExcelDateFormats,
} = require('./excel-export');
const { sendLibroXlsx, safeFilenamePart, mesLabel } = require('./libro-contable-utils');
const { getIvaFactor, desgloseIvaDeMonto } = require('./impuestos');

const SQL_TIPODOC = `UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, ''))))`;
const SQL_SIGNO = `CASE
  WHEN ${SQL_TIPODOC} IN ('FEF', 'FEC', 'FES') THEN -1
  WHEN ${SQL_TIPODOC} IN ('FNC', 'FNA') THEN 1
  WHEN ${SQL_TIPODOC} IN ('COM', 'COP') THEN 1
  ELSE ISNULL(l.TIPOM, ISNULL(t.TIPOM, 0))
END`;
const SQL_DOC_FISCAL = `CASE
  WHEN ${SQL_TIPODOC} IN ('COM', 'COP') THEN
    CONCAT(
      LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))),
      CASE
        WHEN LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) = '' THEN ''
        ELSE '-' + LTRIM(RTRIM(d.NOFAC))
      END
    )
  ELSE
    CONCAT(
      LTRIM(RTRIM(ISNULL(d.FEL_SERIE, ''))),
      CASE
        WHEN LTRIM(RTRIM(ISNULL(d.FEL_NUMERO, ''))) = '' THEN ''
        ELSE '-' + LTRIM(RTRIM(CAST(d.FEL_NUMERO AS VARCHAR(40))))
      END
    )
END`;

const SQL_FROM_MOV = `
  FROM dbo.DOCPRODUCTOS l
  INNER JOIN dbo.DOCUMENTOS d
    ON d.EMPNIT = l.EMPNIT
   AND d.CODDOC = l.CODDOC
   AND d.CORRELATIVO = l.CORRELATIVO
  INNER JOIN dbo.TIPODOCUMENTOS t
    ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
  WHERE l.EMPNIT = @EMPNIT
    AND ISNULL(t.CONTABLE, 'NO') = 'SI'
    AND UPPER(LTRIM(RTRIM(ISNULL(d.STATUS, '')))) <> '${STATUS_ANULADO}'
    AND ISNULL(l.TIPOPROD, 'P') <> 'S'
`;

function parsePeriod({ mes, anio }) {
  const m = Number(mes);
  const a = Number(anio);
  if (!Number.isFinite(m) || m < 1 || m > 12) {
    const err = new Error('Mes inválido (1-12)');
    err.statusCode = 400;
    throw err;
  }
  if (!Number.isFinite(a) || a < 2000 || a > 2100) {
    const err = new Error('Año inválido');
    err.statusCode = 400;
    throw err;
  }
  return { mes: m, anio: a };
}

function requireEmpnit(empnit) {
  const emp = String(empnit || '').trim();
  if (!emp) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }
  return emp;
}

function bindPeriod(request, empnit, mes, anio) {
  request.timeout = 120000;
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('MES', sql.Int, mes);
  request.input('ANIO', sql.Int, anio);
}

function applyCostosSinIva(rows, ivaFactor) {
  return (rows || []).map((row) => {
    const costo = Number(row.COSTO) || 0;
    const totalCosto = Number(row.TOTALCOSTO) || 0;
    return {
      ...row,
      COSTO_SIN_IVA: desgloseIvaDeMonto(costo, ivaFactor).base,
      TOTALCOSTO_SIN_IVA: desgloseIvaDeMonto(totalCosto, ivaFactor).base,
    };
  });
}

/**
 * Inventario fiscal: saldo por producto acumulado hasta mes/año,
 * solo con documentos cuyo TIPODOCUMENTOS.CONTABLE = 'SI'.
 *
 * Signo del movimiento (solo para este reporte; no afecta stock real):
 * - FEF, FEC, FES → salida (−1), aunque TIPOM = 0
 * - FNC, FNA → entrada (+1), aunque TIPOM = 0
 * - COM, COP → entrada (+1), aunque TIPOM = 0
 * - resto → TOTALUNIDADES × TIPOM (línea o tipo de documento)
 */
async function listInventarioFiscal(pool, { empnit, mes, anio, q = '', limit = 500, unfiltered = false } = {}) {
  const emp = requireEmpnit(empnit);
  const period = parsePeriod({ mes, anio });

  const qTrim = unfiltered ? '' : String(q || '').trim();
  const qLike = qTrim ? `%${qTrim}%` : null;
  let lim = Number(limit);
  if (!Number.isFinite(lim) || lim <= 0) lim = 500;
  lim = Math.min(Math.max(Math.floor(lim), 1), 5000);
  const topSql = unfiltered ? '' : 'TOP (@limit)';

  const request = pool.request();
  bindPeriod(request, emp, period.mes, period.anio);
  request.input('q', sql.NVarChar, qTrim || null);
  request.input('qLike', sql.NVarChar, qLike);
  if (!unfiltered) request.input('limit', sql.Int, lim);

  const result = await request.query(`
    SELECT ${topSql}
      p.CODPROD,
      p.DESPROD,
      ISNULL(m.DESMARCA, '') AS DESMARCA,
      ISNULL(p.TIPOPROD, 'P') AS TIPOPROD,
      ISNULL(p.COSTO, 0) AS COSTO,
      ISNULL(p.HABILITADO, 'SI') AS HABILITADO,
      ISNULL(inv.INICIAL, 0) AS INICIAL,
      ISNULL(inv.COMPRAS, 0) AS COMPRAS,
      ISNULL(inv.VENTAS, 0) AS VENTAS,
      ISNULL(inv.SALDO, 0) AS SALDO,
      CAST(ISNULL(p.COSTO, 0) * ISNULL(inv.SALDO, 0) AS DECIMAL(18, 4)) AS TOTALCOSTO
    FROM dbo.PRODUCTOS p
    LEFT JOIN dbo.MARCAS m
      ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
    LEFT JOIN (
      SELECT
        l.CODPROD,
        SUM(
          CASE
            WHEN d.ANIO < @ANIO OR (d.ANIO = @ANIO AND d.MES < @MES)
            THEN ISNULL(l.TOTALUNIDADES, 0) * (${SQL_SIGNO})
            ELSE 0
          END
        ) AS INICIAL,
        SUM(
          CASE
            WHEN d.ANIO = @ANIO AND d.MES = @MES AND ${SQL_TIPODOC} IN ('COM', 'COP')
            THEN ISNULL(l.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) AS COMPRAS,
        SUM(
          CASE
            WHEN d.ANIO = @ANIO AND d.MES = @MES AND ${SQL_TIPODOC} IN ('FEF', 'FEC', 'FES')
            THEN ISNULL(l.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) - SUM(
          CASE
            WHEN d.ANIO = @ANIO AND d.MES = @MES AND ${SQL_TIPODOC} IN ('FNC', 'FNA')
            THEN ISNULL(l.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) AS VENTAS,
        SUM(
          CASE
            WHEN d.ANIO < @ANIO OR (d.ANIO = @ANIO AND d.MES <= @MES)
            THEN ISNULL(l.TOTALUNIDADES, 0) * (${SQL_SIGNO})
            ELSE 0
          END
        ) AS SALDO
      ${SQL_FROM_MOV}
      GROUP BY l.CODPROD
    ) inv ON inv.CODPROD = p.CODPROD
    WHERE p.EMPNIT = @EMPNIT
      AND ISNULL(p.TIPOPROD, 'P') <> 'S'
      AND (
        @q IS NULL OR @q = ''
        OR p.CODPROD LIKE @qLike
        OR p.DESPROD LIKE @qLike
        OR m.DESMARCA LIKE @qLike
      )
      AND (
        ISNULL(inv.INICIAL, 0) <> 0
        OR ISNULL(inv.COMPRAS, 0) <> 0
        OR ISNULL(inv.VENTAS, 0) <> 0
        OR ISNULL(inv.SALDO, 0) <> 0
      )
    ORDER BY p.DESPROD, p.CODPROD
  `);

  const rows = applyCostosSinIva(result.recordset || [], await getIvaFactor(pool));
  const totals = rows.reduce(
    (acc, row) => {
      acc.INICIAL += Number(row.INICIAL) || 0;
      acc.COMPRAS += Number(row.COMPRAS) || 0;
      acc.VENTAS += Number(row.VENTAS) || 0;
      acc.SALDO += Number(row.SALDO) || 0;
      acc.TOTALCOSTO += Number(row.TOTALCOSTO) || 0;
      acc.TOTALCOSTO_SIN_IVA += Number(row.TOTALCOSTO_SIN_IVA) || 0;
      return acc;
    },
    { INICIAL: 0, COMPRAS: 0, VENTAS: 0, SALDO: 0, TOTALCOSTO: 0, TOTALCOSTO_SIN_IVA: 0 }
  );

  return {
    rows,
    total: rows.length,
    truncated: unfiltered ? false : rows.length >= lim,
    totals,
    mes: period.mes,
    anio: period.anio,
  };
}

async function listMovimientosFiscal(pool, { empnit, mes, anio, codprod } = {}) {
  const emp = requireEmpnit(empnit);
  const period = parsePeriod({ mes, anio });
  const codigo = String(codprod || '').trim();
  if (!codigo) {
    const err = new Error('CODPROD requerido');
    err.statusCode = 400;
    throw err;
  }

  const request = pool.request();
  bindPeriod(request, emp, period.mes, period.anio);
  request.input('CODPROD', sql.VarChar, codigo);

  const prod = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .input('CODPROD', sql.VarChar, codigo)
    .query(`
      SELECT TOP 1 p.CODPROD, p.DESPROD, ISNULL(m.DESMARCA, '') AS DESMARCA
      FROM dbo.PRODUCTOS p
      LEFT JOIN dbo.MARCAS m ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
      WHERE p.EMPNIT = @EMPNIT AND p.CODPROD = @CODPROD
    `);

  const result = await request.query(`
    SELECT
      d.FECHA,
      d.CODDOC,
      d.CORRELATIVO,
      ${SQL_TIPODOC} AS TIPODOC,
      ${SQL_DOC_FISCAL} AS DOC_FISCAL,
      ISNULL(l.CANTIDAD, 0) AS CANTIDAD,
      ISNULL(l.TOTALUNIDADES, 0) AS TOTALUNIDADES,
      ISNULL(l.TOTALCOSTO, 0) AS TOTALCOSTO,
      ISNULL(l.TOTALPRECIO, 0) AS TOTALPRECIO
    ${SQL_FROM_MOV}
      AND l.CODPROD = @CODPROD
      AND d.ANIO = @ANIO
      AND d.MES = @MES
    ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO
  `);

  return {
    producto: prod.recordset[0] || { CODPROD: codigo, DESPROD: '', DESMARCA: '' },
    rows: result.recordset || [],
    mes: period.mes,
    anio: period.anio,
  };
}

async function listMovimientosFiscalMes(pool, { empnit, mes, anio } = {}) {
  const emp = requireEmpnit(empnit);
  const period = parsePeriod({ mes, anio });
  const request = pool.request();
  bindPeriod(request, emp, period.mes, period.anio);
  const result = await request.query(`
    SELECT
      l.CODPROD,
      ISNULL(p.DESPROD, '') AS DESPROD,
      d.FECHA,
      d.CODDOC,
      d.CORRELATIVO,
      ${SQL_TIPODOC} AS TIPODOC,
      ${SQL_DOC_FISCAL} AS DOC_FISCAL,
      ISNULL(l.CANTIDAD, 0) AS CANTIDAD,
      ISNULL(l.TOTALUNIDADES, 0) AS TOTALUNIDADES,
      ISNULL(l.TOTALCOSTO, 0) AS TOTALCOSTO,
      ISNULL(l.TOTALPRECIO, 0) AS TOTALPRECIO
    FROM dbo.DOCPRODUCTOS l
    INNER JOIN dbo.DOCUMENTOS d
      ON d.EMPNIT = l.EMPNIT
     AND d.CODDOC = l.CODDOC
     AND d.CORRELATIVO = l.CORRELATIVO
    INNER JOIN dbo.TIPODOCUMENTOS t
      ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    LEFT JOIN dbo.PRODUCTOS p
      ON p.EMPNIT = l.EMPNIT AND p.CODPROD = l.CODPROD
    WHERE l.EMPNIT = @EMPNIT
      AND ISNULL(t.CONTABLE, 'NO') = 'SI'
      AND UPPER(LTRIM(RTRIM(ISNULL(d.STATUS, '')))) <> '${STATUS_ANULADO}'
      AND ISNULL(l.TIPOPROD, 'P') <> 'S'
      AND d.ANIO = @ANIO
      AND d.MES = @MES
    ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO, l.CODPROD
  `);
  return result.recordset || [];
}

async function buildInventarioFiscalXlsx(data, { empnit, mes, anio, movimientos = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  const periodText = `${mesLabel(mes)} ${anio} · ${empnit || ''}`;

  const summaryCols = [
    { header: 'Código', key: 'CODPROD', width: 16 },
    { header: 'Descripción', key: 'DESPROD', width: 36 },
    { header: 'Marca', key: 'DESMARCA', width: 18 },
    { header: 'Tipo', key: 'TIPOPROD', width: 8 },
    { header: 'Inicial', key: 'INICIAL', width: 14, type: 'qty' },
    { header: 'Compras', key: 'COMPRAS', width: 14, type: 'qty' },
    { header: 'Ventas', key: 'VENTAS', width: 14, type: 'qty' },
    { header: 'Saldo fiscal', key: 'SALDO', width: 14, type: 'qty' },
    { header: 'Costo', key: 'COSTO', width: 14, type: 'money' },
    { header: 'Costo sin IVA', key: 'COSTO_SIN_IVA', width: 16, type: 'money' },
    { header: 'Total costo', key: 'TOTALCOSTO', width: 16, type: 'money' },
    { header: 'Total costo sin IVA', key: 'TOTALCOSTO_SIN_IVA', width: 18, type: 'money' },
  ];
  const sheet = workbook.addWorksheet('Inventario fiscal');
  sheet.mergeCells(1, 1, 1, summaryCols.length);
  sheet.getCell(1, 1).value = 'Inventario fiscal';
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, summaryCols.length);
  sheet.getCell(2, 1).value = periodText;
  sheet.columns = summaryCols.map((c) => ({ key: c.key, width: c.width }));
  const headerRow = sheet.getRow(4);
  summaryCols.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header;
    headerRow.getCell(i + 1).font = { bold: true };
  });
  (data.rows || []).forEach((row) => {
    const excelRow = {};
    summaryCols.forEach((c) => {
      excelRow[c.key] = normalizeExportCellValue(c, row[c.key]);
    });
    sheet.addRow(excelRow);
  });
  if (data.totals) {
    const tr = sheet.addRow({
      CODPROD: '',
      DESPROD: 'Totales',
      DESMARCA: '',
      TIPOPROD: '',
      INICIAL: data.totals.INICIAL,
      COMPRAS: data.totals.COMPRAS,
      VENTAS: data.totals.VENTAS,
      SALDO: data.totals.SALDO,
      COSTO: '',
      COSTO_SIN_IVA: '',
      TOTALCOSTO: data.totals.TOTALCOSTO,
      TOTALCOSTO_SIN_IVA: data.totals.TOTALCOSTO_SIN_IVA,
    });
    tr.font = { bold: true };
  }
  summaryCols.forEach((c, i) => {
    if (c.type === 'money') sheet.getColumn(i + 1).numFmt = '#,##0.00';
    if (c.type === 'qty') sheet.getColumn(i + 1).numFmt = '#,##0.000';
  });
  applyExcelDateFormats(sheet, summaryCols, { headerRow: 4 });

  const movCols = [
    { header: 'Código', key: 'CODPROD', width: 16 },
    { header: 'Descripción', key: 'DESPROD', width: 36 },
    { header: 'Fecha', key: 'FECHA', width: 12, type: 'date' },
    { header: 'Doc. interno', key: 'DOC_INTERNO', width: 18 },
    { header: 'Doc. fiscal', key: 'DOC_FISCAL', width: 18 },
    { header: 'Tipo', key: 'TIPODOC', width: 10 },
    { header: 'Cantidad', key: 'CANTIDAD', width: 12, type: 'qty' },
    { header: 'Unidades', key: 'TOTALUNIDADES', width: 12, type: 'qty' },
    { header: 'Costo', key: 'TOTALCOSTO', width: 14, type: 'money' },
    { header: 'Precio', key: 'TOTALPRECIO', width: 14, type: 'money' },
  ];
  const movSheet = workbook.addWorksheet('Movimientos');
  movSheet.mergeCells(1, 1, 1, movCols.length);
  movSheet.getCell(1, 1).value = 'Movimientos fiscales del mes';
  movSheet.getCell(1, 1).font = { bold: true, size: 14 };
  movSheet.mergeCells(2, 1, 2, movCols.length);
  movSheet.getCell(2, 1).value = periodText;
  movSheet.columns = movCols.map((c) => ({ key: c.key, width: c.width }));
  const movHeader = movSheet.getRow(4);
  movCols.forEach((c, i) => {
    movHeader.getCell(i + 1).value = c.header;
    movHeader.getCell(i + 1).font = { bold: true };
  });
  const movTotals = { CANTIDAD: 0, TOTALUNIDADES: 0, TOTALCOSTO: 0, TOTALPRECIO: 0 };
  (movimientos || []).forEach((row) => {
    movTotals.CANTIDAD += Number(row.CANTIDAD) || 0;
    movTotals.TOTALUNIDADES += Number(row.TOTALUNIDADES) || 0;
    movTotals.TOTALCOSTO += Number(row.TOTALCOSTO) || 0;
    movTotals.TOTALPRECIO += Number(row.TOTALPRECIO) || 0;
    movSheet.addRow({
      CODPROD: row.CODPROD,
      DESPROD: row.DESPROD,
      FECHA: normalizeExportCellValue({ type: 'date', key: 'FECHA' }, row.FECHA),
      DOC_INTERNO: `${row.CODDOC || ''}-${row.CORRELATIVO ?? ''}`,
      DOC_FISCAL: row.DOC_FISCAL || '',
      TIPODOC: row.TIPODOC || '',
      CANTIDAD: Number(row.CANTIDAD) || 0,
      TOTALUNIDADES: Number(row.TOTALUNIDADES) || 0,
      TOTALCOSTO: Number(row.TOTALCOSTO) || 0,
      TOTALPRECIO: Number(row.TOTALPRECIO) || 0,
    });
  });
  const movTotalRow = movSheet.addRow({
    CODPROD: '',
    DESPROD: 'Totales',
    FECHA: '',
    DOC_INTERNO: '',
    DOC_FISCAL: '',
    TIPODOC: '',
    CANTIDAD: movTotals.CANTIDAD,
    TOTALUNIDADES: movTotals.TOTALUNIDADES,
    TOTALCOSTO: movTotals.TOTALCOSTO,
    TOTALPRECIO: movTotals.TOTALPRECIO,
  });
  movTotalRow.font = { bold: true };
  movCols.forEach((c, i) => {
    if (c.type === 'money') movSheet.getColumn(i + 1).numFmt = '#,##0.00';
    if (c.type === 'qty') movSheet.getColumn(i + 1).numFmt = '#,##0.000';
  });
  applyExcelDateFormats(movSheet, movCols, { headerRow: 4 });

  return workbook.xlsx.writeBuffer();
}

module.exports = {
  listInventarioFiscal,
  listMovimientosFiscal,
  listMovimientosFiscalMes,
  buildInventarioFiscalXlsx,
  sendLibroXlsx,
  safeFilenamePart,
  mesLabel,
};
