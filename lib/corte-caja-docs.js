/** Tipos de documento incluidos en el corte de caja. */
const TIPODOC_FACTURA = ['FAC', 'FEF', 'FES', 'FEC'];
const TIPODOC_DEVOLUCION = ['DEV', 'FNC'];
const TIPODOC_GASTOS = ['GAS'];
const TIPODOC_CORTE_CAJA = [...TIPODOC_FACTURA, ...TIPODOC_DEVOLUCION, ...TIPODOC_GASTOS];

const SQL_TIPODOC_CORTE_IN = TIPODOC_CORTE_CAJA.map((t) => `'${t}'`).join(', ');

/** SQL común: documentos pendientes de corte en la sesión de caja abierta. */
function sessionCorteDocsSql(extraSelect = '') {
  return `
    SELECT d.ID, d.CODDOC, d.CORRELATIVO, d.FECHA, d.HORA, d.MINUTO,
           ISNULL(d.TOTALCOSTO, 0) AS TOTALCOSTO,
           ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
           ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
           ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
           ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
           ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
           ISNULL(d.CONCRE, 'CON') AS CONCRE
           ${extraSelect}
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    WHERE d.EMPNIT = @EMPNIT
      AND d.CODCAJA = @CODCAJA
      AND d.STATUS = 'O'
      AND ISNULL(d.CORTE, 'NO') = 'NO'
      AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
      AND d.ID > ISNULL((
        SELECT TOP 1 CASE WHEN c.IDFINAL > 0 THEN c.IDFINAL ELSE 0 END
        FROM dbo.CORTES c
        WHERE c.EMPNIT = @EMPNIT AND c.CODCAJA = @CODCAJA
        ORDER BY c.ID DESC
      ), 0)
      AND d.FECHA >= CAST(@APERTURA AS DATE)
    ORDER BY d.ID ASC
  `;
}

module.exports = {
  TIPODOC_FACTURA,
  TIPODOC_DEVOLUCION,
  TIPODOC_GASTOS,
  TIPODOC_CORTE_CAJA,
  SQL_TIPODOC_CORTE_IN,
  sessionCorteDocsSql,
};
