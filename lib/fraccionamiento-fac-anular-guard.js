const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');
const { TIPODOC_FISCAL_FRAC } = require('./fraccionamiento-reopen');

function tipodocSqlIn(list) {
  return list.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
}

/**
 * Documentos fiscales (FEF/FEC/…) ligados a una FAC por SERIEFAC + NOFAC, no anulados.
 */
async function listFraccionadasActivas(pool, empnit, facCoddoc, facCorrelativo) {
  const serieFac = String(facCoddoc || '').trim();
  const corr = Number(facCorrelativo);
  if (!serieFac || !Number.isFinite(corr)) return [];

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('SERIEFAC', sql.VarChar, serieFac)
    .input('CORR_SRC', sql.Decimal(18, 0), corr)
    .query(`
      SELECT d.CODDOC, d.CORRELATIVO, t.TIPODOC, d.FEL_UUDI, d.STATUS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${tipodocSqlIn(TIPODOC_FISCAL_FRAC)})
        AND LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) = @SERIEFAC
        AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORR_SRC
        AND UPPER(LTRIM(RTRIM(ISNULL(d.STATUS, '')))) <> '${STATUS_ANULADO}'
      ORDER BY d.CODDOC, d.CORRELATIVO
    `);
  return result.recordset || [];
}

function formatFraccionadasList(rows, maxItems = 8) {
  if (!rows?.length) return '';
  const parts = rows.slice(0, maxItems).map((r) => `${String(r.CODDOC || '').trim()} #${r.CORRELATIVO}`);
  if (rows.length > maxItems) {
    parts.push(`y ${rows.length - maxItems} más`);
  }
  return parts.join(', ');
}

async function assertFacSinFraccionadasParaAnular(pool, empnit, facCoddoc, facCorrelativo) {
  const rows = await listFraccionadasActivas(pool, empnit, facCoddoc, facCorrelativo);
  if (!rows.length) {
    return { ok: true, count: 0, fraccionadas: [] };
  }
  const serieFac = String(facCoddoc || '').trim();
  const corr = Number(facCorrelativo);
  const lista = formatFraccionadasList(rows);
  const err = new Error(
    `No se puede anular la factura ${serieFac} #${corr}: tiene facturas fraccionadas generadas (${lista}). Anule primero esos documentos fiscales.`
  );
  err.statusCode = 409;
  err.code = 'FAC_TIENE_FRACCIONADAS';
  err.fraccionadas = rows;
  throw err;
}

module.exports = {
  listFraccionadasActivas,
  assertFacSinFraccionadasParaAnular,
  formatFraccionadasList,
};
