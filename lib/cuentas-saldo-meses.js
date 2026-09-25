const { STATUS_OPERADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_TIPODOC_ABONO_CXC_IN,
  SQL_TIPODOC_RETENCION_CXC_IN,
  SQL_DOC_SALDO_PENDIENTE_POSITIVO,
} = require('./cuentas-docs');
const {
  SQL_TIPODOC_CUENTAS_PAGAR_IN,
  SQL_TIPODOC_ABONO_CXP_IN,
  SQL_TIPODOC_RETENCION_CXP_IN,
} = require('./cuentas-pagar-docs');

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

function isCurrentPeriod(mes, anio) {
  const now = new Date();
  return anio === now.getFullYear() && mes === now.getMonth() + 1;
}

function sqlPeriodoDoc(alias) {
  const a = alias;
  return `CASE
    WHEN ISNULL(${a}.ANIO, 0) > 0 AND ISNULL(${a}.MES, 0) BETWEEN 1 AND 12
      THEN (${a}.ANIO * 100 + ${a}.MES)
    WHEN ${a}.FECHA IS NOT NULL
      THEN (YEAR(${a}.FECHA) * 100 + MONTH(${a}.FECHA))
    ELSE NULL
  END`;
}

function sqlPeriodoFlexible(docAlias, dateExpr) {
  return `CASE
    WHEN ISNULL(${docAlias}.ANIO, 0) > 0 AND ISNULL(${docAlias}.MES, 0) BETWEEN 1 AND 12
      THEN (${docAlias}.ANIO * 100 + ${docAlias}.MES)
    WHEN ${docAlias}.FECHA IS NOT NULL
      THEN (YEAR(${docAlias}.FECHA) * 100 + MONTH(${docAlias}.FECHA))
    WHEN TRY_CONVERT(date, ${dateExpr}) IS NOT NULL
      THEN (YEAR(TRY_CONVERT(date, ${dateExpr})) * 100 + MONTH(TRY_CONVERT(date, ${dateExpr})))
    ELSE NULL
  END`;
}

const SQL_FACTURA_CXC_CRE = `(
  t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
  AND ISNULL(d.CONCRE, 'CON') = 'CRE'
  AND ${SQL_TIPODOC_REPORTES_SI}
)`;

const SQL_FACTURA_CXP_CRE = `(
  t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN})
  AND ISNULL(d.CONCRE, 'CON') = 'CRE'
)`;

