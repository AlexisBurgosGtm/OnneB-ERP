const express = require('express');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');
const { parseFechaInput, fechaIsoFromRow } = require('../lib/documento-fecha');
const {
  resolveDocGroup,
  buildProductosConsolidadoSql,
  buildProductoLineasDetalleSql,
} = require('../lib/reportes-contabilidad');

const router = express.Router();

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.body?.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function resolveRango(req) {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  const hoy = `${y}-${m}-${d}`;

  let desde = parseFechaInput(req.query.desde ?? req.body?.desde);
  let hasta = parseFechaInput(req.query.hasta ?? req.body?.hasta);
  if (!desde) desde = { fecha: hoy };
  if (!hasta) hasta = { fecha: hoy };
  if (desde.fecha > hasta.fecha) {
    const tmp = desde;
    desde = hasta;
    hasta = tmp;
  }
  return { desde: desde.fecha, hasta: hasta.fecha };
}

function mapProductosRows(recordset) {
  return (recordset || []).map((row) => {
    const totalPrecio = roundMoney(row.TOTALPRECIO);
    const totalCosto = roundMoney(row.TOTALCOSTO);
    return {
      CODPROD: String(row.CODPROD || '').trim(),
      DESPROD: String(row.DESPROD || '').trim(),
      TOTALUNIDADES: roundQty(row.TOTALUNIDADES),
      TOTALPRECIO: totalPrecio,
      TOTALCOSTO: totalCosto,
    };
  });
}

function totalesFromProductos(productos) {
  const precio = roundMoney(productos.reduce((s, p) => s + (Number(p.TOTALPRECIO) || 0), 0));
  const costo = roundMoney(productos.reduce((s, p) => s + (Number(p.TOTALCOSTO) || 0), 0));
  return {
    unidades: roundQty(productos.reduce((s, p) => s + (Number(p.TOTALUNIDADES) || 0), 0)),
    precio,
    costo,
  };
}

async function queryProductos(pool, empnit, groupId, desde, hasta) {
  const group = resolveDocGroup(groupId);
  const q = buildProductosConsolidadoSql(group);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('DESDE', sql.Date, desde)
    .input('HASTA', sql.Date, hasta)
    .query(q);
  const productos = mapProductosRows(result.recordset);
  return { group, productos, totales: totalesFromProductos(productos) };
}

router.get('/productos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { desde, hasta } = resolveRango(req);
  const groupId = String(req.query.grupo || req.query.group || 'fel-facturas').trim();

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await queryProductos(pool, empnit, groupId, desde, hasta);
    res.json({
      desde,
      hasta,
      grupo: data.group.id,
      grupoLabel: data.group.label,
      productos: data.productos,
      totales: data.totales,
    });
  } catch (err) {
    console.warn('[API GET /reportes-contabilidad/productos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/productos/documentos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const codprod = String(req.query.codprod ?? '').trim();
  if (!codprod) return res.status(400).json({ error: 'codprod requerido' });

  const { desde, hasta } = resolveRango(req);
  const groupId = String(req.query.grupo || req.query.group || 'fel-facturas').trim();
  const group = resolveDocGroup(groupId);

  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('DESDE', sql.Date, desde)
      .input('HASTA', sql.Date, hasta)
      .input('CODPROD', sql.VarChar, codprod)
      .query(buildProductoLineasDetalleSql(group));

    const lineas = (result.recordset || []).map((row) => ({
      FECHA: fechaIsoFromRow(row) || null,
      CODDOC: String(row.CODDOC || '').trim(),
      CORRELATIVO: row.CORRELATIVO,
      FEL_SERIE: String(row.FEL_SERIE || '').trim(),
      FEL_NUMERO: String(row.FEL_NUMERO || '').trim(),
      CODMEDIDA: String(row.CODMEDIDA || '').trim(),
      CANTIDAD: roundQty(row.CANTIDAD),
      COSTO: roundMoney(row.COSTO),
      PRECIO: roundMoney(row.PRECIO),
      TOTALCOSTO: roundMoney(row.TOTALCOSTO),
      TOTALPRECIO: roundMoney(row.TOTALPRECIO),
    }));

    const totales = {
      cantidad: roundQty(lineas.reduce((s, r) => s + (Number(r.CANTIDAD) || 0), 0)),
      totalCosto: roundMoney(lineas.reduce((s, r) => s + (Number(r.TOTALCOSTO) || 0), 0)),
      totalPrecio: roundMoney(lineas.reduce((s, r) => s + (Number(r.TOTALPRECIO) || 0), 0)),
    };

    res.json({
      codprod,
      desde,
      hasta,
      grupo: group.id,
      grupoLabel: group.label,
      lineas,
      totales,
    });
  } catch (err) {
    console.warn('[API GET /reportes-contabilidad/productos/documentos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/productos/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { desde, hasta } = resolveRango(req);
  const groupId = String(req.query.grupo || req.query.group || 'fel-facturas').trim();

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await queryProductos(pool, empnit, groupId, desde, hasta);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Productos');
    sheet.columns = [
      { header: 'CODPROD', key: 'CODPROD', width: 16 },
      { header: 'DESPROD', key: 'DESPROD', width: 40 },
      { header: 'TOTALUNIDADES', key: 'TOTALUNIDADES', width: 16 },
      { header: 'TOTALCOSTO', key: 'TOTALCOSTO', width: 14 },
      { header: 'TOTALPRECIO', key: 'TOTALPRECIO', width: 14 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of data.productos) {
      sheet.addRow(r);
    }
    sheet.addRow({});
    sheet.addRow({
      CODPROD: 'TOTALES',
      DESPROD: '',
      TOTALUNIDADES: data.totales.unidades,
      TOTALCOSTO: data.totales.costo,
      TOTALPRECIO: data.totales.precio,
    });
    sheet.getRow(sheet.rowCount).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    const stamp = `${desde}_${hasta}`.replace(/[^\w-]+/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="rep_contab_productos_${safeEmp}_${stamp}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.warn('[API GET /reportes-contabilidad/productos/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
