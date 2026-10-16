/**
 * Consultas externas — respuestas de texto en JSON { mensaje } para integraciones.
 * Sin autenticación (fase inicial).
 */
const {
  STATUS_ANULADO,
  STATUS_OPERADO,
  SQL_TIPODOC_REPORTES_SI,
} = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_COBRAR_IN,
  SQL_DOC_SALDO_PENDIENTE_POSITIVO,
} = require('./cuentas-docs');
const { SQL_TIPODOC_CUENTAS_PAGAR_IN } = require('./cuentas-pagar-docs');

const MSG_SIN_DATOS = 'No se han registrado documentos aún';

const TIPODOC_VENTA = ['FAC', 'FEF', 'FEC', 'FES'];
const TIPODOC_DEVOLUCION = ['DEV', 'FNC', 'FNA'];
const TIPODOC_COMPRA = ['COM', 'COP'];

const SQL_TIPODOC_VENTA_IN = TIPODOC_VENTA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_DEV_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_COMPRA_IN = TIPODOC_COMPRA.map((t) => `'${t}'`).join(', ');

const SQL_JOIN_DOC_TIPODOC = `
  INNER JOIN dbo.TIPODOCUMENTOS t
    ON LTRIM(RTRIM(t.EMPNIT)) = LTRIM(RTRIM(d.EMPNIT))
   AND LTRIM(RTRIM(t.CODDOC)) = LTRIM(RTRIM(d.CODDOC))
`;

const SQL_TIPOM_MOVIMIENTO = 'ISNULL(t.TIPOM, 0) <> 0';

const SQL_DOC_EMP_FECHA_BASE = `
  LTRIM(RTRIM(d.EMPNIT)) = LTRIM(RTRIM(@EMPNIT))
  AND CAST(d.FECHA AS DATE) BETWEEN @DESDE AND @HASTA
  AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
`;

const EXTERNAL_REPORTS = [
  {
    codigo: 'VENTADIA',
    nombre: 'VENTAS DEL DÍA',
    parametros: ['empnit', 'ventadia'],
    implementado: true,
  },
  {
    codigo: 'VENTAMES',
    nombre: 'VENTAS DEL MES',
    parametros: ['empnit', 'ventadia'],
    implementado: true,
  },
  {
    codigo: 'CUENTAPAGAR',
    nombre: 'CUENTAS POR PAGAR',
    parametros: ['empnit', 'ventadia'],
    implementado: true,
  },
  {
    codigo: 'CUENTACOBRAR',
    nombre: 'CUENTAS POR COBRAR',
    parametros: ['empnit', 'ventadia'],
    implementado: true,
  },
  {
    codigo: 'INVENTCOSTO',
    nombre: 'COSTO TOTAL INVENTARIO',
    parametros: ['empnit', 'ventadia'],
    implementado: true,
  },
];

function normalizeReportCode(raw) {
  return String(raw || '').trim().toUpperCase();
}

function findReportDefinition(codigo) {
  const key = normalizeReportCode(codigo);
  return EXTERNAL_REPORTS.find((r) => r.codigo === key) || null;
}

function buildMensajePath(empnit, codigo) {
  const params = new URLSearchParams({
    empnit: String(empnit || '').trim(),
    ventadia: normalizeReportCode(codigo),
  });
  return `/api/consultas-externas/mensaje?${params.toString()}`;
}

function listReportsCatalog(empnit) {
  const emp = String(empnit || '').trim();
  return EXTERNAL_REPORTS.map((r) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    parametros: [...r.parametros],
    implementado: Boolean(r.implementado),
    path: buildMensajePath(emp, r.codigo),
  }));
}

