const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');

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
async function listInventarioFiscal(pool, { empnit, mes, anio, q = '', limit = 500 } = {}) {
  const emp = String(empnit || '').trim();
  const m = Number(mes);
  const a = Number(anio);
  if (!emp) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }
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

  const qTrim = String(q || '').trim();
  const qLike = qTrim ? `%${qTrim}%` : null;
  let lim = Number(limit);
  if (!Number.isFinite(lim) || lim <= 0) lim = 500;
  lim = Math.min(Math.max(Math.floor(lim), 1), 5000);

  const request = pool.request();
  request.timeout = 120000;
  request.input('EMPNIT', sql.VarChar, emp);
  request.input('MES', sql.Int, m);
  request.input('ANIO', sql.Int, a);
  request.input('q', sql.NVarChar, qTrim || null);
  request.input('qLike', sql.NVarChar, qLike);
  request.input('limit', sql.Int, lim);

  const result = await request.query(`
    SELECT TOP (@limit)
      p.CODPROD,
      p.DESPROD,
      ISNULL(m.DESMARCA, '') AS DESMARCA,
      ISNULL(p.TIPOPROD, 'P') AS TIPOPROD,
      ISNULL(p.COSTO, 0) AS COSTO,
      ISNULL(p.HABILITADO, 'SI') AS HABILITADO,
      ISNULL(inv.SALDO, 0) AS SALDO,
      CAST(ISNULL(p.COSTO, 0) * ISNULL(inv.SALDO, 0) AS DECIMAL(18, 4)) AS TOTALCOSTO
    FROM dbo.PRODUCTOS p
    LEFT JOIN dbo.MARCAS m
      ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
    LEFT JOIN (
      SELECT
        l.CODPROD,
        SUM(
          ISNULL(l.TOTALUNIDADES, 0) * CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) IN ('FEF', 'FEC', 'FES') THEN -1
            WHEN UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) IN ('FNC', 'FNA') THEN 1
            WHEN UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) IN ('COM', 'COP') THEN 1
            ELSE ISNULL(l.TIPOM, ISNULL(t.TIPOM, 0))
          END
        ) AS SALDO
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
        AND (
          d.ANIO < @ANIO
          OR (d.ANIO = @ANIO AND d.MES <= @MES)
        )
        AND ISNULL(l.TIPOPROD, 'P') <> 'S'
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
      AND ISNULL(inv.SALDO, 0) <> 0
    ORDER BY p.DESPROD, p.CODPROD
  `);

  const rows = result.recordset || [];
  const totals = rows.reduce(
    (acc, row) => {
      acc.SALDO += Number(row.SALDO) || 0;
      acc.TOTALCOSTO += Number(row.TOTALCOSTO) || 0;
      return acc;
    },
    { SALDO: 0, TOTALCOSTO: 0 }
  );

  return {
    rows,
    total: rows.length,
    truncated: rows.length >= lim,
    totals,
    mes: m,
    anio: a,
  };
}

module.exports = {
  listInventarioFiscal,
};
