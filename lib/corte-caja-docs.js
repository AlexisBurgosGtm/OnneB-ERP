/** Tipos de documento incluidos en el corte de caja. */
const TIPODOC_FACTURA = ['FAC', 'FEF', 'FES', 'FEC'];
/** Notas de crédito clientes (devoluciones). */
const TIPODOC_DEVOLUCION = ['DEV', 'FNC'];
const TIPODOC_NOTAS_CREDITO = [...TIPODOC_DEVOLUCION];
const TIPODOC_GASTOS = ['GAS'];
/** Recibos de pago de clientes (abonos CXC): RCC y Recibos de Caja PRC. */
const TIPODOC_RCC = ['RCC', 'PRC'];
const TIPODOC_PRC = ['PRC'];
/**
 * No forman parte del efectivo de caja. Se excluyen del conteo y de la
 * marcación CORTE/NOCORTE aunque tuvieran CODCAJA:
 * - COM/COP/DVP: compras y NC a proveedores
 * - RAR: abono CXC por retención FEL (no es dinero recibido)
 */
const TIPODOC_EXCLUIDOS_CORTE_CAJA = ['COM', 'COP', 'DVP', 'RAR'];
const TIPODOC_CORTE_CAJA = [
  ...TIPODOC_FACTURA,
  ...TIPODOC_DEVOLUCION,
  ...TIPODOC_GASTOS,
  ...TIPODOC_RCC,
].filter((t) => !TIPODOC_EXCLUIDOS_CORTE_CAJA.includes(t));

const SQL_TIPODOC_CORTE_IN = TIPODOC_CORTE_CAJA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_DEVOLUCION_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_FACTURA_IN = TIPODOC_FACTURA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_RCC_IN = TIPODOC_RCC.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_PRC_IN = TIPODOC_PRC.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_EXCLUIDOS_CORTE_IN = TIPODOC_EXCLUIDOS_CORTE_CAJA.map((t) => `'${t}'`).join(', ');

/** Defensa: nunca incluir compras ni DVP en consultas/marcación de corte. */
const SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE = `
      AND t.TIPODOC NOT IN (${SQL_TIPODOC_EXCLUIDOS_CORTE_IN})`;

/**
 * Facturas con TIPOM=0 (NEUTRO) no intervienen en corte de caja.
 * DEV/GAS y facturas con movimiento de inventario (TIPOM <> 0) sí entran.
 */
const SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO = `
      AND (
        t.TIPODOC NOT IN (${SQL_TIPODOC_FACTURA_IN})
        OR ISNULL(t.TIPOM, 0) <> 0
      )`;

/**
 * Misma caja de la sesión, o PRC finalizados (CODEMBARQUE=CXC) sin CODCAJA
 * todavía (quedan pendientes de asignar al cortar).
 */
const SQL_SESSION_DOC_CAJA = `
      AND (
        d.CODCAJA = @CODCAJA
        OR (
          t.TIPODOC IN (${SQL_TIPODOC_PRC_IN})
          AND ISNULL(TRY_CONVERT(INT, d.CODCAJA), 0) = 0
          AND UPPER(LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, '')))) = 'CXC'
        )
      )`;

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
           ISNULL(d.CONCRE, 'CON') AS CONCRE,
           t.TIPODOC
           ${extraSelect}
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    WHERE d.EMPNIT = @EMPNIT
      ${SQL_SESSION_DOC_CAJA}
      AND d.STATUS = 'O'
      AND ISNULL(d.CORTE, 'NO') = 'NO'
      AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
      ${SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE}
      ${SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO}
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

const FILTROS_DOCUMENTOS = {
  todos: '',
  ventas: ` AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})`,
  credito: ` AND ISNULL(d.CONCRE, 'CON') = 'CRE' AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN}) AND t.TIPODOC NOT IN (${SQL_TIPODOC_RCC_IN})`,
  contado: ` AND ISNULL(d.CONCRE, 'CON') <> 'CRE' AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN}) AND t.TIPODOC NOT IN (${SQL_TIPODOC_RCC_IN})`,
  recibos: ` AND t.TIPODOC IN (${SQL_TIPODOC_RCC_IN})`,
  efectivo: ` AND ISNULL(d.FPAGO_EFECTIVO, 0) > 0 AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN})`,
  devoluciones: ` AND t.TIPODOC IN (${SQL_TIPODOC_DEVOLUCION_IN})`,
  tarjeta: ` AND ISNULL(d.FPAGO_TARJETA, 0) > 0 AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN})`,
  deposito: ` AND ISNULL(d.FPAGO_DEPOSITO, 0) > 0 AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN})`,
  cheque: ` AND ISNULL(d.FPAGO_CHEQUE, 0) > 0 AND t.TIPODOC NOT IN (${SQL_TIPODOC_DEVOLUCION_IN})`,
};