/** Parámetro opcional fecha=YYYY-MM-DD (día o cualquier fecha del mes en VENTAMES). */
function optionalFechaQueryParam(raw) {
  const iso = String(raw ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function formatQuetzales(amount) {
  const n = roundMoney(amount);
  return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function allAmountsZero(amounts) {
  return amounts.every((n) => roundMoney(n) === 0);
}

function mensajeOsinDatos(amounts, buildFullMensaje) {
  if (allAmountsZero(amounts)) return MSG_SIN_DATOS;
  return buildFullMensaje();
}

function sqlDeclareRangoDia(useFechaParam) {
  if (useFechaParam) {
    return `
      DECLARE @DESDE DATE = @FECHA;
      DECLARE @HASTA DATE = @FECHA;
    `;
  }
  return `
      DECLARE @DESDE DATE = CAST(GETDATE() AS DATE);
      DECLARE @HASTA DATE = @DESDE;
    `;
}

function sqlDeclareRangoMes(useFechaParam) {
  if (useFechaParam) {
    return `
      DECLARE @REF DATE = @FECHA;
      DECLARE @DESDE DATE = DATEFROMPARTS(YEAR(@REF), MONTH(@REF), 1);
      DECLARE @HASTA DATE = EOMONTH(@REF);
    `;
  }
  return `
      DECLARE @REF DATE = CAST(GETDATE() AS DATE);
      DECLARE @DESDE DATE = DATEFROMPARTS(YEAR(@REF), MONTH(@REF), 1);
      DECLARE @HASTA DATE = EOMONTH(@REF);
    `;
}

function sqlWhereVentas() {
  return `
    ${SQL_DOC_EMP_FECHA_BASE}
    AND ${SQL_TIPODOC_REPORTES_SI}
    AND (
      LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_VENTA_IN})
      OR LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_DEV_IN})
    )
  `;
}

function sqlWhereVentasYCompras() {
  return `
    ${SQL_DOC_EMP_FECHA_BASE}
    AND (
      (
        ${SQL_TIPODOC_REPORTES_SI}
        AND (
          LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_VENTA_IN})
          OR LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_DEV_IN})
        )
      )
      OR LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_COMPRA_IN})
    )
  `;
}

function sqlSumVentasContadoCreditoNotas() {
  return `
        ISNULL(SUM(
          CASE
            WHEN LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_VENTA_IN})
              AND ${SQL_TIPOM_MOVIMIENTO}
              AND ISNULL(d.CONCRE, 'CON') <> 'CRE'
              THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END
        ), 0) AS ventasContado,
        ISNULL(SUM(
          CASE
            WHEN LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_VENTA_IN})
              AND ${SQL_TIPOM_MOVIMIENTO}
              AND ISNULL(d.CONCRE, 'CON') = 'CRE'
              THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END
        ), 0) AS ventasCredito,
        ISNULL(SUM(
          CASE
            WHEN LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_DEV_IN})
              AND ${SQL_TIPOM_MOVIMIENTO}
              THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END
        ), 0) AS notasCredito`;
}

function buildVentasDiaTotalesSql(useFechaParam) {
  return `
      ${sqlDeclareRangoDia(useFechaParam)}
      SELECT
        CONVERT(char(10), @DESDE, 120) AS fechaConsulta,
        ${sqlSumVentasContadoCreditoNotas()}
      FROM dbo.DOCUMENTOS d
      ${SQL_JOIN_DOC_TIPODOC}
      WHERE ${sqlWhereVentas()}
    `;
}

function buildVentasMesTotalesSql(useFechaParam) {
  return `
      ${sqlDeclareRangoMes(useFechaParam)}
      SELECT
        CONCAT(YEAR(@DESDE), '-', RIGHT('0' + CAST(MONTH(@DESDE) AS varchar(2)), 2)) AS fechaConsulta,
        ${sqlSumVentasContadoCreditoNotas()},
        ISNULL(SUM(
          CASE
            WHEN LTRIM(RTRIM(t.TIPODOC)) IN (${SQL_TIPODOC_COMPRA_IN})
              THEN ISNULL(d.TOTALPRECIO, 0)
            ELSE 0
          END
        ), 0) AS comprasTotal
      FROM dbo.DOCUMENTOS d
      ${SQL_JOIN_DOC_TIPODOC}
      WHERE ${sqlWhereVentasYCompras()}
    `;
}

async function runTotalesQuery(pool, sql, empnit, fechaIso, buildSql) {
  const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
  if (fechaIso) {
    request.input('FECHA', sql.Date, fechaIso);
  }
  const result = await request.query(buildSql(Boolean(fechaIso)));
  return result.recordset?.[0] || {};
}

async function fetchVentasDiaTotales(pool, sql, empnit, fechaIso) {
  const row = await runTotalesQuery(pool, sql, empnit, fechaIso, buildVentasDiaTotalesSql);
  return {
    fechaConsulta: String(row.fechaConsulta || fechaIso || '').trim(),
    ventasContado: roundMoney(row.ventasContado),
    ventasCredito: roundMoney(row.ventasCredito),
    notasCredito: roundMoney(row.notasCredito),
  };
}

async function fetchVentasMesTotales(pool, sql, empnit, fechaIso) {
  const row = await runTotalesQuery(pool, sql, empnit, fechaIso, buildVentasMesTotalesSql);
  return {
    fechaConsulta: String(row.fechaConsulta || '').trim(),
    ventasContado: roundMoney(row.ventasContado),
    ventasCredito: roundMoney(row.ventasCredito),
    notasCredito: roundMoney(row.notasCredito),
    comprasTotal: roundMoney(row.comprasTotal),
  };
}

function buildVentasDiaMensaje(totales) {
  const contado = formatQuetzales(totales.ventasContado);
  const credito = formatQuetzales(totales.ventasCredito);
  const notas = formatQuetzales(totales.notasCredito);
  return (
    `Las ventas al contado son ${contado} quetzales, las ventas al crédito son ${credito} quetzales, ` +
    `se han ingresado ${notas} en notas de crédito`
  );
}

function buildVentasMesMensaje(totales) {
  const contado = formatQuetzales(totales.ventasContado);
  const credito = formatQuetzales(totales.ventasCredito);
  const notas = formatQuetzales(totales.notasCredito);
  const compras = formatQuetzales(totales.comprasTotal);
  return (
    `Las ventas al contado del mes son ${contado} quetzales, las ventas al crédito del mes son ${credito} quetzales, ` +
    `se han ingresado ${notas} en notas de crédito, el total de compras del mes es ${compras} quetzales`
  );
}

async function fetchCuentasPagarTotal(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ISNULL(SUM(ISNULL(d.DOC_SALDO, 0)), 0) AS total
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE LTRIM(RTRIM(d.EMPNIT)) = LTRIM(RTRIM(@EMPNIT))
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${SQL_DOC_SALDO_PENDIENTE_POSITIVO}
    `);
  return roundMoney(result.recordset?.[0]?.total);
}

async function fetchCuentasCobrarTotal(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ISNULL(SUM(ISNULL(d.DOC_SALDO, 0)), 0) AS total
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE LTRIM(RTRIM(d.EMPNIT)) = LTRIM(RTRIM(@EMPNIT))
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
        AND d.STATUS = '${STATUS_OPERADO}'
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${SQL_TIPODOC_REPORTES_SI}
        AND ${SQL_DOC_SALDO_PENDIENTE_POSITIVO}
    `);
  return roundMoney(result.recordset?.[0]?.total);
}

async function fetchInventarioTotalCosto(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ISNULL(SUM(
        CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4))
      ), 0) AS totalCosto
      FROM (
        SELECT MIN(i2.ID) AS ID
        FROM dbo.INVSALDO i2
        WHERE i2.EMPNIT = @EMPNIT
        GROUP BY LTRIM(RTRIM(i2.CODPROD))
      ) pick
      INNER JOIN dbo.INVSALDO i ON i.ID = pick.ID
      LEFT JOIN dbo.PRODUCTOS p
        ON i.EMPNIT = p.EMPNIT AND LTRIM(RTRIM(i.CODPROD)) = LTRIM(RTRIM(p.CODPROD))
      WHERE i.EMPNIT = @EMPNIT
    `);
  return roundMoney(result.recordset?.[0]?.totalCosto);
}

function buildCuentasPagarMensaje(total) {
  return `El monto de cuentas por pagar actual es de ${formatQuetzales(total)} quetzales`;
}

function buildCuentasCobrarMensaje(total) {
  return `El monto de cuentas por cobrar actual es de ${formatQuetzales(total)} quetzales`;
}

function buildInventarioCostoMensaje(total) {
  return `El total costo del inventario es de ${formatQuetzales(total)} quetzales`;
}

async function resolveReportMensaje(pool, sql, empnit, codigo, opts = {}) {
  const def = findReportDefinition(codigo);
  if (!def) {
    const err = new Error(`Código de reporte desconocido: ${codigo || '(vacío)'}`);
    err.statusCode = 400;
    throw err;
  }

  /** VENTADIA: siempre día calendario del servidor SQL (GETDATE), sin fecha del cliente. */
  const fechaIso =
    def.codigo === 'VENTADIA'
      ? null
      : optionalFechaQueryParam(opts.fecha);

  if (def.codigo === 'VENTADIA') {
    const totales = await fetchVentasDiaTotales(pool, sql, empnit, null);
    const amounts = [totales.ventasContado, totales.ventasCredito, totales.notasCredito];
    return {
      codigo: def.codigo,
      fecha: totales.fechaConsulta,
      mensaje: mensajeOsinDatos(amounts, () => buildVentasDiaMensaje(totales)),
      totales,
    };
  }

  if (def.codigo === 'VENTAMES') {
    const totales = await fetchVentasMesTotales(pool, sql, empnit, fechaIso);
    const amounts = [
      totales.ventasContado,
      totales.ventasCredito,
      totales.notasCredito,
      totales.comprasTotal,
    ];
    return {
      codigo: def.codigo,
      fecha: totales.fechaConsulta,
      mensaje: mensajeOsinDatos(amounts, () => buildVentasMesMensaje(totales)),
      totales,
    };
  }

  if (def.codigo === 'CUENTAPAGAR') {
    const total = await fetchCuentasPagarTotal(pool, sql, empnit);
    return {
      codigo: def.codigo,
      mensaje: mensajeOsinDatos([total], () => buildCuentasPagarMensaje(total)),
      total,
    };
  }

  if (def.codigo === 'CUENTACOBRAR') {
    const total = await fetchCuentasCobrarTotal(pool, sql, empnit);
    return {
      codigo: def.codigo,
      mensaje: mensajeOsinDatos([total], () => buildCuentasCobrarMensaje(total)),
      total,
    };
  }

  if (def.codigo === 'INVENTCOSTO') {
    const total = await fetchInventarioTotalCosto(pool, sql, empnit);
    return {
      codigo: def.codigo,
      mensaje: mensajeOsinDatos([total], () => buildInventarioCostoMensaje(total)),
      total,
    };
  }

  const err = new Error('Reporte no disponible');
  err.statusCode = 501;
  throw err;
}

module.exports = {
  EXTERNAL_REPORTS,
  normalizeReportCode,
  findReportDefinition,
  buildMensajePath,
  listReportsCatalog,
  optionalFechaQueryParam,
  buildVentasDiaTotalesSql,
  buildVentasMesTotalesSql,
  resolveReportMensaje,
};
