const XLSX = require('xlsx');

const TIPODOC_COMPARE = ['FEF', 'FEC', 'FES', 'FNC', 'FNA'];

function normalizeKeyPart(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Evitar notación científica en números grandes del Excel
    return String(Math.trunc(value)).trim().toUpperCase();
  }
  return String(value)
    .trim()
    .replace(/\.0+$/, '')
    .toUpperCase();
}

function matchKey(serie, numero) {
  const s = normalizeKeyPart(serie);
  const n = normalizeKeyPart(numero);
  if (!s || !n) return null;
  return `${s}|${n}`;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function findColumn(headers, candidates) {
  const normalized = headers.map((h) => ({
    raw: h,
    key: String(h || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''),
  }));
  for (const cand of candidates) {
    const c = cand
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const found = normalized.find((h) => h.key === c || h.key.includes(c));
    if (found) return found.raw;
  }
  return null;
}

/**
 * Lee archivo SAT (xls/xlsx) y extrae filas con Serie + Número del DTE.
 * @param {Buffer} buffer
 */
function parseSatVentasExcel(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames.find((n) => /informaciondte|dte|fel|hoja/i.test(n)) || workbook.SheetNames[0];
  if (!sheetName) {
    const err = new Error('El archivo Excel no contiene hojas');
    err.statusCode = 400;
    throw err;
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  if (!rows.length) {
    const err = new Error('El archivo Excel no tiene datos');
    err.statusCode = 400;
    throw err;
  }

  const headers = Object.keys(rows[0] || {});
  const colSerie = findColumn(headers, ['Serie']);
  const colNumero = findColumn(headers, ['Número del DTE', 'Numero del DTE', 'Número DTE', 'Numero DTE']);
  const colTipo = findColumn(headers, ['Tipo de DTE (nombre)', 'Tipo de DTE', 'Tipo DTE']);
  const colTotal = findColumn(headers, ['Gran Total (Moneda Original)', 'Gran Total', 'Total']);
  const colIva = findColumn(headers, ['IVA (monto de este impuesto)', 'IVA']);
  const colFecha = findColumn(headers, ['Fecha de emisión', 'Fecha de emision', 'Fecha']);
  const colReceptor = findColumn(headers, ['Nombre completo del receptor', 'Receptor']);
  const colNitRec = findColumn(headers, ['ID del receptor', 'NIT del receptor']);
  const colAnulado = findColumn(headers, ['Marca de anulado', 'Anulado']);
  const colEstado = findColumn(headers, ['Estado']);
  const colAuth = findColumn(headers, ['Número de Autorización', 'Numero de Autorizacion', 'UUID']);

  if (!colSerie || !colNumero) {
    const err = new Error(
      'No se encontraron las columnas "Serie" y/o "Número del DTE" en el archivo SAT'
    );
    err.statusCode = 400;
    throw err;
  }

  const parsed = [];
  const seen = new Set();
  let skipped = 0;

  for (const row of rows) {
    const serie = row[colSerie];
    const numero = row[colNumero];
    const key = matchKey(serie, numero);
    if (!key) {
      skipped += 1;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({
      KEY: key,
      SERIE: normalizeKeyPart(serie),
      NUMERO: normalizeKeyPart(numero),
      TIPO: String(row[colTipo] ?? '').trim().toUpperCase() || null,
      TOTAL: roundMoney(toNumber(row[colTotal])),
      IVA: roundMoney(toNumber(row[colIva])),
      FECHA: row[colFecha] ? String(row[colFecha]).slice(0, 19) : null,
      RECEPTOR: row[colReceptor] ? String(row[colReceptor]).trim() : null,
      NIT_RECEPTOR: row[colNitRec] ? String(row[colNitRec]).trim() : null,
      ANULADO: String(row[colAnulado] ?? '').trim().toUpperCase() === 'SI',
      ESTADO: row[colEstado] ? String(row[colEstado]).trim() : null,
      AUTORIZACION: row[colAuth] ? String(row[colAuth]).trim() : null,
    });
  }

  return {
    sheetName,
    columns: { serie: colSerie, numero: colNumero, tipo: colTipo, total: colTotal },
    rows: parsed,
    totalExcel: rows.length,
    skipped,
  };
}

async function listDocsParaCompararSat(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        d.ID,
        d.CODDOC,
        d.CORRELATIVO,
        d.FEL_UUDI,
        d.FEL_SERIE,
        d.FEL_NUMERO,
        d.FEL_FECHA,
        d.FECHA,
        d.DOC_NIT,
        d.DOC_NOMCLIE,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.TOTALIVA, 0) AS TOTALIVA,
        d.STATUS,
        t.TIPODOC,
        t.DESDOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND t.TIPODOC IN ('FEF', 'FEC', 'FES', 'FNC', 'FNA')
      ORDER BY d.ID
    `);

  return result.recordset.map((row) => {
    const key = matchKey(row.FEL_SERIE, row.FEL_NUMERO);
    return {
      KEY: key,
      ID: row.ID,
      CODDOC: row.CODDOC,
      CORRELATIVO: row.CORRELATIVO,
      TIPODOC: String(row.TIPODOC || '').trim().toUpperCase(),
      DESDOC: row.DESDOC || null,
      FEL_UUDI: row.FEL_UUDI ? String(row.FEL_UUDI).trim() : null,
      FEL_SERIE: row.FEL_SERIE ? String(row.FEL_SERIE).trim() : null,
      FEL_NUMERO: row.FEL_NUMERO != null ? String(row.FEL_NUMERO).trim() : null,
      FEL_FECHA: row.FEL_FECHA || null,
      FECHA: row.FECHA || null,
      DOC_NIT: row.DOC_NIT || null,
      DOC_NOMCLIE: row.DOC_NOMCLIE || null,
      TOTALPRECIO: roundMoney(toNumber(row.TOTALPRECIO)),
      TOTALIVA: roundMoney(toNumber(row.TOTALIVA)),
      STATUS: String(row.STATUS || '').trim().toUpperCase(),
      ANULADO: String(row.STATUS || '').trim().toUpperCase() === 'A',
    };
  });
}

/**
 * Compara filas SAT vs documentos del sistema (mes/año).
 * Incluye diferencias de serie/número y discrepancias de monto (Gran Total vs TOTALPRECIO).
 */
async function compararSatConSistema(pool, sql, empnit, mes, anio, excelBuffer) {
  const sat = parseSatVentasExcel(excelBuffer);
  const docs = await listDocsParaCompararSat(pool, sql, empnit, mes, anio);
  const montoTol = 0.01;

  const satByKey = new Map(sat.rows.map((r) => [r.KEY, r]));
  const docByKey = new Map();
  const docsSinFel = [];

  for (const d of docs) {
    if (!d.KEY) {
      docsSinFel.push(d);
      continue;
    }
    if (!docByKey.has(d.KEY)) docByKey.set(d.KEY, d);
  }

  const enSatNoSistema = [];
  for (const [key, row] of satByKey) {
    if (!docByKey.has(key)) enSatNoSistema.push(row);
  }

  const enSistemaNoSat = [];
  for (const [key, row] of docByKey) {
    if (!satByKey.has(key)) enSistemaNoSat.push(row);
  }
  enSistemaNoSat.push(...docsSinFel);

  const discrepanciasMonto = [];
  for (const [key, satRow] of satByKey) {
    const doc = docByKey.get(key);
    if (!doc) continue;
    const totalSat = roundMoney(satRow.TOTAL);
    const totalSys = roundMoney(doc.TOTALPRECIO);
    const diferencia = roundMoney(totalSat - totalSys);
    if (Math.abs(diferencia) > montoTol) {
      discrepanciasMonto.push({
        KEY: key,
        SERIE: satRow.SERIE || doc.FEL_SERIE,
        NUMERO: satRow.NUMERO || doc.FEL_NUMERO,
        TIPO_SAT: satRow.TIPO,
        TIPODOC: doc.TIPODOC,
        DESDOC: doc.DESDOC,
        CODDOC: doc.CODDOC,
        CORRELATIVO: doc.CORRELATIVO,
        FEL_UUDI: doc.FEL_UUDI,
        DOC_NOMCLIE: doc.DOC_NOMCLIE || satRow.RECEPTOR,
        TOTAL_SAT: totalSat,
        TOTAL_SISTEMA: totalSys,
        DIFERENCIA: diferencia,
        STATUS: doc.STATUS,
        ANULADO: doc.ANULADO,
        FECHA: doc.FEL_FECHA || doc.FECHA || satRow.FECHA,
      });
    }
  }

  enSatNoSistema.sort(
    (a, b) => String(a.FECHA || '').localeCompare(String(b.FECHA || '')) || a.SERIE.localeCompare(b.SERIE)
  );
  enSistemaNoSat.sort(
    (a, b) =>
      String(a.FEL_FECHA || a.FECHA || '').localeCompare(String(b.FEL_FECHA || b.FECHA || '')) ||
      String(a.FEL_SERIE || '').localeCompare(String(b.FEL_SERIE || ''))
  );
  discrepanciasMonto.sort(
    (a, b) =>
      String(a.FECHA || '').localeCompare(String(b.FECHA || '')) ||
      String(a.SERIE || '').localeCompare(String(b.SERIE || ''))
  );

  const coincidentesClave = sat.rows.length - enSatNoSistema.length;

  return {
    mes,
    anio,
    tipodocs: TIPODOC_COMPARE,
    sat: {
      sheetName: sat.sheetName,
      columns: sat.columns,
      totalFilasArchivo: sat.totalExcel,
      totalConSerieNumero: sat.rows.length,
      skipped: sat.skipped,
    },
    sistema: {
      totalDocumentos: docs.length,
      conFel: docByKey.size,
      sinFel: docsSinFel.length,
    },
    coincidentes: coincidentesClave,
    coincidentesMontoOk: coincidentesClave - discrepanciasMonto.length,
    enSatNoSistema,
    enSistemaNoSat,
    discrepanciasMonto,
  };
}

module.exports = {
  TIPODOC_COMPARE,
  normalizeKeyPart,
  matchKey,
  parseSatVentasExcel,
  listDocsParaCompararSat,
  compararSatConSistema,
};