/** Ventana de sesión de caja (sin filtrar STATUS). */
function sessionCajaWindowWhere() {
  return `
      AND d.CODCAJA = @CODCAJA
      AND d.ID > ISNULL((
        SELECT TOP 1 CASE WHEN c.IDFINAL > 0 THEN c.IDFINAL ELSE 0 END
        FROM dbo.CORTES c
        WHERE c.EMPNIT = @EMPNIT AND c.CODCAJA = @CODCAJA
        ORDER BY c.ID DESC
      ), 0)
      AND d.FECHA >= CAST(@APERTURA AS DATE)
  `;
}

/** Facturas anuladas (STATUS=A) de la sesión — solo referencia, no entran al corte. */
function sessionCorteAnuladasSumSql() {
  return `
    SELECT
      COUNT(*) AS cantidadAnuladas,
      ISNULL(SUM(ISNULL(d.TOTALPRECIO, 0)), 0) AS totalAnuladas
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    WHERE d.EMPNIT = @EMPNIT
      ${sessionCajaWindowWhere()}
      AND d.STATUS = 'A'
      AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
      AND ISNULL(t.TIPOM, 0) <> 0
  `;
}

function sessionCorteAnuladasListSql() {
  return `
    SELECT d.FECHA, d.CODDOC, d.CORRELATIVO,
           ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
           ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
           ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
           ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
           ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
           ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
           ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
           t.TIPODOC
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    LEFT JOIN dbo.Empleados emp ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
    WHERE d.EMPNIT = @EMPNIT
      ${sessionCajaWindowWhere()}
      AND d.STATUS = 'A'
      AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
      AND ISNULL(t.TIPOM, 0) <> 0
    ORDER BY d.FECHA DESC, d.HORA DESC, d.CORRELATIVO DESC
  `;
}

function sessionCorteDocsListSql(filtro) {
  if (filtro === 'anuladas') return sessionCorteAnuladasListSql();
  if (!Object.prototype.hasOwnProperty.call(FILTROS_DOCUMENTOS, filtro)) return null;
  const extra = FILTROS_DOCUMENTOS[filtro] || '';
  return `
    SELECT d.FECHA, d.CODDOC, d.CORRELATIVO,
           ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
           ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
           ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
           ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
           ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
           ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
           ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR,
           t.TIPODOC
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
    LEFT JOIN dbo.Empleados emp ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
    WHERE d.EMPNIT = @EMPNIT
      ${SQL_SESSION_DOC_CAJA}
      AND d.STATUS = 'O'
      AND ISNULL(d.CORTE, 'NO') = 'NO'
      AND t.TIPODOC IN (${SQL_TIPODOC_CORTE_IN})
      ${SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE}
      ${SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO}
      AND d.ID > ISNULL((
        SELECT TOP 1 CASE WHEN c.IDFINAL > 0 THEN c.IDFINAL ELSE 0 END
        FROM dbo.CORTES c
        WHERE c.EMPNIT = @EMPNIT AND c.CODCAJA = @CODCAJA
        ORDER BY c.ID DESC
      ), 0)
      AND d.FECHA >= CAST(@APERTURA AS DATE)
      ${extra}
    ORDER BY d.FECHA DESC, d.HORA DESC, d.CORRELATIVO DESC
  `;
}

module.exports = {
  TIPODOC_FACTURA,
  TIPODOC_DEVOLUCION,
  TIPODOC_NOTAS_CREDITO,
  TIPODOC_GASTOS,
  TIPODOC_RCC,
  TIPODOC_PRC,
  TIPODOC_EXCLUIDOS_CORTE_CAJA,
  TIPODOC_CORTE_CAJA,
  SQL_TIPODOC_CORTE_IN,
  SQL_TIPODOC_DEVOLUCION_IN,
  SQL_TIPODOC_FACTURA_IN,
  SQL_TIPODOC_RCC_IN,
  SQL_TIPODOC_PRC_IN,
  SQL_TIPODOC_EXCLUIDOS_CORTE_IN,
  SQL_EXCLUIR_COMPRAS_Y_DVP_CORTE,
  SQL_EXCLUIR_FACTURAS_TIPOM_NEUTRO,
  SQL_SESSION_DOC_CAJA,
  FILTROS_DOCUMENTOS,
  sessionCorteDocsSql,
  sessionCorteDocsListSql,
  sessionCorteAnuladasSumSql,
  sessionCorteAnuladasListSql,
};
