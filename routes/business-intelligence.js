const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  SQL_TIPODOC_VENTA_IN,
  SQL_TIPODOC_REPORTE_IN,
  SQL_DOC_IMPORTE_REPORTE,
  SQL_DOC_COSTO_REPORTE,
  SQL_SIGNO_LINEA_IMPORTE,
} = require('../lib/reportes-ventas-neto');
const { STATUS_ANULADO, SQL_TIPODOC_REPORTES_SI } = require('../lib/documento-status');
const { SQL_TIPODOC_CUENTAS_COBRAR_IN, SQL_DOC_SALDO_PENDIENTE_POSITIVO } = require('../lib/cuentas-docs');

const router = express.Router();

const SQL_COMPRAS_IN = "'COM', 'COP'";

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido' });
    return null;
  }
  return empnit;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (Math.abs(p) < 0.0005) return c > 0 ? 100 : 0;
  return roundMoney(((c - p) / Math.abs(p)) * 100);
}

function addMonths(y, m, delta) {
  let year = y;
  let month = m + delta;
  while (month < 1) {
    month += 12;
    year -= 1;
  }
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  return { year, month };
}

function parsePeriod(req) {
  const now = new Date();
  let anio = parseInt(req.query.anio, 10);
  let mes = parseInt(req.query.mes, 10);
  if (!Number.isFinite(anio) || anio < 1990 || anio > 2100) anio = now.getFullYear();
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) mes = now.getMonth() + 1;
  const prev = addMonths(anio, mes, -1);
  return { anio, mes, prevAnio: prev.year, prevMes: prev.month };
}

