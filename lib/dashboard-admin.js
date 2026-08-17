const { TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('./corte-caja-docs');
const { SQL_STATUS_INFORMES, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');

/** Ventas: FAC + tipos FEL (FEF/FES/FEC y legacy FEL). */
const TIPODOC_VENTA_DASHBOARD = [...TIPODOC_FACTURA, 'FEL'].filter((v, i, a) => a.indexOf(v) === i);
const TIPODOC_COMPRAS_DASHBOARD = ['COM', 'COP'];

const SQL_TIPODOC_VENTA_IN = TIPODOC_FACTURA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_VENTA_DASH_IN = TIPODOC_VENTA_DASHBOARD.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_COMPRAS_DASH_IN = TIPODOC_COMPRAS_DASHBOARD.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_DEV_IN = TIPODOC_DEVOLUCION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_VENTAS_DEV_IN = [...TIPODOC_FACTURA, ...TIPODOC_DEVOLUCION]
  .map((t) => `'${t}'`)
  .join(', ');

/** Una fila de INVSALDO por producto (misma lógica que inventario/saldo). */
const INV_SALDO_UNICO = `
  (
    SELECT i.*
    FROM (
      SELECT
        i2.*,
        ROW_NUMBER() OVER (
          PARTITION BY i2.EMPNIT, LTRIM(RTRIM(i2.CODPROD))
          ORDER BY i2.ID
        ) AS _rn
      FROM dbo.INVSALDO i2
      WHERE i2.EMPNIT = @EMPNIT
    ) i
    WHERE i._rn = 1
  ) i
`;

function parseMesAnio(mesRaw, anioRaw) {
  const mes = parseInt(mesRaw, 10);
  const anio = parseInt(anioRaw, 10);
  if (Number.isNaN(mes) || mes < 1 || mes > 12) return null;
  if (Number.isNaN(anio) || anio < 2020 || anio > 2035) return null;
  return { mes, anio };
}

function daysInMonth(anio, mes) {
  return new Date(anio, mes, 0).getDate();
}

function isoDate(anio, mes, dia) {
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fillVentasPorDia(rows, anio, mes) {
  const map = new Map();
  for (const r of rows) {
    const dia = Number(r.DIA) || 0;
    if (dia > 0) map.set(dia, r);
  }
  const totalDays = daysInMonth(anio, mes);
  const result = [];
  for (let dia = 1; dia <= totalDays; dia += 1) {
    const r = map.get(dia);
    const ventas = toNumber(r?.VENTAS);
    const devoluciones = toNumber(r?.DEVOLUCIONES);
    result.push({
      dia,
      fecha: isoDate(anio, mes, dia),
      ventas,
      devoluciones,
      neto: ventas - devoluciones,
      documentos: toNumber(r?.DOCUMENTOS),
    });
  }
  return result;
}

function buildProyeccionMes(ventasPorDia, anio, mes, hoy = new Date()) {
  const lastDay = daysInMonth(anio, mes);
  const hoyAnio = hoy.getFullYear();
  const hoyMes = hoy.getMonth() + 1;
  const hoyDia = hoy.getDate();

  let diaCorte;
  if (anio < hoyAnio || (anio === hoyAnio && mes < hoyMes)) {
    diaCorte = lastDay;
  } else if (anio > hoyAnio || (anio === hoyAnio && mes > hoyMes)) {
    diaCorte = 0;
  } else {
    diaCorte = Math.min(hoyDia, lastDay);
  }

  const diasTranscurridos = diaCorte;
  const diasRestantes = Math.max(0, lastDay - diaCorte);
  const transcurridos = ventasPorDia.filter((d) => d.dia <= diaCorte);
  const totalNetoTranscurrido = transcurridos.reduce((s, d) => s + d.neto, 0);
  const promedioDiario = diasTranscurridos > 0 ? totalNetoTranscurrido / diasTranscurridos : 0;

  const historico = transcurridos.map((d) => ({ ...d, tipo: 'real' }));
  const futuro = [];
  for (let dia = diaCorte + 1; dia <= lastDay; dia += 1) {
    futuro.push({
      dia,
      fecha: isoDate(anio, mes, dia),
      neto: Math.round(promedioDiario * 100) / 100,
      tipo: 'proyeccion',
    });
  }

  const totalProyectadoMes =
    Math.round((totalNetoTranscurrido + promedioDiario * diasRestantes) * 100) / 100;

  return {
    promedioDiario: Math.round(promedioDiario * 100) / 100,
    totalProyectadoMes,
    diasTranscurridos,
    diasRestantes,
    diasMes: lastDay,
    historico,
    futuro,
  };
}

async function fetchVentasPorDia(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        d.DIA,
        CAST(d.FECHA AS DATE) AS FECHA,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS VENTAS,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS DEVOLUCIONES,
        COUNT(*) AS DOCUMENTOS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_VENTAS_DEV_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
      GROUP BY d.DIA, CAST(d.FECHA AS DATE)
      ORDER BY CAST(d.FECHA AS DATE)
    `);
  return fillVentasPorDia(result.recordset, anio, mes);
}

async function fetchResumenVentas(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS VENTAS,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS DEVOLUCIONES,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN}) THEN 1 ELSE 0 END) AS DOCS_VENTA,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN}) THEN 1 ELSE 0 END) AS DOCS_DEV
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_VENTAS_DEV_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
    `);
  const r = result.recordset[0] || {};
  const ventas = toNumber(r.VENTAS);
  const devoluciones = toNumber(r.DEVOLUCIONES);
  return {
    ventasBrutas: ventas,
    devoluciones,
    ventasNetas: ventas - devoluciones,
    documentosVenta: toNumber(r.DOCS_VENTA),
    documentosDevolucion: toNumber(r.DOCS_DEV),
  };
}

async function fetchVentasVsCompras(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_DASH_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS VENTAS,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_COMPRAS_DASH_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS COMPRAS,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_DASH_IN}) THEN 1 ELSE 0 END) AS DOCS_VENTA,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_COMPRAS_DASH_IN}) THEN 1 ELSE 0 END) AS DOCS_COMPRA
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_DASH_IN}, ${SQL_TIPODOC_COMPRAS_DASH_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
    `);
  const r = result.recordset[0] || {};
  return {
    ventas: toNumber(r.VENTAS),
    compras: toNumber(r.COMPRAS),
    documentosVenta: toNumber(r.DOCS_VENTA),
    documentosCompra: toNumber(r.DOCS_COMPRA),
  };
}

async function fetchInventarioPorMarca(pool, sql, empnit) {
  const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    SELECT
      ISNULL(m.CODMARCA, 0) AS CODMARCA,
      ISNULL(NULLIF(LTRIM(RTRIM(m.DESMARCA)), ''), 'Sin marca') AS DESMARCA,
      COUNT(DISTINCT p.CODPROD) AS PRODUCTOS,
      SUM(ISNULL(i.SALDO, 0)) AS SALDO,
      SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4))) AS VALOR_COSTO
    FROM ${INV_SALDO_UNICO}
    INNER JOIN dbo.PRODUCTOS p
      ON i.EMPNIT = p.EMPNIT AND LTRIM(RTRIM(i.CODPROD)) = LTRIM(RTRIM(p.CODPROD))
    LEFT JOIN dbo.Marcas m
      ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
    WHERE i.EMPNIT = @EMPNIT
    GROUP BY m.CODMARCA, m.DESMARCA
    ORDER BY SUM(CAST(ISNULL(p.COSTO, 0) * ISNULL(i.SALDO, 0) AS DECIMAL(18, 4))) DESC
  `);
  return result.recordset.map((r) => ({
    CODMARCA: r.CODMARCA,
    DESMARCA: r.DESMARCA,
    productos: toNumber(r.PRODUCTOS),
    saldo: toNumber(r.SALDO),
    valorCosto: toNumber(r.VALOR_COSTO),
  }));
}

