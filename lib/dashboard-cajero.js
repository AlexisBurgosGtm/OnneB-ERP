/**
 * Dashboard de inicio — Cajero (CODTIPOEMPLEADO = 8).
 * Facturas del día, formas de pago, compras al crédito por vencer y productos vendidos.
 */
const { TIPODOC_FACTURA, SQL_TIPODOC_FACTURA_IN } = require('./corte-caja-docs');
const { SQL_STATUS_INFORMES, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const {
  SQL_TIPODOC_CUENTAS_PAGAR_IN,
  SQL_DOC_SALDO_PENDIENTE,
} = require('./cuentas-pagar-docs');

const CODTIPO_EMPLEADO_CAJERO = 8;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseFechaIso(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

async function fetchFacturasFecha(pool, sql, empnit, fecha) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .query(`
      SELECT
        d.CODDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(d.HORA, 0) AS HORA,
        ISNULL(d.MINUTO, 0) AS MINUTO,
        ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.FPAGO_EFECTIVO, 0) AS FPAGO_EFECTIVO,
        ISNULL(d.FPAGO_TARJETA, 0) AS FPAGO_TARJETA,
        ISNULL(d.FPAGO_DEPOSITO, 0) AS FPAGO_DEPOSITO,
        ISNULL(d.FPAGO_CHEQUE, 0) AS FPAGO_CHEQUE,
        ISNULL(d.CONCRE, 'CON') AS CONCRE,
        ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      LEFT JOIN dbo.Empleados emp
        ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
      WHERE d.EMPNIT = @EMPNIT
        AND CAST(d.FECHA AS DATE) = @FECHA
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
      ORDER BY d.HORA DESC, d.MINUTO DESC, d.CORRELATIVO DESC
    `);
  return result.recordset.map((r) => ({
    CODDOC: r.CODDOC,
    TIPODOC: String(r.TIPODOC ?? '').trim().toUpperCase(),
    CORRELATIVO: r.CORRELATIVO,
    HORA: toNumber(r.HORA),
    MINUTO: toNumber(r.MINUTO),
    DOC_NOMCLIE: String(r.DOC_NOMCLIE ?? '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    FPAGO_EFECTIVO: toNumber(r.FPAGO_EFECTIVO),
    FPAGO_TARJETA: toNumber(r.FPAGO_TARJETA),
    FPAGO_DEPOSITO: toNumber(r.FPAGO_DEPOSITO),
    FPAGO_CHEQUE: toNumber(r.FPAGO_CHEQUE),
    CONCRE: String(r.CONCRE ?? 'CON').trim().toUpperCase(),
    VENDEDOR: String(r.VENDEDOR ?? '').trim(),
  }));
}

function buildFormasPago(facturas) {
  const totales = {
    efectivo: 0,
    tarjeta: 0,
    deposito: 0,
    cheque: 0,
    credito: 0,
    total: 0,
    documentos: facturas.length,
  };
  for (const f of facturas) {
    totales.efectivo += f.FPAGO_EFECTIVO;
    totales.tarjeta += f.FPAGO_TARJETA;
    totales.deposito += f.FPAGO_DEPOSITO;
    totales.cheque += f.FPAGO_CHEQUE;
    if (f.CONCRE === 'CRE') {
      totales.credito += f.TOTALPRECIO;
    }
    totales.total += f.TOTALPRECIO;
  }
  return totales;
}

async function fetchComprasCreditoVencimiento(pool, sql, empnit, fecha) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .query(`
      SELECT
        d.FECHA,
        d.VENCIMIENTO,
        d.CODDOC,
        t.DESDOC,
        t.TIPODOC,
        d.CORRELATIVO,
        ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
        ISNULL(p.EMPRESA, '') AS NEGOCIO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.DOC_SALDO, 0) AS DOC_SALDO,
        ISNULL(d.DOC_ABONO, 0) AS DOC_ABONO,
        ${SQL_DOC_SALDO_PENDIENTE} AS SALDO_PENDIENTE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.PROVEEDORES p
        ON d.EMPNIT = p.EMPNIT AND d.CODCLIENTE = p.CODPROV
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_PAGAR_IN})
        AND d.${SQL_STATUS_INFORMES}
        AND ${SQL_TIPODOC_REPORTES_SI}
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND CAST(d.VENCIMIENTO AS DATE) = @FECHA
      ORDER BY d.CODDOC ASC, d.CORRELATIVO ASC
    `);
  return result.recordset.map((r) => ({
    FECHA: r.FECHA ?? null,
    VENCIMIENTO: r.VENCIMIENTO ?? null,
    CODDOC: r.CODDOC,
    DESDOC: String(r.DESDOC ?? '').trim(),
    TIPODOC: String(r.TIPODOC ?? '').trim().toUpperCase(),
    CORRELATIVO: r.CORRELATIVO,
    DOC_NOMCLIE: String(r.DOC_NOMCLIE ?? '').trim(),
    NEGOCIO: String(r.NEGOCIO ?? '').trim(),
    TOTALPRECIO: toNumber(r.TOTALPRECIO),
    DOC_SALDO: toNumber(r.DOC_SALDO),
    DOC_ABONO: toNumber(r.DOC_ABONO),
    SALDO_PENDIENTE: toNumber(r.SALDO_PENDIENTE),
  }));
}

async function fetchProductosVendidos(pool, sql, empnit, fecha, limit = 15) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .input('TOPN', sql.Int, limit)
    .query(`
      SELECT TOP (@TOPN)
        LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
        MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
        SUM(ISNULL(dp.TOTALPRECIO, 0)) AS TOTALPRECIO,
        SUM(ISNULL(dp.TOTALUNIDADES, 0)) AS TOTALUNIDADES
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT
        AND dp.CODDOC = d.CODDOC
        AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND CAST(d.FECHA AS DATE) = @FECHA
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
      GROUP BY LTRIM(RTRIM(dp.CODPROD))
      ORDER BY SUM(ISNULL(dp.TOTALPRECIO, 0)) DESC
    `);
  return result.recordset.map((r, i) => ({
    rank: i + 1,
    CODPROD: r.CODPROD,
    DESPROD: String(r.DESPROD ?? '').trim(),
    totalPrecio: toNumber(r.TOTALPRECIO),
    totalUnidades: toNumber(r.TOTALUNIDADES),
  }));
}

async function loadCajeroDashboard(pool, sql, empnit, fecha) {
  const [facturas, comprasVencimiento, productosVendidos] = await Promise.all([
    fetchFacturasFecha(pool, sql, empnit, fecha),
    fetchComprasCreditoVencimiento(pool, sql, empnit, fecha),
    fetchProductosVendidos(pool, sql, empnit, fecha),
  ]);
  const formasPago = buildFormasPago(facturas);
  const sumComprasVenc = comprasVencimiento.reduce((s, r) => s + r.SALDO_PENDIENTE, 0);
  return {
    empnit,
    fecha,
    facturas,
    formasPago,
    comprasVencimiento,
    totalesComprasVencimiento: {
      documentos: comprasVencimiento.length,
      saldoPendiente: sumComprasVenc,
    },
    productosVendidos,
    tiposFactura: TIPODOC_FACTURA,
  };
}

module.exports = {
  CODTIPO_EMPLEADO_CAJERO,
  parseFechaIso,
  loadCajeroDashboard,
};