router.get('/dashboard', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { anio, mes, prevAnio, prevMes } = parsePeriod(req);

  try {
    const pool = await req.app.locals.getDbPool();
    const base = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ANIO', sql.Int, anio)
      .input('MES', sql.Int, mes)
      .input('PREV_ANIO', sql.Int, prevAnio)
      .input('PREV_MES', sql.Int, prevMes);

    const [
      kpiMes,
      kpiPrev,
      ventas12,
      ventasDia,
      ventasHora,
      topProductos,
      ventasMarca,
      contadoCredito,
      cxcTotal,
      cxcEdad,
      comprasMes,
      topClientes,
      stockCritico,
      docsMes,
    ] = await Promise.all([
      base.query(`
        SELECT
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe,
          ISNULL(SUM(${SQL_DOC_COSTO_REPORTE}), 0) AS costo,
          COUNT(*) AS documentos
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_REPORTE_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
      `),
      base.query(`
        SELECT
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe,
          ISNULL(SUM(${SQL_DOC_COSTO_REPORTE}), 0) AS costo
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND d.ANIO = @PREV_ANIO AND d.MES = @PREV_MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_REPORTE_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
      `),
      base.query(`
        SELECT TOP 12 d.ANIO, d.MES,
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe,
          ISNULL(SUM(${SQL_DOC_COSTO_REPORTE}), 0) AS costo
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_REPORTE_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
          AND (d.ANIO * 100 + d.MES) <= (@ANIO * 100 + @MES)
        GROUP BY d.ANIO, d.MES
        ORDER BY d.ANIO DESC, d.MES DESC
      `),
      base.query(`
        SELECT CAST(d.FECHA AS DATE) AS dia,
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_REPORTE_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
        GROUP BY CAST(d.FECHA AS DATE)
        ORDER BY dia
      `),
      base.query(`
        SELECT ISNULL(d.HORA, 0) AS hora,
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe,
          COUNT(*) AS docs
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
        GROUP BY ISNULL(d.HORA, 0)
        ORDER BY hora
      `),
      base.query(`
        SELECT TOP 8
          LTRIM(RTRIM(dp.CODPROD)) AS codprod,
          LTRIM(RTRIM(ISNULL(dp.DESPROD, ''))) AS desprod,
          ISNULL(SUM(${SQL_SIGNO_LINEA_IMPORTE}), 0) AS importe,
          ISNULL(SUM(ABS(dp.TOTALUNIDADES)), 0) AS unidades
        FROM dbo.DOCPRODUCTOS dp
        INNER JOIN dbo.DOCUMENTOS d ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
        GROUP BY LTRIM(RTRIM(dp.CODPROD)), LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))
        HAVING ISNULL(SUM(${SQL_SIGNO_LINEA_IMPORTE}), 0) > 0
        ORDER BY importe DESC
      `),
      base.query(`
        SELECT TOP 8
          ISNULL(NULLIF(LTRIM(RTRIM(m.DESMARCA)), ''), 'Sin marca') AS marca,
          ISNULL(SUM(${SQL_SIGNO_LINEA_IMPORTE}), 0) AS importe
        FROM dbo.DOCPRODUCTOS dp
        INNER JOIN dbo.DOCUMENTOS d ON dp.EMPNIT = d.EMPNIT AND dp.CODDOC = d.CODDOC AND dp.CORRELATIVO = d.CORRELATIVO
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        LEFT JOIN dbo.PRODUCTOS p ON p.EMPNIT = dp.EMPNIT AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(dp.CODPROD))
        LEFT JOIN dbo.MARCAS m ON m.EMPNIT = p.EMPNIT AND m.CODMARCA = p.CODMARCA
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
        GROUP BY ISNULL(NULLIF(LTRIM(RTRIM(m.DESMARCA)), ''), 'Sin marca')
        HAVING ISNULL(SUM(${SQL_SIGNO_LINEA_IMPORTE}), 0) > 0
        ORDER BY importe DESC
      `),
      base.query(`
        SELECT
          ISNULL(SUM(CASE WHEN ISNULL(d.CONCRE, 'CON') = 'CRE' THEN ${SQL_DOC_IMPORTE_REPORTE} ELSE 0 END), 0) AS credito,
          ISNULL(SUM(CASE WHEN ISNULL(d.CONCRE, 'CON') <> 'CRE' THEN ${SQL_DOC_IMPORTE_REPORTE} ELSE 0 END), 0) AS contado
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
      `),
      base.query(`
        SELECT ISNULL(SUM(ISNULL(d.DOC_SALDO, 0)), 0) AS total
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND ISNULL(d.CONCRE, 'CON') = 'CRE'
          AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
          AND d.STATUS = 'O'
          AND ${SQL_TIPODOC_REPORTES_SI}
          AND ${SQL_DOC_SALDO_PENDIENTE_POSITIVO}
      `),
      base.query(`
        SELECT
          ISNULL(SUM(CASE WHEN DATEDIFF(day, CAST(d.FECHA AS date), CAST(GETDATE() AS date)) <= 30 THEN ISNULL(d.DOC_SALDO, 0) ELSE 0 END), 0) AS d0_30,
          ISNULL(SUM(CASE WHEN DATEDIFF(day, CAST(d.FECHA AS date), CAST(GETDATE() AS date)) BETWEEN 31 AND 60 THEN ISNULL(d.DOC_SALDO, 0) ELSE 0 END), 0) AS d31_60,
          ISNULL(SUM(CASE WHEN DATEDIFF(day, CAST(d.FECHA AS date), CAST(GETDATE() AS date)) BETWEEN 61 AND 90 THEN ISNULL(d.DOC_SALDO, 0) ELSE 0 END), 0) AS d61_90,
          ISNULL(SUM(CASE WHEN DATEDIFF(day, CAST(d.FECHA AS date), CAST(GETDATE() AS date)) > 90 THEN ISNULL(d.DOC_SALDO, 0) ELSE 0 END), 0) AS d90_plus
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT
          AND ISNULL(d.CONCRE, 'CON') = 'CRE'
          AND t.TIPODOC IN (${SQL_TIPODOC_CUENTAS_COBRAR_IN})
          AND d.STATUS = 'O'
          AND ${SQL_TIPODOC_REPORTES_SI}
          AND ${SQL_DOC_SALDO_PENDIENTE_POSITIVO}
      `),
      base.query(`
        SELECT ISNULL(SUM(ISNULL(d.TOTALCOSTO, 0)), 0) AS compras
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_COMPRAS_IN})
      `),
      base.query(`
        SELECT TOP 6
          LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, ''))) AS cliente,
          ISNULL(SUM(${SQL_DOC_IMPORTE_REPORTE}), 0) AS importe
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
          AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          AND ${SQL_TIPODOC_REPORTES_SI}
        GROUP BY LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, '')))
        HAVING LTRIM(RTRIM(ISNULL(d.DOC_NOMCLIE, ''))) <> ''
        ORDER BY importe DESC
      `),
      base.query(`
        SELECT TOP 6
          LTRIM(RTRIM(p.CODPROD)) AS codprod,
          LTRIM(RTRIM(p.DESPROD)) AS desprod,
          ISNULL(p.EXISTENCIA, 0) AS existencia,
          ISNULL(p.INVMINIMO, 0) AS invminimo
        FROM dbo.PRODUCTOS p
        WHERE p.EMPNIT = @EMPNIT
          AND ISNULL(p.INVMINIMO, 0) > 0
          AND ISNULL(p.EXISTENCIA, 0) < ISNULL(p.INVMINIMO, 0)
          AND ISNULL(p.FACTURAR, 'SI') = 'SI'
        ORDER BY (ISNULL(p.INVMINIMO, 0) - ISNULL(p.EXISTENCIA, 0)) DESC, p.DESPROD
      `),
      base.query(`
        SELECT COUNT(*) AS operados
        FROM dbo.DOCUMENTOS d
        INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.ANIO = @ANIO AND d.MES = @MES
          AND d.STATUS = 'O'
          AND ${SQL_TIPODOC_REPORTES_SI}
      `),
    ]);

    const km = kpiMes.recordset[0] || {};
    const kp = kpiPrev.recordset[0] || {};
    const importeMes = roundMoney(km.importe);
    const costoMes = roundMoney(km.costo);
    const utilidadMes = roundMoney(importeMes - costoMes);
    const margenMes = importeMes > 0 ? roundMoney((utilidadMes / importeMes) * 100) : 0;
    const importePrev = roundMoney(kp.importe);

    const meses = [...(ventas12.recordset || [])].reverse().map((r) => ({
      anio: r.ANIO,
      mes: r.MES,
      label: `${String(r.MES).padStart(2, '0')}/${r.ANIO}`,
      importe: roundMoney(r.importe),
      utilidad: roundMoney(Number(r.importe) - Number(r.costo)),
    }));

    const cc = contadoCredito.recordset[0] || {};
    const edad = cxcEdad.recordset[0] || {};

    res.json({
      periodo: { anio, mes, prevAnio, prevMes },
      generado: new Date().toISOString(),
      kpis: {
        ventas: importeMes,
        ventasVariacion: pctChange(importeMes, importePrev),
        ventasAnterior: importePrev,
        utilidad: utilidadMes,
        margen: margenMes,
        documentosVentas: Number(km.documentos) || 0,
        documentosOperados: Number(docsMes.recordset[0]?.operados) || 0,
        compras: roundMoney(comprasMes.recordset[0]?.compras),
        cxcPendiente: roundMoney(cxcTotal.recordset[0]?.total),
      },
      series: {
        ventas12Meses: meses,
        ventasPorDia: (ventasDia.recordset || []).map((r) => ({
          dia: r.dia,
          importe: roundMoney(r.importe),
        })),
        ventasPorHora: (ventasHora.recordset || []).map((r) => ({
          hora: Number(r.hora) || 0,
          importe: roundMoney(r.importe),
          documentos: Number(r.docs) || 0,
        })),
      },
      rankings: {
        productos: (topProductos.recordset || []).map((r) => ({
          codprod: r.codprod,
          desprod: r.desprod,
          importe: roundMoney(r.importe),
          unidades: roundMoney(r.unidades),
        })),
        marcas: (ventasMarca.recordset || []).map((r) => ({
          marca: r.marca,
          importe: roundMoney(r.importe),
        })),
        clientes: (topClientes.recordset || []).map((r) => ({
          cliente: r.cliente,
          importe: roundMoney(r.importe),
        })),
      },
      cartera: {
        contado: roundMoney(cc.contado),
        credito: roundMoney(cc.credito),
        antiguedad: {
          d0_30: roundMoney(edad.d0_30),
          d31_60: roundMoney(edad.d31_60),
          d61_90: roundMoney(edad.d61_90),
          d90_plus: roundMoney(edad.d90_plus),
        },
      },
      alertas: {
        stockBajo: (stockCritico.recordset || []).map((r) => ({
          codprod: r.codprod,
          desprod: r.desprod,
          existencia: roundMoney(r.existencia),
          invminimo: roundMoney(r.invminimo),
        })),
      },
    });
  } catch (err) {
    console.warn('[API GET /business-intelligence/dashboard]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;