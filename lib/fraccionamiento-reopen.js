/**
 * Reabre FAC fuente de fraccionamiento cuando se anula una FEL/DTE hija
 * (SERIEFAC/NOFAC → FAC con CODEMBARQUE = FRACCIONADA y restante > 0).
 */
const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');

const TIPODOC_FISCAL_FRAC = ['FEF', 'FEC', 'FES', 'FEL'];
const CODEMBARQUE_FRACCIONADA = 'FRACCIONADA';

function tipodocSqlIn(list) {
  return list.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
}

function parseFuenteFromFiscal(header) {
  const seriefac = String(header?.SERIEFAC || header?.seriefac || '').trim();
  const nofacRaw = String(header?.NOFAC ?? header?.nofac ?? '').trim();
  const nofac = Number(nofacRaw);
  if (!seriefac || !Number.isFinite(nofac)) return null;
  return { coddoc: seriefac, correlativo: nofac };
}

/**
 * ¿Queda cantidad pendiente por fraccionar en la FAC fuente?
 * (mismas reglas de exclusión: fiscales no anulados ligados por SERIEFAC/NOFAC)
 */
async function fuenteTieneRestante(poolOrTx, empnit, srcCoddoc, srcCorrelativo) {
  const request =
    poolOrTx?.request && typeof poolOrTx.request === 'function'
      ? poolOrTx.request()
      : new sql.Request(poolOrTx);
  const res = await request
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, srcCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), srcCorrelativo)
    .input('SERIEFAC', sql.VarChar, srcCoddoc)
    .input('CORR_SRC', sql.Decimal(18, 0), srcCorrelativo)
    .query(`
      SELECT
        ISNULL((
          SELECT SUM(ISNULL(l.CANTIDAD, 0))
          FROM dbo.DOCPRODUCTOS l
          WHERE l.EMPNIT = @EMPNIT AND l.CODDOC = @CODDOC AND l.CORRELATIVO = @CORRELATIVO
        ), 0) AS ORIGEN,
        ISNULL((
          SELECT SUM(ISNULL(l.CANTIDAD, 0))
          FROM dbo.DOCPRODUCTOS l
          INNER JOIN dbo.DOCUMENTOS d
            ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
          INNER JOIN dbo.TIPODOCUMENTOS t
            ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
          WHERE d.EMPNIT = @EMPNIT
            AND t.TIPODOC IN (${tipodocSqlIn(TIPODOC_FISCAL_FRAC)})
            AND LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) = @SERIEFAC
            AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORR_SRC
            AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
        ), 0) AS EMITIDO
    `);
  const row = res.recordset?.[0] || {};
  const origen = Number(row.ORIGEN) || 0;
  const emitido = Number(row.EMITIDO) || 0;
  return origen - emitido > 0.0005;
}

/**
 * Tras anular un fiscal de fraccionamiento, libera la FAC fuente si quedó restante.
 * @returns {Promise<{ reopened: boolean, fuente?: { CODDOC: string, CORRELATIVO: number }, reason?: string }>}
 */
async function reopenFuenteFraccionamientoIfNeeded(pool, empnit, annulledHeader) {
  const tipodoc = String(annulledHeader?.TIPODOC || annulledHeader?.tipodoc || '')
    .trim()
    .toUpperCase();
  if (!TIPODOC_FISCAL_FRAC.includes(tipodoc)) {
    return { reopened: false, reason: 'not_fiscal_frac' };
  }

  const fuente = parseFuenteFromFiscal(annulledHeader);
  if (!fuente) return { reopened: false, reason: 'no_seriefac' };

  const srcRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, fuente.coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), fuente.correlativo)
    .query(`
      SELECT TOP 1
        d.CODDOC,
        d.CORRELATIVO,
        LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) AS CODEMBARQUE,
        d.ID_COLA_TRABAJO,
        t.TIPODOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const src = srcRes.recordset?.[0];
  if (!src) return { reopened: false, reason: 'fuente_not_found' };

  const srcTipodoc = String(src.TIPODOC || '').trim().toUpperCase();
  if (srcTipodoc !== 'FAC') return { reopened: false, reason: 'fuente_not_fac' };

  const codEmbarque = String(src.CODEMBARQUE || '').trim().toUpperCase();
  if (codEmbarque !== CODEMBARQUE_FRACCIONADA) {
    return {
      reopened: false,
      reason: 'fuente_not_fraccionada',
      fuente: { CODDOC: src.CODDOC, CORRELATIVO: src.CORRELATIVO },
    };
  }

  const hasRestante = await fuenteTieneRestante(pool, empnit, fuente.coddoc, fuente.correlativo);
  if (!hasRestante) {
    return {
      reopened: false,
      reason: 'sin_restante',
      fuente: { CODDOC: src.CODDOC, CORRELATIVO: Number(src.CORRELATIVO) },
    };
  }

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, fuente.coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), fuente.correlativo)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET CODEMBARQUE = '',
          ID_COLA_TRABAJO = NULL
      WHERE EMPNIT = @EMPNIT
        AND CODDOC = @CODDOC
        AND CORRELATIVO = @CORRELATIVO
        AND UPPER(LTRIM(RTRIM(ISNULL(CODEMBARQUE, '')))) = '${CODEMBARQUE_FRACCIONADA}'
    `);

  return {
    reopened: true,
    fuente: { CODDOC: String(src.CODDOC), CORRELATIVO: Number(src.CORRELATIVO) },
  };
}

module.exports = {
  reopenFuenteFraccionamientoIfNeeded,
  fuenteTieneRestante,
  parseFuenteFromFiscal,
  CODEMBARQUE_FRACCIONADA,
  TIPODOC_FISCAL_FRAC,
};
