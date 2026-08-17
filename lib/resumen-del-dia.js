/**
 * Resumen del día — productos netos (ventas − devoluciones) agrupados por clase tres.
 * Ventas: FAC, FEF, FEC, FES con TIPOM <> 0.
 * Devoluciones: DEV, FNC, FNA.
 */
const { STATUS_ANULADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');

const TIPODOC_VENTA = ['FAC', 'FEF', 'FEC', 'FES'];
const TIPODOC_DEVOLUCION = ['DEV', 'FNC', 'FNA'];
const TIPODOC_RESUMEN = [...TIPODOC_VENTA, ...TIPODOC_DEVOLUCION];

const SQL_TIPODOC_VENTA_IN = TIPODOC_VENTA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_DEV_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_RESUMEN_IN = TIPODOC_RESUMEN.map((t) => `'${t}'`).join(', ');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseFechaIso(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

async function fetchResumenProductosDia(pool, sql, empnit, fecha) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .query(`
      SELECT
        ISNULL(p.CODCLATRES, 0) AS CODCLATRES,
        ISNULL(NULLIF(LTRIM(RTRIM(c3.DESCLATRES)), ''), 'Sin clase tres') AS DESCLATRES,
        LTRIM(RTRIM(dp.CODPROD)) AS codigo,
        MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS desprod,
        SUM(
          CASE
            WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALUNIDADES, 0)
            WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) AS totalunidades,
        SUM(
          CASE
            WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALPRECIO, 0)
            WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALPRECIO, 0)
            ELSE 0
          END
        ) AS totalprecio,
        SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) <> 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALUNIDADES, 0)
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) <> 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) AS totalunidades_con,
        SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) <> 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALPRECIO, 0)
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) <> 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALPRECIO, 0)
            ELSE 0
          END
        ) AS totalprecio_con,
        SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) = 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALUNIDADES, 0)
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) = 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALUNIDADES, 0)
            ELSE 0
          END
        ) AS totalunidades_cre,
        SUM(
          CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) = 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALPRECIO, 0)
            WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) = 'CRE'
              AND t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALPRECIO, 0)
            ELSE 0
          END
        ) AS totalprecio_cre
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT
        AND dp.CODDOC = d.CODDOC
        AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      LEFT JOIN dbo.PRODUCTOS p
        ON p.EMPNIT = dp.EMPNIT
        AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(dp.CODPROD))
      LEFT JOIN dbo.CLASIFICACIONTRES c3
        ON p.EMPNIT = c3.EMPNIT AND p.CODCLATRES = c3.CODCLATRES
      WHERE d.EMPNIT = @EMPNIT
        AND CAST(d.FECHA AS DATE) = @FECHA
        AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
        AND t.TIPODOC IN (${SQL_TIPODOC_RESUMEN_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
        AND (
          (t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) AND ISNULL(t.TIPOM, 0) <> 0)
          OR t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
        )
      GROUP BY
        ISNULL(p.CODCLATRES, 0),
        ISNULL(NULLIF(LTRIM(RTRIM(c3.DESCLATRES)), ''), 'Sin clase tres'),
        LTRIM(RTRIM(dp.CODPROD))
      HAVING
        ABS(SUM(
          CASE
            WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALUNIDADES, 0)
            WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALUNIDADES, 0)
            ELSE 0
          END
        )) > 0.0001
        OR ABS(SUM(
          CASE
            WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
              AND ISNULL(t.TIPOM, 0) <> 0
              THEN ISNULL(dp.TOTALPRECIO, 0)
            WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
              THEN -ISNULL(dp.TOTALPRECIO, 0)
            ELSE 0
          END
        )) > 0.0001
      ORDER BY DESCLATRES, totalprecio DESC, codigo
    `);

  return result.recordset.map((r) => ({
    CODCLATRES: Number(r.CODCLATRES) || 0,
    DESCLATRES: String(r.DESCLATRES ?? '').trim() || 'Sin clase tres',
    codigo: String(r.codigo ?? '').trim(),
    desprod: String(r.desprod ?? '').trim(),
    totalunidades: toNumber(r.totalunidades),
    totalprecio: toNumber(r.totalprecio),
    totalunidadesCon: toNumber(r.totalunidades_con),
    totalprecioCon: toNumber(r.totalprecio_con),
    totalunidadesCre: toNumber(r.totalunidades_cre),
    totalprecioCre: toNumber(r.totalprecio_cre),
  }));
}

async function loadResumenDelDia(pool, sql, empnit, fecha) {
  const rows = await fetchResumenProductosDia(pool, sql, empnit, fecha);
  const claseMap = new Map();
  for (const r of rows) {
    const key = String(r.CODCLATRES);
    if (!claseMap.has(key)) {
      claseMap.set(key, {
        CODCLATRES: r.CODCLATRES,
        DESCLATRES: r.DESCLATRES,
      });
    }
  }
  const clasificaciones = Array.from(claseMap.values()).sort((a, b) =>
    String(a.DESCLATRES).localeCompare(String(b.DESCLATRES), 'es')
  );
  const totales = rows.reduce(
    (acc, r) => {
      acc.totalunidades += r.totalunidades;
      acc.totalprecio += r.totalprecio;
      acc.productos += 1;
      return acc;
    },
    { totalunidades: 0, totalprecio: 0, productos: 0, clases: clasificaciones.length }
  );
  return {
    empnit,
    fecha,
    rows,
    clasificaciones,
    totales,
    tipodocsVenta: TIPODOC_VENTA,
    tipodocsDevolucion: TIPODOC_DEVOLUCION,
  };
}

module.exports = {
  TIPODOC_VENTA,
  TIPODOC_DEVOLUCION,
  parseFechaIso,
  loadResumenDelDia,
};