async function fetchVentasPorVendedor(pool, sql, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        ISNULL(emp.CODEMPLEADO, 0) AS CODVEN,
        ISNULL(NULLIF(LTRIM(RTRIM(emp.NOMEMPLEADO)), ''), 'Sin vendedor') AS VENDEDOR,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS VENTAS,
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) AS DEVOLUCIONES,
        COUNT(*) AS DOCUMENTOS
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      LEFT JOIN dbo.Empleados emp
        ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_VENTAS_DEV_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
      GROUP BY emp.CODEMPLEADO, emp.NOMEMPLEADO
      HAVING
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) <> 0
        OR SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_DEV_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) <> 0
      ORDER BY
        SUM(CASE WHEN t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
          THEN ISNULL(d.TOTALPRECIO, 0) ELSE 0 END) DESC
    `);
  return result.recordset.map((r) => ({
    CODVEN: r.CODVEN,
    VENDEDOR: r.VENDEDOR,
    ventas: toNumber(r.VENTAS),
    devoluciones: toNumber(r.DEVOLUCIONES),
    neto: toNumber(r.VENTAS) - toNumber(r.DEVOLUCIONES),
    documentos: toNumber(r.DOCUMENTOS),
  }));
}

async function fetchTopProductosVendidos(pool, sql, empnit, mes, anio, limit = 10) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('TOPN', sql.Int, limit)
    .query(`
      SELECT TOP (@TOPN)
        LTRIM(RTRIM(dp.CODPROD)) AS CODPROD,
        MAX(LTRIM(RTRIM(ISNULL(dp.DESPROD, '')))) AS DESPROD,
        SUM(ISNULL(dp.TOTALPRECIO, 0)) AS TOTALPRECIO,
        SUM(ISNULL(dp.TOTALUNIDADES, 0)) AS TOTALUNIDADES,
        COUNT(*) AS LINEAS
      FROM dbo.DOCPRODUCTOS dp
      INNER JOIN dbo.DOCUMENTOS d
        ON dp.EMPNIT = d.EMPNIT
        AND dp.CODDOC = d.CODDOC
        AND dp.CORRELATIVO = d.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.${SQL_STATUS_INFORMES}
        AND t.TIPODOC IN (${SQL_TIPODOC_VENTA_IN})
        AND ${SQL_TIPODOC_REPORTES_SI}
      GROUP BY LTRIM(RTRIM(dp.CODPROD))
      ORDER BY SUM(ISNULL(dp.TOTALPRECIO, 0)) DESC
    `);
  return result.recordset.map((r, i) => ({
    rank: i + 1,
    CODPROD: r.CODPROD,
    DESPROD: r.DESPROD,
    totalPrecio: toNumber(r.TOTALPRECIO),
    totalUnidades: toNumber(r.TOTALUNIDADES),
    lineas: toNumber(r.LINEAS),
  }));
}

async function fetchSinStockHabilitados(pool, sql, empnit) {
  const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
    SELECT
      p.CODPROD,
      p.DESPROD,
      ISNULL(i.SALDO, 0) AS SALDO,
      ISNULL(p.EXISTENCIA, 0) AS EXISTENCIA,
      ISNULL(m.DESMARCA, '') AS DESMARCA,
      p.HABILITADO
    FROM ${INV_SALDO_UNICO}
    INNER JOIN dbo.PRODUCTOS p
      ON i.EMPNIT = p.EMPNIT AND LTRIM(RTRIM(i.CODPROD)) = LTRIM(RTRIM(p.CODPROD))
    LEFT JOIN dbo.Marcas m
      ON p.EMPNIT = m.EMPNIT AND p.CODMARCA = m.CODMARCA
    WHERE i.EMPNIT = @EMPNIT
      AND UPPER(LTRIM(RTRIM(ISNULL(p.HABILITADO, '')))) = 'SI'
      AND ISNULL(i.SALDO, 0) <= 0
      AND ISNULL(p.EXISTENCIA, 0) <= 0
    ORDER BY p.DESPROD
  `);
  return result.recordset.map((r) => ({
    CODPROD: r.CODPROD,
    DESPROD: r.DESPROD,
    SALDO: toNumber(r.SALDO),
    EXISTENCIA: toNumber(r.EXISTENCIA),
    DESMARCA: r.DESMARCA || '',
    HABILITADO: r.HABILITADO,
  }));
}

