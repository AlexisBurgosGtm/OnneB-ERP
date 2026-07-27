const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');

/**
 * Inventario retroactivo: saldo por producto acumulado hasta mes/año
 * a partir de movimientos reales (TOTALUNIDADES × TIPOM de línea),
 * documentos no anulados, sin servicios.
 */

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

function bindListParams(request, { empnit, mes, anio, q, qLike, codmarca, habilitado, limit }) {
  request.timeout = 120000;
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('MES', sql.Int, mes);
  request.input('ANIO', sql.Int, anio);
  request.input('STATUS_ANULADO', sql.VarChar, STATUS_ANULADO);
  request.input('q', sql.NVarChar, q || null);
  request.input('qLike', sql.NVarChar, qLike);
  request.input('codmarca', sql.Int, codmarca);
  request.input('habilitado', sql.VarChar, habilitado);
  if (limit > 0) request.input('limit', sql.Int, limit);
}

const SALDO_APPLY = `
  OUTER APPLY (
    SELECT
      SUM(
        CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT)
      ) AS SALDO
    FROM dbo.DOCPRODUCTOS l
    INNER JOIN dbo.DOCUMENTOS d
      ON d.EMPNIT = l.EMPNIT
     AND d.CODDOC = l.CODDOC
     AND d.CORRELATIVO = l.CORRELATIVO
    WHERE l.EMPNIT = p.EMPNIT
      AND LTRIM(RTRIM(l.CODPROD)) = LTRIM(RTRIM(p.CODPROD))
      AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
      AND ISNULL(l.TIPOPROD, 'P') <> 'S'
      AND ISNULL(l.TIPOM, 0) <> 0
      AND ISNULL(l.TOTALUNIDADES, 0) <> 0
      AND (
        d.ANIO < @ANIO
        OR (d.ANIO = @ANIO AND d.MES <= @MES)
      )
  ) inv
`;

const LIST_SELECT = `
  p.CODPROD,
  p.DESPROD,
  ISNULL(inv.SALDO, 0) AS SALDO,
  p.EXISTENCIA,
  ISNULL(m.DESMARCA, '') AS DESMARCA,
  p.TIPOPROD,
  p.COSTO,
  p.HABILITADO,
  CAST(ISNULL(p.COSTO, 0) * ISNULL(inv.SALDO, 0) AS DECIMAL(18, 4)) AS TOTALCOSTO
`;

const LIST_FROM = `
  FROM dbo.PRODUCTOS p
  LEFT JOIN dbo.Marcas m ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
  ${SALDO_APPLY}
`;

function listWhere({ requireNonZero }) {
  return `
  WHERE p.EMPNIT = @EMPNIT
    AND ISNULL(p.TIPOPROD, 'P') <> 'S'
    AND (@codmarca IS NULL OR p.CODMARCA = @codmarca)
    AND (@habilitado IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(p.HABILITADO, '')))) = @habilitado)
    AND (
      @q IS NULL OR @q = ''
      OR p.CODPROD LIKE @qLike
      OR p.DESPROD LIKE @qLike
    )
    ${requireNonZero ? 'AND ISNULL(inv.SALDO, 0) <> 0' : ''}
`;
}

function hasListFilters(q, codmarca, habilitado) {
  return Boolean(q) || codmarca != null || habilitado != null;
}

