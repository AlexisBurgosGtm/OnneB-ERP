/**
 * Dashboard de inicio — Vendedor (CODTIPOEMPLEADO = 3).
 * Gráficas de pedidos/facturas por vendedor (mes/año) y lista de documentos por fecha.
 */
const CODTIPO_EMPLEADO_VENDEDOR = 3;

const { SQL_TIPODOC_REPORTES_SI } = require('./documento-status');

const TIPODOC_FACTURA = ['FAC', 'FEF', 'FEC', 'FES'];
const TIPODOC_PEDIDO = ['ENV'];
const TIPODOC_COTIZACION = ['COT'];

const SQL_TIPODOC_FACTURA_IN = TIPODOC_FACTURA.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_PEDIDO_IN = TIPODOC_PEDIDO.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_COTIZACION_IN = TIPODOC_COTIZACION.map((t) => `'${t}'`).join(', ');
const SQL_TIPODOC_TODOS_IN = [...TIPODOC_FACTURA, ...TIPODOC_PEDIDO, ...TIPODOC_COTIZACION]
  .map((t) => `'${t}'`)
  .join(', ');

/** Grupos de documento admitidos en el filtro de la lista. */
const GRUPO_SQL_IN = {
  facturas: SQL_TIPODOC_FACTURA_IN,
  pedidos: SQL_TIPODOC_PEDIDO_IN,
  cotizaciones: SQL_TIPODOC_COTIZACION_IN,
  todos: SQL_TIPODOC_TODOS_IN,
};

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function parseMesAnio(mesRaw, anioRaw) {
  const mes = parseInt(mesRaw, 10);
  const anio = parseInt(anioRaw, 10);
  if (Number.isNaN(mes) || mes < 1 || mes > 12) return null;
  if (Number.isNaN(anio) || anio < 2020 || anio > 2035) return null;
  return { mes, anio };
}

