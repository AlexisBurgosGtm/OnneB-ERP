const { STATUS_OPERADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_TIPODOC_DEVOLUCION_IN,
  SQL_EXISTS_FACTURA_CRE_REF,
} = require('./cuentas-docs');

/** Abono CXC: RCC o nota DEV/FNC vinculada a factura CRE. */
const SQL_ABONO_CXC_FILTER = `(
  t.TIPODOC = 'RCC'
  OR (t.TIPODOC IN (${SQL_TIPODOC_DEVOLUCION_IN}) AND ${SQL_EXISTS_FACTURA_CRE_REF})
)`;

/** Factura CRE que cuenta para CXC (excluye series REPORTES='NO'). */
const SQL_FACTURA_CXC_CRE = `(
  t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
  AND ISNULL(d.CONCRE, 'CON') = 'CRE'
  AND ${SQL_TIPODOC_REPORTES_SI}
)`;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 1000) / 1000;
}

function parseMesAnio(query = {}) {
  const now = new Date();
  let anio = parseInt(query.anio, 10);
  let mes = parseInt(query.mes, 10);
  if (Number.isNaN(anio) || anio < 2000 || anio > 2100) anio = now.getFullYear();
  if (Number.isNaN(mes) || mes < 1 || mes > 12) mes = now.getMonth() + 1;
  return { mes, anio, periodo: anio * 100 + mes };
}

/**
 * Estado de saldos CXC por cliente hasta un mes/año (corte inclusive del mes).
 * Saldo anterior = créditos − abonos antes del mes.
 * Créditos / Abonos = movimientos del mes seleccionado.
 * Saldo actual = saldo anterior + créditos − abonos.
 */
async function fetchSaldoMesesCxc(pool, sql, empnit, { mes, anio } = {}) {
  const period = parseMesAnio({ mes, anio });
  const periodoKey = period.periodo;

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('PERIODO', sql.Int, periodoKey)
    .query(`
      ;WITH mov AS (
        SELECT
          d.CODCLIENTE,
          ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), c.NOMBRECLIENTE) AS CLIENTE,
          ISNULL(c.NEGOCIO, '') AS NEGOCIO,
          ISNULL(c.NIT, d.DOC_NIT) AS NIT,
          CASE
            WHEN ISNULL(d.ANIO, 0) > 0 AND ISNULL(d.MES, 0) BETWEEN 1 AND 12
              THEN (d.ANIO * 100 + d.MES)
            WHEN d.FECHA IS NOT NULL
              THEN (YEAR(d.FECHA) * 100 + MONTH(d.FECHA))
            ELSE NULL
          END AS PERIODO,
          CASE
            WHEN ${SQL_FACTURA_CXC_CRE}
            THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END AS CREDITO,
          CASE
            WHEN ${SQL_ABONO_CXC_FILTER}
            THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END AS ABONO
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
        LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
        WHERE d.EMPNIT = @EMPNIT
          AND d.STATUS = '${STATUS_OPERADO}'
          AND d.CODCLIENTE IS NOT NULL
          AND (
            ${SQL_FACTURA_CXC_CRE}
            OR ${SQL_ABONO_CXC_FILTER}
          )
      )
      SELECT
        mov.CODCLIENTE,
        MAX(mov.CLIENTE) AS CLIENTE,
        MAX(mov.NEGOCIO) AS NEGOCIO,
        MAX(mov.NIT) AS NIT,
        SUM(CASE WHEN mov.PERIODO IS NOT NULL AND mov.PERIODO < @PERIODO THEN mov.CREDITO ELSE 0 END)
          - SUM(CASE WHEN mov.PERIODO IS NOT NULL AND mov.PERIODO < @PERIODO THEN mov.ABONO ELSE 0 END)
          AS SALDO_ANTERIOR,
        SUM(CASE WHEN mov.PERIODO = @PERIODO THEN mov.CREDITO ELSE 0 END) AS CREDITOS,
        SUM(CASE WHEN mov.PERIODO = @PERIODO THEN mov.ABONO ELSE 0 END) AS ABONOS
      FROM mov
      WHERE mov.PERIODO IS NOT NULL AND mov.PERIODO <= @PERIODO
      GROUP BY mov.CODCLIENTE
      HAVING
        ABS(
          SUM(CASE WHEN mov.PERIODO IS NOT NULL AND mov.PERIODO < @PERIODO THEN mov.CREDITO ELSE 0 END)
          - SUM(CASE WHEN mov.PERIODO IS NOT NULL AND mov.PERIODO < @PERIODO THEN mov.ABONO ELSE 0 END)
        ) > 0.005
        OR SUM(CASE WHEN mov.PERIODO = @PERIODO THEN mov.CREDITO ELSE 0 END) > 0.005
        OR SUM(CASE WHEN mov.PERIODO = @PERIODO THEN mov.ABONO ELSE 0 END) > 0.005
      ORDER BY MAX(mov.CLIENTE), mov.CODCLIENTE
    `);

  const rows = result.recordset.map((r) => {
    const saldoAnterior = roundMoney(r.SALDO_ANTERIOR);
    const creditos = roundMoney(r.CREDITOS);
    const abonos = roundMoney(r.ABONOS);
    const saldoActual = roundMoney(saldoAnterior + creditos - abonos);
    return {
      CODCLIENTE: r.CODCLIENTE ?? null,
      CLIENTE: r.CLIENTE ?? null,
      NEGOCIO: r.NEGOCIO ?? null,
      NIT: r.NIT ?? null,
      SALDO_ANTERIOR: saldoAnterior,
      CREDITOS: creditos,
      ABONOS: abonos,
      SALDO_ACTUAL: saldoActual,
    };
  });

  const totales = rows.reduce(
    (acc, row) => {
      acc.saldoAnterior += row.SALDO_ANTERIOR;
      acc.creditos += row.CREDITOS;
      acc.abonos += row.ABONOS;
      acc.saldoActual += row.SALDO_ACTUAL;
      return acc;
    },
    { saldoAnterior: 0, creditos: 0, abonos: 0, saldoActual: 0 }
  );

  return {
    mes: period.mes,
    anio: period.anio,
    rows,
    totales: {
      saldoAnterior: roundMoney(totales.saldoAnterior),
      creditos: roundMoney(totales.creditos),
      abonos: roundMoney(totales.abonos),
      saldoActual: roundMoney(totales.saldoActual),
      count: rows.length,
    },
  };
}

module.exports = {
  parseMesAnio,
  fetchSaldoMesesCxc,
};
