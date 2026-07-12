const TIPODOC_COMPRAS = ['COM', 'COP'];
const TIPODOC_NOTAS_CREDITO = ['DVP'];
const TIPODOC_LIBRO_COMPRAS = [...TIPODOC_COMPRAS, ...TIPODOC_NOTAS_CREDITO];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function strVal(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function isAnulado(row) {
  return String(row?.STATUS ?? '').trim().toUpperCase() === 'A';
}

function isNotaCredito(row) {
  return String(row?.TIPODOC ?? '').trim().toUpperCase() === 'DVP';
}

function signForRow(row) {
  if (isAnulado(row)) return 0;
  return isNotaCredito(row) ? -1 : 1;
}

function resolveSerie(row) {
  return strVal(row.FEL_SERIE) || strVal(row.SERIEFAC) || strVal(row.CODDOC);
}

function resolveNumero(row) {
  return strVal(row.FEL_NUMERO) || strVal(row.NOFAC) || (row.CORRELATIVO != null ? String(row.CORRELATIVO) : null);
}

function resolveTotal(row) {
  const costo = toNumber(row.TOTALCOSTO);
  const precio = toNumber(row.TOTALPRECIO);
  return costo !== 0 ? costo : precio;
}

function mapLibroComprasRow(row, index) {
  const sign = signForRow(row);
  const exento = roundMoney(toNumber(row.TOTALEXENTO) * sign);
  const gravado = roundMoney(toNumber(row.TOTALSINIVA) * sign);
  const iva = roundMoney(toNumber(row.TOTALIVA) * sign);
  const total = roundMoney(resolveTotal(row) * sign);

  return {
    LINEA: index + 1,
    CODDOC: row.CODDOC ?? null,
    CORRELATIVO: row.CORRELATIVO ?? null,
    TIPODOC: String(row.TIPODOC ?? '').trim().toUpperCase(),
    DESDOC: row.DESDOC ?? null,
    FEL_SERIE: resolveSerie(row),
    FEL_NUMERO: resolveNumero(row),
    FEL_FECHA: row.FEL_FECHA ?? null,
    FECHA: row.FECHA ?? null,
    DOC_NIT: row.DOC_NIT ?? null,
    DOC_NOMCLIE: row.DOC_NOMCLIE ?? null,
    TOTALEXENTO: exento,
    TOTALSINIVA: gravado,
    TOTALIVA: iva,
    TOTAL: total,
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
    compras: 0,
    notasCredito: 0,
  };

  rows.forEach((r) => {
    if (r.ANULADO) {
      totals.anulados += 1;
      return;
    }
    if (r.ES_NOTA_CREDITO) totals.notasCredito += 1;
    else totals.compras += 1;
    totals.exento = roundMoney(totals.exento + toNumber(r.TOTALEXENTO));
    totals.gravado = roundMoney(totals.gravado + toNumber(r.TOTALSINIVA));
    totals.iva = roundMoney(totals.iva + toNumber(r.TOTALIVA));
    totals.total = roundMoney(totals.total + toNumber(r.TOTAL));
  });

  return totals;
}

async function listLibroCompras(pool, sql, empnit, mes, anio) {
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
        d.SERIEFAC,
        d.NOFAC,
        d.FECHA,
        d.DOC_NIT,
        d.DOC_NOMCLIE,
        ISNULL(d.TOTALEXENTO, 0) AS TOTALEXENTO,
        ISNULL(d.TOTALSINIVA, 0) AS TOTALSINIVA,
        ISNULL(d.TOTALIVA, 0) AS TOTALIVA,
        ISNULL(d.TOTALCOSTO, 0) AS TOTALCOSTO,
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
        AND t.TIPODOC IN ('COM', 'COP', 'DVP')
      ORDER BY
        CASE
          WHEN d.FEL_FECHA IS NOT NULL AND LTRIM(RTRIM(d.FEL_FECHA)) <> '' THEN d.FEL_FECHA
          ELSE CONVERT(VARCHAR(30), d.FECHA, 126)
        END,
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_SERIE)), ''), ISNULL(d.SERIEFAC, d.CODDOC)),
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_NUMERO)), ''), ISNULL(d.NOFAC, CAST(d.CORRELATIVO AS VARCHAR(30)))),
        d.ID
    `);

  const rows = result.recordset.map((row, index) => mapLibroComprasRow(row, index));
  return {
    rows,
    totals: summarizeRows(rows),
    mes,
    anio,
  };
}

module.exports = {
  TIPODOC_COMPRAS,
  TIPODOC_NOTAS_CREDITO,
  TIPODOC_LIBRO_COMPRAS,
  listLibroCompras,
  summarizeRows,
};
