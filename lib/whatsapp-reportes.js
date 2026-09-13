/**
 * Arma el PDF de cada reporte programado de WhatsApp (filtrado por EMPNIT).
 */
const sql = require('mssql');
const { SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const { SQL_TIPODOC_FACTURA_IN, SQL_TIPODOC_DEVOLUCION_IN } = require('./corte-caja-docs');
const { SQL_TIPODOC_CUENTAS_COBRAR_IN, SQL_DOC_SALDO_PENDIENTE_POSITIVO } = require('./cuentas-docs');
const { SQL_TIPODOC_CUENTAS_PAGAR_IN } = require('./cuentas-pagar-docs');
const { SQL_NOMBRE_CLIENTE, SQL_NOMBRE_PROVEEDOR, SQL_JOIN_CLIENTES, SQL_JOIN_PROVEEDORES } = require('./cuentas-resumen-partes');
const { MONEY_LOCALE, CURRENCY, reporteByCodigo } = require('./whatsapp-programacion');
const { writeSectionsPdf } = require('./whatsapp-pdf');

const DOC_LIMIT = 400;
const SQL_SALDO_CXP = `ROUND(ISNULL(d.DOC_SALDO, 0), 2) > 0`;

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(MONEY_LOCALE, { style: 'currency', currency: CURRENCY });
}

function fechaCorta(value) {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function docLabel(row) {
  return `${String(row.CODDOC || '').trim()}-${row.CORRELATIVO ?? ''}`;
}

async function empresaNombre(pool, empnit) {
  const result = await pool.request().input('EMPNIT', sql.VarChar(20), empnit).query(`
    SELECT TOP 1 ISNULL(NULLIF(LTRIM(RTRIM(EMPNOMBRE)), ''), EMPNIT) AS NOMBRE
    FROM dbo.Empresas
    WHERE EMPNIT = @EMPNIT
  `);
  return String(result.recordset[0]?.NOMBRE || empnit);
}

function baseDocWhere(extra) {
  return `
    WHERE d.EMPNIT = @EMPNIT
      AND ISNULL(d.STATUS, '') = 'O'
      AND ${SQL_TIPODOC_REPORTES_SI}
      ${extra}
  `;
}

async function listSaldos(pool, empnit, { lado, modo, hoy }) {
  const esCliente = lado === 'cxc';
  const tipoIn = esCliente ? SQL_TIPODOC_CUENTAS_COBRAR_IN : SQL_TIPODOC_CUENTAS_PAGAR_IN;
  const saldoSql = esCliente ? SQL_DOC_SALDO_PENDIENTE_POSITIVO : SQL_SALDO_CXP;
  const venceSql = modo === 'dia'
    ? 'AND CAST(d.VENCIMIENTO AS date) = CAST(@HOY AS date)'
    : 'AND d.VENCIMIENTO IS NOT NULL AND CAST(d.VENCIMIENTO AS date) < CAST(@HOY AS date)';
  const join = esCliente ? SQL_JOIN_CLIENTES : SQL_JOIN_PROVEEDORES;
  const nombre = esCliente ? SQL_NOMBRE_CLIENTE : SQL_NOMBRE_PROVEEDOR;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .input('HOY', sql.VarChar(10), hoy)
    .input('LIM', sql.Int, DOC_LIMIT)
    .query(`
      SELECT TOP (@LIM)
        d.CODDOC, d.CORRELATIVO, d.FECHA, d.VENCIMIENTO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ISNULL(d.DOC_SALDO, 0) AS DOC_SALDO,
        ${nombre} AS NOMBRE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      ${join}
      ${baseDocWhere(`
        AND t.TIPODOC IN (${tipoIn})
        AND ISNULL(d.CONCRE, 'CON') = 'CRE'
        AND ${saldoSql}
        ${venceSql}
      `)}
      ORDER BY d.VENCIMIENTO, d.CODDOC, d.CORRELATIVO
    `);
  return result.recordset || [];
}

async function listVentas(pool, empnit, hoy) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .input('HOY', sql.VarChar(10), hoy)
    .input('LIM', sql.Int, DOC_LIMIT)
    .query(`
      SELECT TOP (@LIM)
        d.CODDOC, d.CORRELATIVO, t.TIPODOC,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ${SQL_NOMBRE_CLIENTE} AS NOMBRE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      ${SQL_JOIN_CLIENTES}
      ${baseDocWhere(`
        AND CAST(d.FECHA AS date) = CAST(@HOY AS date)
        AND (
          t.TIPODOC IN (${SQL_TIPODOC_FACTURA_IN})
          OR t.TIPODOC IN (${SQL_TIPODOC_DEVOLUCION_IN})
        )
      `)}
      ORDER BY t.TIPODOC, d.CODDOC, d.CORRELATIVO
    `);
  return result.recordset || [];
}