async function loadAdminDashboard(pool, sql, empnit, mes, anio) {
  const [
    resumen,
    ventasPorDia,
    ventasVsCompras,
    inventarioPorMarca,
    sinStockItems,
    ventasPorVendedor,
    topProductos,
  ] = await Promise.all([
    fetchResumenVentas(pool, sql, empnit, mes, anio),
    fetchVentasPorDia(pool, sql, empnit, mes, anio),
    fetchVentasVsCompras(pool, sql, empnit, mes, anio),
    fetchInventarioPorMarca(pool, sql, empnit),
    fetchSinStockHabilitados(pool, sql, empnit),
    fetchVentasPorVendedor(pool, sql, empnit, mes, anio),
    fetchTopProductosVendidos(pool, sql, empnit, mes, anio, 10),
  ]);

  const valorInventarioTotal = inventarioPorMarca.reduce((s, m) => s + m.valorCosto, 0);
  const proyeccion = buildProyeccionMes(ventasPorDia, anio, mes);

  return {
    empnit,
    periodo: { mes, anio },
    resumen,
    ventasPorDia,
    ventasVsCompras,
    inventario: {
      valorTotalCosto: Math.round(valorInventarioTotal * 100) / 100,
      marcas: inventarioPorMarca.length,
    },
    sinStock: {
      total: sinStockItems.length,
      items: sinStockItems,
    },
    proyeccion,
    ventasPorVendedor,
    topProductos,
  };
}

module.exports = {
  parseMesAnio,
  loadAdminDashboard,
  TIPODOC_FACTURA,
  TIPODOC_DEVOLUCION,
};