function buildMovimientosSql(config) {
  const {
    facturaCreSql,
    tipodocAbonoIn,
    tipodocRetencionIn,
    partyJoinSql,
    clienteSql,
    negocioSql,
    nitSql,
    prcFilterSql,
    bancoExcludeSql,
  } = config;

  return `
    ;WITH mov AS (
      SELECT
        d.CODCLIENTE,
        ${clienteSql} AS CLIENTE,
        ${negocioSql} AS NEGOCIO,
        ${nitSql} AS NIT,
        ${sqlPeriodoDoc('d')} AS PERIODO,
        ISNULL(d.TOTALPRECIO, 0) AS CREDITO,
        CAST(0 AS DECIMAL(18, 3)) AS ABONO
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      ${partyJoinSql}
      WHERE d.EMPNIT = @EMPNIT
        AND d.STATUS = '${STATUS_OPERADO}'
        AND d.CODCLIENTE IS NOT NULL
        AND ${facturaCreSql.replace(/\bd\./g, 'd.').replace(/\bt\./g, 't.')}

      UNION ALL

      SELECT
        d.CODCLIENTE,
        ${clienteSql} AS CLIENTE,
        ${negocioSql} AS NEGOCIO,
        ${nitSql} AS NIT,
        ${sqlPeriodoDoc('d')} AS PERIODO,
        CAST(0 AS DECIMAL(18, 3)) AS CREDITO,
        ISNULL(d.TOTALPRECIO, 0) AS ABONO
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      ${partyJoinSql}
      WHERE d.EMPNIT = @EMPNIT
        AND d.STATUS = '${STATUS_OPERADO}'
        AND d.CODCLIENTE IS NOT NULL
        AND t.TIPODOC IN (${tipodocAbonoIn})
        AND t.TIPODOC <> 'PRC'
        AND LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) <> ''
        AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) IS NOT NULL

      UNION ALL

      SELECT
        p.CODCLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(p.DOC_NOMCLIE)), ''), ${config.partyCatalogNameSql}) AS CLIENTE,
        ${negocioSql.replace(/\bd\./g, 'p.').replace(/\bc\./g, config.partyCatalogAlias + '.')} AS NEGOCIO,
        ${nitSql.replace(/\bd\./g, 'p.').replace(/\bc\./g, config.partyCatalogAlias + '.')} AS NIT,
        ${sqlPeriodoDoc('p')} AS PERIODO,
        CAST(0 AS DECIMAL(18, 3)) AS CREDITO,
        ISNULL(a.ABONO, 0) AS ABONO
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      INNER JOIN dbo.DOCUMENTOS p
        ON p.EMPNIT = a.EMPNIT AND p.CODDOC = a.CODDOC AND p.CORRELATIVO = a.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS tp
        ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
      ${partyJoinSql.replace(/\bd\./g, 'p.').replace(/d\.EMPNIT/g, 'p.EMPNIT').replace(/d\.CODCLIENTE/g, 'p.CODCLIENTE')}
      WHERE a.EMPNIT = @EMPNIT
        AND p.STATUS = '${STATUS_OPERADO}'
        AND p.CODCLIENTE IS NOT NULL
        AND ${prcFilterSql}
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) <> ''
        AND a.CORRELATIVO_FAC IS NOT NULL

      UNION ALL

      SELECT
        p.CODCLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(p.DOC_NOMCLIE)), ''), ${config.partyCatalogNameSql}) AS CLIENTE,
        ${negocioSql.replace(/\bd\./g, 'p.').replace(/\bc\./g, config.partyCatalogAlias + '.')} AS NEGOCIO,
        ${nitSql.replace(/\bd\./g, 'p.').replace(/\bc\./g, config.partyCatalogAlias + '.')} AS NIT,
        ${sqlPeriodoFlexible('p', 'a.FECHA')} AS PERIODO,
        CAST(0 AS DECIMAL(18, 3)) AS CREDITO,
        ISNULL(a.ABONO, 0) AS ABONO
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      INNER JOIN dbo.DOCUMENTOS p
        ON p.EMPNIT = a.EMPNIT AND p.CODDOC = a.CODDOC AND p.CORRELATIVO = a.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS tp
        ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
      ${partyJoinSql.replace(/\bd\./g, 'p.').replace(/d\.EMPNIT/g, 'p.EMPNIT').replace(/d\.CODCLIENTE/g, 'p.CODCLIENTE')}
      WHERE a.EMPNIT = @EMPNIT
        AND p.STATUS = '${STATUS_OPERADO}'
        AND p.CODCLIENTE IS NOT NULL
        AND tp.TIPODOC IN (${tipodocRetencionIn})
        AND UPPER(LTRIM(RTRIM(ISNULL(p.CORTE, 'NO')))) = 'SI'
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) <> ''
        AND a.CORRELATIVO_FAC IS NOT NULL

      UNION ALL

      SELECT
        fac.CODCLIENTE,
        ISNULL(NULLIF(LTRIM(RTRIM(fac.DOC_NOMCLIE)), ''), ${config.partyCatalogNameSql.replace(/\bc\./g, 'cf.')}) AS CLIENTE,
        ISNULL(cf.${config.negocioColumn}, '') AS NEGOCIO,
        ISNULL(cf.${config.nitColumn}, fac.DOC_NIT) AS NIT,
        ${sqlPeriodoFlexible('pay', 'a.FECHA')} AS PERIODO,
        CAST(0 AS DECIMAL(18, 3)) AS CREDITO,
        ISNULL(a.ABONO, 0) AS ABONO
      FROM dbo.DOCUMENTOS_FACTURAS_ABONADAS a
      INNER JOIN dbo.DOCUMENTOS fac
        ON fac.EMPNIT = a.EMPNIT
        AND LTRIM(RTRIM(fac.CODDOC)) = LTRIM(RTRIM(a.CODDOC_FAC))
        AND fac.CORRELATIVO = CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0))
      LEFT JOIN ${config.partyTable} AS cf
        ON cf.EMPNIT = fac.EMPNIT AND cf.${config.partyPkColumn} = fac.CODCLIENTE
      OUTER APPLY (
        SELECT TOP 1 r.ANIO, r.MES, r.FECHA
        FROM dbo.DOCUMENTOS r
        WHERE r.EMPNIT = a.EMPNIT
          AND a.CODDOC_REC IS NOT NULL
          AND a.CORRELATIVO_REC IS NOT NULL
          AND r.CODDOC = a.CODDOC_REC
          AND r.CORRELATIVO = a.CORRELATIVO_REC
          AND r.STATUS = '${STATUS_OPERADO}'
      ) pay
      WHERE a.EMPNIT = @EMPNIT
        AND fac.STATUS = '${STATUS_OPERADO}'
        AND fac.CODCLIENTE IS NOT NULL
        AND LTRIM(RTRIM(ISNULL(a.CODDOC_FAC, ''))) <> ''
        AND a.CORRELATIVO_FAC IS NOT NULL
        ${bancoExcludeSql}
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
  `;
}