async function listPagosClientes(pool, empnit, hoy) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .input('HOY', sql.VarChar(10), hoy)
    .input('LIM', sql.Int, DOC_LIMIT)
    .query(`
      SELECT TOP (@LIM)
        d.CODDOC, d.CORRELATIVO, t.TIPODOC,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        ${SQL_NOMBRE_CLIENTE} AS NOMBRE
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      ${SQL_JOIN_CLIENTES}
      WHERE d.EMPNIT = @EMPNIT
        AND ISNULL(d.STATUS, '') = 'O'
        AND CAST(d.FECHA AS date) = CAST(@HOY AS date)
        AND t.TIPODOC IN ('RCC', 'PRC', 'RAR')
      ORDER BY d.CODDOC, d.CORRELATIVO
    `);
  return result.recordset || [];
}

async function listValesDia(pool, empnit, hoy) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .input('HOY', sql.VarChar(10), hoy)
    .input('LIM', sql.Int, DOC_LIMIT)
    .query(`
      SELECT TOP (@LIM)
        v.NOVALE, v.TIPO, v.DESCRIPCION, v.RECIBE, ISNULL(v.IMPORTE, 0) AS IMPORTE
      FROM dbo.DOCUMENTOS_VALES_CAJA v
      WHERE v.EMPNIT = @EMPNIT
        AND CAST(v.FECHA AS date) = CAST(@HOY AS date)
      ORDER BY v.NOVALE
    `);
  return result.recordset || [];
}

