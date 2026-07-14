const { getIvaFactor, desgloseIvaIncluyente } = require('./impuestos');

const TIPODOC_VENTAS = ['FEF', 'FEC', 'FES'];
const TIPODOC_NOTAS_CREDITO = ['FNC'];
const TIPODOC_LIBRO_VENTAS = [...TIPODOC_VENTAS, ...TIPODOC_NOTAS_CREDITO];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function isAnulado(row) {
  return String(row?.STATUS ?? '').trim().toUpperCase() === 'A';
}

function isNotaCredito(row) {
  return String(row?.TIPODOC ?? '').trim().toUpperCase() === 'FNC';
}

function signForRow(row) {
  if (isAnulado(row)) return 0;
  return isNotaCredito(row) ? -1 : 1;
}

/**
 * Desglose SAT GT: base = total_gravado / 1.12 ; IVA = total_gravado - base.
 * El total de factura se asume con IVA incluido; TOTALEXENTO no forma parte de la base.
 */
function desgloseIvaLibro(row, ivaFactor) {
  return desgloseIvaIncluyente(toNumber(row.TOTALPRECIO), toNumber(row.TOTALEXENTO), ivaFactor);
}

function mapLibroVentasRow(row, index, ivaFactor) {
  const sign = signForRow(row);
  const { exento, gravable, iva, total } = desgloseIvaLibro(row, ivaFactor);

  return {
    LINEA: index + 1,
    CODDOC: row.CODDOC ?? null,
    CORRELATIVO: row.CORRELATIVO ?? null,
    TIPODOC: String(row.TIPODOC ?? '').trim().toUpperCase(),
    DESDOC: row.DESDOC ?? null,
    FEL_SERIE: row.FEL_SERIE ?? null,
    FEL_NUMERO: row.FEL_NUMERO ?? null,
    FEL_FECHA: row.FEL_FECHA ?? null,
    FECHA: row.FECHA ?? null,
    DOC_NIT: row.DOC_NIT ?? null,
    DOC_NOMCLIE: row.DOC_NOMCLIE ?? null,
    TOTALEXENTO: roundMoney(exento * sign),
    TOTALSINIVA: roundMoney(gravable * sign),
    TOTALIVA: roundMoney(iva * sign),
    TOTALPRECIO: roundMoney(total * sign),
    STATUS: String(row.STATUS ?? '').trim().toUpperCase(),
    ANULADO: isAnulado(row),
    ES_NOTA_CREDITO: isNotaCredito(row),
  };
}

function summarizeRows(rows) {
  const totals = {
    exento: 0,
    gravado: 0,
    iva: 0,
    total: 0,
    documentos: rows.length,
    anulados: 0,
    ventas: 0,
    notasCredito: 0,
  };

  rows.forEach((r) => {
    if (r.ANULADO) {
      totals.anulados += 1;
      return;
    }
    if (r.ES_NOTA_CREDITO) totals.notasCredito += 1;
    else totals.ventas += 1;
    totals.exento = roundMoney(totals.exento + toNumber(r.TOTALEXENTO));
    totals.gravado = roundMoney(totals.gravado + toNumber(r.TOTALSINIVA));
    totals.iva = roundMoney(totals.iva + toNumber(r.TOTALIVA));
    totals.total = roundMoney(totals.total + toNumber(r.TOTALPRECIO));
  });

  return totals;
}

async function listLibroVentas(pool, sql, empnit, mes, anio) {
  const ivaFactor = await getIvaFactor(pool);
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
        d.FEL_SERIE,
        d.FEL_NUMERO,
        d.FEL_FECHA,
        d.FECHA,
        d.DOC_NIT,
        d.DOC_NOMCLIE,
        ISNULL(d.TOTALEXENTO, 0) AS TOTALEXENTO,
        ISNULL(d.TOTALSINIVA, 0) AS TOTALSINIVA,
        ISNULL(d.TOTALIVA, 0) AS TOTALIVA,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        d.STATUS,
        t.TIPODOC,
        t.DESDOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND ISNULL(t.CONTABLE, 'NO') = 'SI'
        AND t.TIPODOC IN ('FEF', 'FEC', 'FES', 'FNC')
      ORDER BY
        CASE
          WHEN d.FEL_FECHA IS NOT NULL AND LTRIM(RTRIM(d.FEL_FECHA)) <> '' THEN d.FEL_FECHA
          ELSE CONVERT(VARCHAR(30), d.FECHA, 126)
        END,
        ISNULL(d.FEL_SERIE, d.CODDOC),
        ISNULL(d.FEL_NUMERO, CAST(d.CORRELATIVO AS VARCHAR(30))),
        d.ID
    `);

  const rows = result.recordset.map((row, index) => mapLibroVentasRow(row, index, ivaFactor));
  return {
    rows,
    totals: summarizeRows(rows),
    mes,
    anio,
    ivaFactor: roundMoney(ivaFactor),
  };
}

module.exports = {
  TIPODOC_VENTAS,
  TIPODOC_NOTAS_CREDITO,
  TIPODOC_LIBRO_VENTAS,
  listLibroVentas,
  summarizeRows,
  desgloseIvaLibro,
};