function mapAggregateRows(recordset) {
  return (recordset || []).map((r) => {
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
}

function computeTotales(rows) {
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
    saldoAnterior: roundMoney(totales.saldoAnterior),
    creditos: roundMoney(totales.creditos),
    abonos: roundMoney(totales.abonos),
    saldoActual: roundMoney(totales.saldoActual),
    count: rows.length,
  };
}

async function fetchSaldoPendientePorParte(pool, sql, empnit, opts) {
  const extraWhere = opts.extraWhereSql ? `AND ${opts.extraWhereSql}` : '';
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT
        d.CODCLIENTE,
        MAX(${opts.partyNameSql}) AS CLIENTE,
        MAX(${opts.negocioSql}) AS NEGOCIO,
        MAX(${opts.nitSql}) AS NIT,
        ISNULL(SUM(ISNULL(d.DOC_SALDO, 0)), 0) AS SALDO_DOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      ${opts.partyJoinSql}
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${opts.tipodocSqlIn})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${opts.saldoWhereSql}
        ${extraWhere}
        AND d.CODCLIENTE IS NOT NULL
      GROUP BY d.CODCLIENTE
      HAVING ROUND(ISNULL(SUM(ISNULL(d.DOC_SALDO, 0)), 0), 2) > 0
    `);
  return result.recordset || [];
}

function mergeCurrentSaldoActual(rows, docSaldoRows) {
  const byCod = new Map(rows.map((r) => [Number(r.CODCLIENTE), { ...r }]));

  for (const ds of docSaldoRows) {
    const cod = Number(ds.CODCLIENTE);
    if (!Number.isFinite(cod) || cod <= 0) continue;
    const saldoDoc = roundMoney(ds.SALDO_DOC);
    if (saldoDoc <= 0.005) continue;

    const existing = byCod.get(cod);
    if (existing) {
      existing.SALDO_ACTUAL = saldoDoc;
      existing.SALDO_ANTERIOR = roundMoney(saldoDoc - existing.CREDITOS + existing.ABONOS);
    } else {
      byCod.set(cod, {
        CODCLIENTE: cod,
        CLIENTE: ds.CLIENTE ?? null,
        NEGOCIO: ds.NEGOCIO ?? null,
        NIT: ds.NIT ?? null,
        SALDO_ANTERIOR: saldoDoc,
        CREDITOS: 0,
        ABONOS: 0,
        SALDO_ACTUAL: saldoDoc,
      });
    }
  }

  return Array.from(byCod.values())
    .filter((r) => r.SALDO_ACTUAL > 0.005)
    .sort((a, b) => String(a.CLIENTE || '').localeCompare(String(b.CLIENTE || ''), 'es'));
}

const SQL_BANCO_EXCLUDE_CXC = `
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS p
          INNER JOIN dbo.TIPODOCUMENTOS tp ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
          WHERE p.EMPNIT = a.EMPNIT
            AND p.CODDOC = a.CODDOC
            AND p.CORRELATIVO = a.CORRELATIVO
            AND tp.TIPODOC = 'PRC'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS p
          INNER JOIN dbo.TIPODOCUMENTOS tp ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
          WHERE p.EMPNIT = a.EMPNIT
            AND p.CODDOC = a.CODDOC
            AND p.CORRELATIVO = a.CORRELATIVO
            AND tp.TIPODOC IN (${SQL_TIPODOC_RETENCION_CXC_IN})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS p
          INNER JOIN dbo.TIPODOCUMENTOS tp ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
          WHERE p.EMPNIT = a.EMPNIT
            AND p.CODDOC = a.CODDOC
            AND p.CORRELATIVO = a.CORRELATIVO
            AND tp.TIPODOC = 'RAR'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS r
          WHERE r.EMPNIT = a.EMPNIT
            AND a.CODDOC_REC IS NOT NULL
            AND a.CORRELATIVO_REC IS NOT NULL
            AND r.CODDOC = a.CODDOC_REC
            AND r.CORRELATIVO = a.CORRELATIVO_REC
            AND r.STATUS = '${STATUS_OPERADO}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS r
          INNER JOIN dbo.TIPODOCUMENTOS tr ON tr.EMPNIT = r.EMPNIT AND tr.CODDOC = r.CODDOC
          WHERE r.EMPNIT = a.EMPNIT
            AND r.STATUS = '${STATUS_OPERADO}'
            AND tr.TIPODOC IN (${SQL_TIPODOC_ABONO_CXC_IN})
            AND tr.TIPODOC <> 'PRC'
            AND LTRIM(RTRIM(ISNULL(r.SERIEFAC, ''))) = LTRIM(RTRIM(a.CODDOC_FAC))
            AND TRY_CAST(LTRIM(RTRIM(r.NOFAC)) AS DECIMAL(18, 0)) = CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0))
        )`;

const SQL_BANCO_EXCLUDE_CXP = `
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS p
          INNER JOIN dbo.TIPODOCUMENTOS tp ON tp.EMPNIT = p.EMPNIT AND tp.CODDOC = p.CODDOC
          WHERE p.EMPNIT = a.EMPNIT
            AND p.CODDOC = a.CODDOC
            AND p.CORRELATIVO = a.CORRELATIVO
            AND tp.TIPODOC IN (${SQL_TIPODOC_RETENCION_CXP_IN})
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS r
          WHERE r.EMPNIT = a.EMPNIT
            AND a.CODDOC_REC IS NOT NULL
            AND a.CORRELATIVO_REC IS NOT NULL
            AND r.CODDOC = a.CODDOC_REC
            AND r.CORRELATIVO = a.CORRELATIVO_REC
            AND r.STATUS = '${STATUS_OPERADO}'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.DOCUMENTOS r
          INNER JOIN dbo.TIPODOCUMENTOS tr ON tr.EMPNIT = r.EMPNIT AND tr.CODDOC = r.CODDOC
          WHERE r.EMPNIT = a.EMPNIT
            AND r.STATUS = '${STATUS_OPERADO}'
            AND tr.TIPODOC IN (${SQL_TIPODOC_ABONO_CXP_IN})
            AND LTRIM(RTRIM(ISNULL(r.SERIEFAC, ''))) = LTRIM(RTRIM(a.CODDOC_FAC))
            AND TRY_CAST(LTRIM(RTRIM(r.NOFAC)) AS DECIMAL(18, 0)) = CAST(a.CORRELATIVO_FAC AS DECIMAL(18, 0))
        )`;

const CXC_MOV_CONFIG = {
  facturaCreSql: SQL_FACTURA_CXC_CRE,
  tipodocAbonoIn: SQL_TIPODOC_ABONO_CXC_IN,
  tipodocRetencionIn: SQL_TIPODOC_RETENCION_CXC_IN,
  partyJoinSql: 'LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE',
  partyCatalogAlias: 'c',
  partyCatalogNameSql: 'c.NOMBRECLIENTE',
  partyTable: 'dbo.CLIENTES',
  partyPkColumn: 'CODCLIENTE',
  negocioColumn: 'NEGOCIO',
  nitColumn: 'NIT',
  clienteSql: `ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), c.NOMBRECLIENTE)`,
  negocioSql: `ISNULL(c.NEGOCIO, '')`,
  nitSql: `ISNULL(c.NIT, d.DOC_NIT)`,
  prcFilterSql: `tp.TIPODOC = 'PRC'
        AND UPPER(LTRIM(RTRIM(ISNULL(p.CODEMBARQUE, '')))) = 'CXC'
        AND ISNULL(p.CODCAJA, 0) > 0`,
  bancoExcludeSql: SQL_BANCO_EXCLUDE_CXC,
};

const CXP_MOV_CONFIG = {
  facturaCreSql: SQL_FACTURA_CXP_CRE,
  tipodocAbonoIn: SQL_TIPODOC_ABONO_CXP_IN,
  tipodocRetencionIn: SQL_TIPODOC_RETENCION_CXP_IN,
  partyJoinSql:
    'LEFT JOIN dbo.PROVEEDORES c ON c.EMPNIT = d.EMPNIT AND c.CODPROV = d.CODCLIENTE',
  partyCatalogAlias: 'c',
  partyCatalogNameSql: `ISNULL(NULLIF(LTRIM(RTRIM(c.EMPRESA)), ''), c.RAZONSOCIAL)`,
  partyTable: 'dbo.PROVEEDORES',
  partyPkColumn: 'CODPROV',
  negocioColumn: 'EMPRESA',
  nitColumn: 'NIT',
  clienteSql: `ISNULL(NULLIF(LTRIM(RTRIM(d.DOC_NOMCLIE)), ''), ISNULL(NULLIF(LTRIM(RTRIM(c.EMPRESA)), ''), c.RAZONSOCIAL))`,
  negocioSql: `ISNULL(c.EMPRESA, '')`,
  nitSql: `ISNULL(c.NIT, d.DOC_NIT)`,
  prcFilterSql: '1 = 0',
  bancoExcludeSql: SQL_BANCO_EXCLUDE_CXP,
};

async function fetchSaldoMeses(pool, sql, empnit, { mes, anio } = {}, movConfig, saldoPendienteOpts) {
  const period = parseMesAnio({ mes, anio });
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('PERIODO', sql.Int, period.periodo)
    .query(buildMovimientosSql(movConfig));

  let rows = mapAggregateRows(result.recordset);

  if (isCurrentPeriod(period.mes, period.anio)) {
    const docSaldoRows = await fetchSaldoPendientePorParte(pool, sql, empnit, saldoPendienteOpts);
    rows = mergeCurrentSaldoActual(rows, docSaldoRows);
  }

  return {
    mes: period.mes,
    anio: period.anio,
    rows,
    totales: computeTotales(rows),
  };
}

async function fetchSaldoMesesCxc(pool, sql, empnit, opts = {}) {
  return fetchSaldoMeses(pool, sql, empnit, opts, CXC_MOV_CONFIG, {
    tipodocSqlIn: SQL_TIPODOC_CUENTAS_COBRAR_IN,
    saldoWhereSql: SQL_DOC_SALDO_PENDIENTE_POSITIVO,
    extraWhereSql: SQL_TIPODOC_REPORTES_SI,
    partyJoinSql: 'LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE',
    partyNameSql: `ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(c.NOMBRECLIENTE, ''))), ''), LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, ''))))`,
    negocioSql: `ISNULL(c.NEGOCIO, '')`,
    nitSql: `ISNULL(c.NIT, d.DOC_NIT)`,
  });
}

async function fetchSaldoMesesCxp(pool, sql, empnit, opts = {}) {
  return fetchSaldoMeses(pool, sql, empnit, opts, CXP_MOV_CONFIG, {
    tipodocSqlIn: SQL_TIPODOC_CUENTAS_PAGAR_IN,
    saldoWhereSql: SQL_DOC_SALDO_PENDIENTE_POSITIVO,
    partyJoinSql:
      'LEFT JOIN dbo.PROVEEDORES c ON c.EMPNIT = d.EMPNIT AND c.CODPROV = d.CODCLIENTE',
    partyNameSql: `ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(c.EMPRESA, ''))), ''), ISNULL(NULLIF(LTRIM(RTRIM(ISNULL(c.RAZONSOCIAL, ''))), ''), LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, '')))))`,
    negocioSql: `ISNULL(c.EMPRESA, '')`,
    nitSql: `ISNULL(c.NIT, d.DOC_NIT)`,
  });
}

module.exports = {
  parseMesAnio,
  isCurrentPeriod,
  fetchSaldoMesesCxc,
  fetchSaldoMesesCxp,
};