async function listInventarioRetroactivo(
  pool,
  { empnit, mes, anio, q = '', codmarca = null, habilitado = null, limit = 100 } = {},
) {
  const emp = String(empnit || '').trim();
  if (!emp) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }
  const period = parsePeriod({ mes, anio });
  const qTrim = String(q || '').trim();
  const qLike = qTrim ? `%${qTrim}%` : null;
  let lim = Number(limit);
  if (!Number.isFinite(lim) || lim < 0) lim = 100;
  if (lim > 0) lim = Math.min(Math.max(Math.floor(lim), 1), 2000);

  const filtered = hasListFilters(qTrim, codmarca, habilitado);
  const requireNonZero = !filtered;
  const where = listWhere({ requireNonZero });
  const topClause = lim > 0 ? 'TOP (@limit)' : '';

  const listReq = pool.request();
  bindListParams(listReq, {
    empnit: emp,
    mes: period.mes,
    anio: period.anio,
    q: qTrim || null,
    qLike,
    codmarca,
    habilitado,
    limit: lim,
  });

  const listResult = await listReq.query(`
    SELECT ${topClause} ${LIST_SELECT}
    ${LIST_FROM}
    ${where}
    ORDER BY p.CODPROD
  `);

  const rows = listResult.recordset || [];
  let total = rows.length;
  let truncated = false;
  let totals = rows.reduce(
    (acc, row) => {
      acc.SALDO += Number(row.SALDO) || 0;
      acc.TOTALCOSTO += Number(row.TOTALCOSTO) || 0;
      return acc;
    },
    { SALDO: 0, TOTALCOSTO: 0 },
  );

  const skipExactMeta = !filtered || Boolean(qTrim);
  if (!skipExactMeta) {
    const countReq = pool.request();
    bindListParams(countReq, {
      empnit: emp,
      mes: period.mes,
      anio: period.anio,
      q: qTrim || null,
      qLike,
      codmarca,
      habilitado,
      limit: 0,
    });
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      ${LIST_FROM}
      ${where}
    `);
    total = countResult.recordset[0]?.total ?? rows.length;
    truncated = lim > 0 && total > rows.length;

    const totalsReq = pool.request();
    bindListParams(totalsReq, {
      empnit: emp,
      mes: period.mes,
      anio: period.anio,
      q: qTrim || null,
      qLike,
      codmarca,
      habilitado,
      limit: 0,
    });
    const totalsResult = await totalsReq.query(`
      SELECT
        SUM(ISNULL(inv.SALDO, 0)) AS SUM_SALDO,
        SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(inv.SALDO, 0) AS DECIMAL(18, 4))) AS SUM_TOTALCOSTO
      ${LIST_FROM}
      ${where}
    `);
    const totalsRow = totalsResult.recordset[0] || {};
    totals = {
      SALDO: totalsRow.SUM_SALDO ?? 0,
      TOTALCOSTO: totalsRow.SUM_TOTALCOSTO ?? 0,
    };
  } else {
    truncated = lim > 0 && rows.length >= lim;
  }

  return {
    rows,
    total,
    limit: lim,
    truncated,
    totals,
    mes: period.mes,
    anio: period.anio,
    empnit: emp,
    codmarca,
    habilitado,
  };
}

async function listInventarioRetroactivoExport(
  pool,
  { empnit, mes, anio, q = '', codmarca = null, habilitado = null } = {},
) {
  const emp = String(empnit || '').trim();
  if (!emp) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }
  const period = parsePeriod({ mes, anio });
  const qTrim = String(q || '').trim();
  const qLike = qTrim ? `%${qTrim}%` : null;
  const filtered = hasListFilters(qTrim, codmarca, habilitado);
  const requireNonZero = !filtered;
  const where = listWhere({ requireNonZero });

  const listReq = pool.request();
  bindListParams(listReq, {
    empnit: emp,
    mes: period.mes,
    anio: period.anio,
    q: qTrim || null,
    qLike,
    codmarca,
    habilitado,
    limit: 0,
  });

  const listResult = await listReq.query(`
    SELECT ${LIST_SELECT}
    ${LIST_FROM}
    ${where}
    ORDER BY p.CODPROD
  `);

  const totalsReq = pool.request();
  bindListParams(totalsReq, {
    empnit: emp,
    mes: period.mes,
    anio: period.anio,
    q: qTrim || null,
    qLike,
    codmarca,
    habilitado,
    limit: 0,
  });
  const totalsResult = await totalsReq.query(`
    SELECT
      SUM(ISNULL(inv.SALDO, 0)) AS SUM_SALDO,
      SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(inv.SALDO, 0) AS DECIMAL(18, 4))) AS SUM_TOTALCOSTO
    ${LIST_FROM}
    ${where}
  `);
  const totalsRow = totalsResult.recordset[0] || {};

  return {
    rows: listResult.recordset || [],
    totals: {
      SUM_SALDO: totalsRow.SUM_SALDO ?? 0,
      SUM_TOTALCOSTO: totalsRow.SUM_TOTALCOSTO ?? 0,
    },
    mes: period.mes,
    anio: period.anio,
  };
}

module.exports = {
  listInventarioRetroactivo,
  listInventarioRetroactivoExport,
  parsePeriod,
};
