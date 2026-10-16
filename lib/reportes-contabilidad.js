const {
  STATUS_ANULADO,
  SQL_TIPODOC_REPORTES_SI,
  SQL_TIPODOC_CONTABLE_SI,
} = require('./documento-status');

/** Grupos del selector de Reportes Contabilidad. */
const DOC_GROUP_CATALOG = [
  {
    id: 'fel-facturas',
    label: 'FACTURAS FEL (TODAS LAS FEL)',
    tipodocs: ['FEF', 'FEC', 'FES'],
    filterMode: 'contable',
  },
  {
    id: 'fac',
    label: 'FACTURAS NO FISCALES (FAC)',
    tipodocs: ['FAC'],
    filterMode: 'reportes',
  },
  {
    id: 'compras',
    label: 'COMPRAS (COM Y COP)',
    tipodocs: ['COM', 'COP'],
    filterMode: 'reportes',
  },
  {
    id: 'fel-nc',
    label: 'NOTAS DE CREDITO FEL (FNC, FNA)',
    tipodocs: ['FNC', 'FNA'],
    filterMode: 'contable',
  },
  {
    id: 'dev',
    label: 'NOTAS DE CREDITO NO FISCALES (DEV)',
    tipodocs: ['DEV'],
    filterMode: 'reportes',
  },
];

const GROUP_BY_ID = Object.fromEntries(DOC_GROUP_CATALOG.map((g) => [g.id, g]));

function resolveDocGroup(groupId) {
  const id = String(groupId || '').trim().toLowerCase();
  return GROUP_BY_ID[id] || GROUP_BY_ID['fel-facturas'];
}

function sqlTipodocInList(tipodocs) {
  const list = (tipodocs || []).map((t) => `'${String(t).trim().toUpperCase().replace(/'/g, "''")}'`);
  return list.join(', ');
}

function buildProductosDocWhereSql(group) {
  const tipodocIn = sqlTipodocInList(group.tipodocs);
  const tipodocFilter =
    group.filterMode === 'contable' ? SQL_TIPODOC_CONTABLE_SI : SQL_TIPODOC_REPORTES_SI;

  return `
      d.EMPNIT = @EMPNIT
      AND CAST(d.FECHA AS DATE) BETWEEN @DESDE AND @HASTA
      AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
      AND LTRIM(RTRIM(t.TIPODOC)) IN (${tipodocIn})
      AND ${tipodocFilter}
  `;
}

const SQL_JOIN_PRODUCTOS_DOC = `
  FROM dbo.DOCPRODUCTOS dp
  INNER JOIN dbo.DOCUMENTOS d
    ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
  INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
`;

function buildProductosConsolidadoSql(group) {
  return `
    SELECT
      LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
      MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
      SUM(ISNULL(dp.TOTALUNIDADES, 0)) AS TOTALUNIDADES,
      SUM(ISNULL(dp.TOTALPRECIO, 0)) AS TOTALPRECIO,
      SUM(ISNULL(dp.TOTALCOSTO, 0)) AS TOTALCOSTO
    ${SQL_JOIN_PRODUCTOS_DOC}
    WHERE ${buildProductosDocWhereSql(group)}
    GROUP BY LTRIM(RTRIM(dp.CODPROD))
    ORDER BY LTRIM(RTRIM(dp.CODPROD))
  `;
}

function buildProductoLineasDetalleSql(group) {
  return `
    SELECT
      CAST(d.FECHA AS DATE) AS FECHA,
      d.CODDOC,
      d.CORRELATIVO,
      ISNULL(d.FEL_SERIE, '') AS FEL_SERIE,
      ISNULL(d.FEL_NUMERO, '') AS FEL_NUMERO,
      LTRIM(RTRIM(ISNULL(dp.CODMEDIDA, ''))) AS CODMEDIDA,
      ISNULL(dp.CANTIDAD, 0) AS CANTIDAD,
      ISNULL(dp.COSTO, 0) AS COSTO,
      ISNULL(dp.PRECIO, 0) AS PRECIO,
      ISNULL(dp.TOTALCOSTO, 0) AS TOTALCOSTO,
      ISNULL(dp.TOTALPRECIO, 0) AS TOTALPRECIO
    ${SQL_JOIN_PRODUCTOS_DOC}
    WHERE
      ${buildProductosDocWhereSql(group)}
      AND LTRIM(RTRIM(dp.CODPROD)) = @CODPROD
    ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO, dp.ID
  `;
}

module.exports = {
  DOC_GROUP_CATALOG,
  resolveDocGroup,
  buildProductosConsolidadoSql,
  buildProductoLineasDetalleSql,
};