function parseFechaIso(raw) {
  const s = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeGrupo(raw) {
  const s = String(raw || 'todos').trim().toLowerCase();
  return GRUPO_SQL_IN[s] ? s : 'todos';
}

function parseCodven(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim().toLowerCase();
  if (s === '' || s === 'todos') return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

async function fetchVendedores(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODTIPO', sql.Int, CODTIPO_EMPLEADO_VENDEDOR)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODTIPOEMPLEADO = @CODTIPO AND ACTIVO = 'SI'
      ORDER BY NOMEMPLEADO ASC
    `);
  return result.recordset.map((r) => ({
    CODEMPLEADO: r.CODEMPLEADO,
    NOMEMPLEADO: String(r.NOMEMPLEADO ?? '').trim(),
  }));
}

async function fetchPorVendedor(pool, sql, empnit, mes, anio, sqlTipodocIn) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        ISNULL(emp.CODEMPLEADO, 0) AS CODVEN,
        ISNULL(NULLIF(LTRIM(RTRIM(emp.NOMEMPLEADO)), ''), 'Sin vendedor') AS VENDEDOR,
        COUNT(*) AS DOCUMENTOS,
        SUM(ISNULL(d.TOTALPRECIO, 0)) AS IMPORTE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      LEFT JOIN dbo.Empleados emp
        ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND d.STATUS <> 'A'
        AND t.TIPODOC IN (${sqlTipodocIn})
        AND ${SQL_TIPODOC_REPORTES_SI}
      GROUP BY emp.CODEMPLEADO, emp.NOMEMPLEADO
      HAVING COUNT(*) > 0
      ORDER BY COUNT(*) DESC
    `);
  return result.recordset.map((r) => ({
    CODVEN: r.CODVEN,
    VENDEDOR: r.VENDEDOR,
    documentos: toNumber(r.DOCUMENTOS),
    importe: toNumber(r.IMPORTE),
  }));
}

async function fetchDocumentosFecha(pool, sql, empnit, fecha, codven, sqlTipodocIn) {
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha);
  let codvenFilter = '';
  if (codven !== null) {
    request.input('CODVEN', sql.Int, codven);
    codvenFilter = ' AND d.CODVEN = @CODVEN';
  }
  const result = await request.query(`
    SELECT
      d.CODDOC,
      t.TIPODOC,
      d.CORRELATIVO,
      ISNULL(d.HORA, 0) AS HORA,
      ISNULL(d.MINUTO, 0) AS MINUTO,
      ISNULL(d.DOC_NOMCLIE, '') AS DOC_NOMCLIE,
      ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
      ISNULL(d.CODVEN, 0) AS CODVEN,
      ISNULL(emp.NOMEMPLEADO, '') AS VENDEDOR
    FROM dbo.DOCUMENTOS d
    INNER JOIN dbo.TIPODOCUMENTOS t
      ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
    LEFT JOIN dbo.Empleados emp
      ON emp.EMPNIT = d.EMPNIT AND emp.CODEMPLEADO = d.CODVEN
    WHERE d.EMPNIT = @EMPNIT
      AND CAST(d.FECHA AS DATE) = @FECHA
      AND d.STATUS <> 'A'
      AND t.TIPODOC IN (${sqlTipodocIn})
      AND ${SQL_TIPODOC_REPORTES_SI}
      ${codvenFilter}
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
    CODVEN: r.CODVEN,
    VENDEDOR: String(r.VENDEDOR ?? '').trim(),
  }));
}

function grupoDeTipodoc(tipodoc) {
  const t = String(tipodoc || '').trim().toUpperCase();
  if (TIPODOC_FACTURA.includes(t)) return 'facturas';
  if (TIPODOC_PEDIDO.includes(t)) return 'pedidos';
  if (TIPODOC_COTIZACION.includes(t)) return 'cotizaciones';
  return null;
}

function buildTotales(rows) {
  const base = () => ({ documentos: 0, importe: 0 });
  const totales = {
    facturas: base(),
    pedidos: base(),
    cotizaciones: base(),
    total: base(),
  };
  for (const r of rows) {
    const g = grupoDeTipodoc(r.TIPODOC);
    if (g && totales[g]) {
      totales[g].documentos += 1;
      totales[g].importe += r.TOTALPRECIO;
    }
    totales.total.documentos += 1;
    totales.total.importe += r.TOTALPRECIO;
  }
  return totales;
}

/** Gráficas por vendedor (mes/año) + lista de vendedores para el filtro. */
async function loadVendedorResumen(pool, sql, empnit, mes, anio) {
  const [vendedores, pedidosPorVendedor, facturasPorVendedor] = await Promise.all([
    fetchVendedores(pool, sql, empnit),
    fetchPorVendedor(pool, sql, empnit, mes, anio, SQL_TIPODOC_PEDIDO_IN),
    fetchPorVendedor(pool, sql, empnit, mes, anio, SQL_TIPODOC_FACTURA_IN),
  ]);
  return {
    empnit,
    periodo: { mes, anio },
    vendedores,
    pedidosPorVendedor,
    facturasPorVendedor,
  };
}

/** Lista de documentos de una fecha (filtros por vendedor y grupo) + totales para cards. */
async function loadVendedorDocumentos(pool, sql, empnit, { fecha, codven, grupo }) {
  const grupoNorm = normalizeGrupo(grupo);
  const sqlTipodocIn = GRUPO_SQL_IN[grupoNorm];
  // Las cards totalizan todos los grupos de la fecha/vendedor (independiente del filtro de grupo).
  const [rows, rowsTotales] = await Promise.all([
    fetchDocumentosFecha(pool, sql, empnit, fecha, codven, sqlTipodocIn),
    grupoNorm === 'todos'
      ? null
      : fetchDocumentosFecha(pool, sql, empnit, fecha, codven, SQL_TIPODOC_TODOS_IN),
  ]);
  const totales = buildTotales(rowsTotales || rows);
  return {
    empnit,
    fecha,
    codven,
    grupo: grupoNorm,
    rows,
    totales,
  };
}

module.exports = {
  CODTIPO_EMPLEADO_VENDEDOR,
  TIPODOC_FACTURA,
  TIPODOC_PEDIDO,
  TIPODOC_COTIZACION,
  parseMesAnio,
  parseFechaIso,
  normalizeGrupo,
  parseCodven,
  loadVendedorResumen,
  loadVendedorDocumentos,
};
