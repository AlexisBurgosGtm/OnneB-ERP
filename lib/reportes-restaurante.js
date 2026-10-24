/**
 * Criterios SQL — reportes de restaurante (comandas CRS + ventas ligadas a mesa/comanda).
 */
const { STATUS_ANULADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const { SQL_TIPODOC_VENTA_IN, SQL_SIGNO_DOC_IMPORTE } = require('./reportes-ventas-neto');

const TIPODOC_COMANDA = 'CRS';

function sqlRestaurantSalesWhere(dAlias = 'd', tAlias = 't') {
  const tipodocReportes = SQL_TIPODOC_REPORTES_SI.replace(/\bt\./g, `${tAlias}.`);
  return `
    ${dAlias}.EMPNIT = @EMPNIT
    AND CAST(${dAlias}.FECHA AS DATE) BETWEEN @DESDE AND @HASTA
    AND ISNULL(${dAlias}.STATUS, '') <> '${STATUS_ANULADO}'
    AND ${tAlias}.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
    AND ${tipodocReportes}
    AND (
      (${dAlias}.RESTAURANTE_MESA_ID IS NOT NULL AND ${dAlias}.RESTAURANTE_MESA_ID > 0)
      OR (
        LTRIM(RTRIM(ISNULL(${dAlias}.SERIEFAC, ''))) <> ''
        AND EXISTS (
          SELECT 1 FROM dbo.DOCUMENTOS c
          INNER JOIN dbo.TIPODOCUMENTOS tc ON tc.EMPNIT = c.EMPNIT AND tc.CODDOC = c.CODDOC
          WHERE c.EMPNIT = ${dAlias}.EMPNIT
            AND tc.TIPODOC = '${TIPODOC_COMANDA}'
            AND c.CODDOC = ${dAlias}.SERIEFAC
            AND TRY_CAST(LTRIM(RTRIM(${dAlias}.NOFAC)) AS DECIMAL(18, 0)) = c.CORRELATIVO
        )
      )
    )
  `;
}

/** ID de mesa: columna en factura o CODEMBARQUE de la comanda origen. */
function sqlMesaIdExpr(dAlias = 'd') {
  return `
    COALESCE(
      NULLIF(${dAlias}.RESTAURANTE_MESA_ID, 0),
      (
        SELECT TOP 1 TRY_CAST(NULLIF(LTRIM(RTRIM(c.CODEMBARQUE)), '') AS INT)
        FROM dbo.DOCUMENTOS c
        INNER JOIN dbo.TIPODOCUMENTOS tc ON tc.EMPNIT = c.EMPNIT AND tc.CODDOC = c.CODDOC
        WHERE c.EMPNIT = ${dAlias}.EMPNIT
          AND tc.TIPODOC = '${TIPODOC_COMANDA}'
          AND c.CODDOC = ${dAlias}.SERIEFAC
          AND TRY_CAST(LTRIM(RTRIM(${dAlias}.NOFAC)) AS DECIMAL(18, 0)) = c.CORRELATIVO
      )
    )
  `;
}

function sqlClienteKeyExpr(dAlias = 'd') {
  return `
    CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(${dAlias}.DOC_NIT, '')))) IN ('', 'CF', 'C/F', 'C.F.')
        THEN CONCAT('NOM:', LTRIM(RTRIM(ISNULL(${dAlias}.DOC_NOMCLIE, ''))))
      ELSE CONCAT('NIT:', LTRIM(RTRIM(${dAlias}.DOC_NIT)))
    END
  `;
}

/** CTE: ventas restaurante con MESA_ID ya resuelto (evita subquery en GROUP BY). */
function sqlVentasRestauranteCte(cteName = 'VentasRest') {
  const salesWhere = sqlRestaurantSalesWhere('d', 't');
  const mesaExpr = sqlMesaIdExpr('d');
  const clienteKey = sqlClienteKeyExpr('d');
  return `
    ${cteName} AS (
      SELECT
        d.ID,
        d.FECHA,
        d.HORA,
        d.MINUTO,
        d.CODDOC,
        d.CORRELATIVO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, ''))) AS DOC_NOMCLIE,
        LTRIM(RTRIM(ISNULL(d.DOC_NIT, ''))) AS DOC_NIT,
        ISNULL(d.RESTAURANTE_MESA_ID, 0) AS RESTAURANTE_MESA_ID,
        d.SERIEFAC,
        d.NOFAC,
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        ISNULL(t.DESDOC, '') AS DESDOC,
        (${mesaExpr}) AS MESA_ID,
        (${clienteKey}) AS CLIENTE_KEY,
        (${SQL_SIGNO_DOC_IMPORTE}) AS SIGNO_IMPORTE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE ${salesWhere}
    )
  `;
}

module.exports = {
  TIPODOC_COMANDA,
  SQL_SIGNO_DOC_IMPORTE,
  sqlRestaurantSalesWhere,
  sqlMesaIdExpr,
  sqlClienteKeyExpr,
  sqlVentasRestauranteCte,
};