async function listSinSaldo(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      SELECT TOP 50
        LTRIM(RTRIM(p.CODPROD)) AS CODPROD,
        LTRIM(RTRIM(ISNULL(p.DESPROD, ''))) AS DESPROD,
        ISNULL(p.EXISTENCIA, 0) AS EXISTENCIA
      FROM dbo.PRODUCTOS p
      WHERE p.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(p.HABILITADO, '')))) = 'SI'
        AND ISNULL(p.TIPOPROD, 'P') <> 'S'
        AND ISNULL(p.EXISTENCIA, 0) <= 0
      ORDER BY p.DESPROD, p.CODPROD
    `);
  return result.recordset || [];
}

function rowsSaldos(rows) {
  return rows.map((row) => ({
    doc: docLabel(row),
    nombre: row.NOMBRE,
    fecha: fechaCorta(row.FECHA),
    vence: fechaCorta(row.VENCIMIENTO),
    saldo: money(row.DOC_SALDO),
  }));
}

const COLS_SALDOS = [
  { key: 'doc', label: 'Documento', w: 90 },
  { key: 'nombre', label: 'Nombre', w: 190, max: 36 },
  { key: 'fecha', label: 'Fecha', w: 70 },
  { key: 'vence', label: 'Vence', w: 70 },
  { key: 'saldo', label: 'Saldo', w: 90, align: 'right', max: 16 },
];

function sumSaldo(rows) {
  return rows.reduce((acc, row) => acc + (Number(row.DOC_SALDO) || 0), 0);
}

async function buildReportePdf(pool, empnit, codigo, hoy) {
  const meta = reporteByCodigo(codigo);
  if (!meta) throw new Error('Reporte no disponible');
  const empresa = await empresaNombre(pool, empnit);
  const subtitle = `Fecha ${hoy.split('-').reverse().join('/')}`;
  const fileName = `${codigo.toLowerCase()}-${hoy}.pdf`;
  let sections = [];

  if (codigo === 'CXC_VENCIDOS' || codigo === 'FAC_COBRAR_DIA') {
    const rows = await listSaldos(pool, empnit, {
      lado: 'cxc',
      modo: codigo === 'FAC_COBRAR_DIA' ? 'dia' : 'vencidos',
      hoy,
    });
    sections = [{
      title: meta.nombre,
      note: `Total saldo ${money(sumSaldo(rows))}${rows.length >= DOC_LIMIT ? `. Se muestran los primeros ${DOC_LIMIT}.` : ''}`,
      columns: COLS_SALDOS,
      rows: rowsSaldos(rows),
    }];
  } else if (codigo === 'CXP_VENCIDOS' || codigo === 'FAC_PAGAR_DIA') {
    const rows = await listSaldos(pool, empnit, {
      lado: 'cxp',
      modo: codigo === 'FAC_PAGAR_DIA' ? 'dia' : 'vencidos',
      hoy,
    });
    sections = [{
      title: meta.nombre,
      note: `Total saldo ${money(sumSaldo(rows))}${rows.length >= DOC_LIMIT ? `. Se muestran los primeros ${DOC_LIMIT}.` : ''}`,
      columns: COLS_SALDOS,
      rows: rowsSaldos(rows),
    }];
  } else if (codigo === 'VENTAS_DIA') {
    const [docs, pagos, vales] = await Promise.all([
      listVentas(pool, empnit, hoy),
      listPagosClientes(pool, empnit, hoy),
      listValesDia(pool, empnit, hoy),
    ]);
    const ventas = docs.filter((row) => !['DEV', 'FNC'].includes(String(row.TIPODOC || '').trim().toUpperCase()));
    const devoluciones = docs.filter((row) => ['DEV', 'FNC'].includes(String(row.TIPODOC || '').trim().toUpperCase()));
    const totalVentas = ventas.reduce((acc, row) => acc + (Number(row.TOTALPRECIO) || 0), 0);
    const totalDev = devoluciones.reduce((acc, row) => acc + (Number(row.TOTALPRECIO) || 0), 0);
    const totalPagos = pagos.reduce((acc, row) => acc + (Number(row.TOTALPRECIO) || 0), 0);
    const totalVales = vales.reduce((acc, row) => acc + (Number(row.IMPORTE) || 0), 0);
    sections = [
      {
        title: 'Ventas del día',
        lines: [
          `Ventas (FAC y FEL que van a reportes): ${money(totalVentas)}`,
          `Notas de crédito y devoluciones: ${money(totalDev)}`,
          `Neto: ${money(totalVentas - totalDev)}`,
        ],
        columns: [
          { key: 'doc', label: 'Documento', w: 90 },
          { key: 'tipo', label: 'Tipo', w: 50 },
          { key: 'nombre', label: 'Cliente', w: 250, max: 42 },
          { key: 'total', label: 'Total', w: 100, align: 'right', max: 16 },
        ],
        rows: ventas.map((row) => ({
          doc: docLabel(row),
          tipo: row.TIPODOC,
          nombre: row.NOMBRE,
          total: money(row.TOTALPRECIO),
        })),
      },
      {
        title: 'Pagos de clientes del día',
        note: `Total ${money(totalPagos)}`,
        columns: [
          { key: 'doc', label: 'Documento', w: 90 },
          { key: 'tipo', label: 'Tipo', w: 50 },
          { key: 'nombre', label: 'Cliente', w: 250, max: 42 },
          { key: 'total', label: 'Total', w: 100, align: 'right', max: 16 },
        ],
        rows: pagos.map((row) => ({
          doc: docLabel(row),
          tipo: row.TIPODOC,
          nombre: row.NOMBRE,
          total: money(row.TOTALPRECIO),
        })),
      },
      {
        title: 'Vales de caja del día',
        note: `Total ${money(totalVales)}`,
        columns: [
          { key: 'doc', label: 'Vale', w: 60 },
          { key: 'tipo', label: 'Tipo', w: 80 },
          { key: 'recibe', label: 'Recibe', w: 140, max: 24 },
          { key: 'desc', label: 'Descripción', w: 180, max: 32 },
          { key: 'total', label: 'Importe', w: 80, align: 'right', max: 16 },
        ],
        rows: vales.map((row) => ({
          doc: String(row.NOVALE ?? ''),
          tipo: row.TIPO,
          recibe: row.RECIBE,
          desc: row.DESCRIPCION,
          total: money(row.IMPORTE),
        })),
      },
    ];
  } else if (codigo === 'TOP50_SIN_SALDO') {
    const rows = await listSinSaldo(pool, empnit);
    sections = [{
      title: meta.nombre,
      note: 'Productos habilitados, que no son servicio, con existencia en cero o negativa.',
      columns: [
        { key: 'cod', label: 'Código', w: 110 },
        { key: 'nombre', label: 'Producto', w: 340, max: 58 },
        { key: 'ex', label: 'Existencia', w: 80, align: 'right', max: 12 },
      ],
      rows: rows.map((row) => ({
        cod: row.CODPROD,
        nombre: row.DESPROD,
        ex: Number(row.EXISTENCIA).toLocaleString(MONEY_LOCALE, { maximumFractionDigits: 2 }),
      })),
    }];
  } else {
    throw new Error('Reporte no disponible');
  }

  return writeSectionsPdf({
    empresa,
    title: meta.nombre,
    subtitle,
    fileName,
    sections,
  });
}

module.exports = {
  buildReportePdf,
};
