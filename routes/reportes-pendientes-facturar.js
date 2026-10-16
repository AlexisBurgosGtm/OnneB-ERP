const express = require('express');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');
const {
  buildReportePendientesFacturar,
  getDetalleFacturaPendiente,
} = require('../lib/reportes-pendientes-facturar');

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

function sendXlsx(res, buffer, filename) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
}

function labelEstadoExcel(code) {
  const map = {
    EN_COLA: 'En cola FEL',
    FRACCIONADA: 'Fraccionada',
    PARCIAL: 'Parcial FEL',
    SIN_FEL: 'Sin FEL',
  };
  return map[String(code || '').trim()] || code || '';
}

router.get('/export/facturas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const data = await buildReportePendientesFacturar(pool, empnit, req.query.mes, req.query.anio);
    const { mes, anio } = data.resumen;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Facturas');
    sheet.columns = [
      { header: 'Fecha', key: 'FECHA', width: 12 },
      { header: 'Coddoc', key: 'CODDOC', width: 10 },
      { header: 'Correlativo', key: 'CORRELATIVO', width: 12 },
      { header: 'Cliente', key: 'CLIENTE', width: 36 },
      { header: 'NIT', key: 'DOC_NIT', width: 14 },
      { header: 'Total FAC', key: 'TOTAL_FAC', width: 14 },
      { header: 'Emitido FEL', key: 'TOTAL_EMITIDO_FEL', width: 14 },
      { header: 'Pendiente FEL', key: 'PENDIENTE_FEL', width: 14 },
      { header: 'Estado fracc.', key: 'ESTADO_FRACC', width: 16 },
      { header: 'Status', key: 'STATUS', width: 8 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const r of data.facturas) {
      sheet.addRow({
        ...r,
        ESTADO_FRACC: labelEstadoExcel(r.ESTADO_FRACC),
      });
    }
    sheet.addRow({});
    sheet.addRow({
      CLIENTE: 'TOTALES',
      TOTAL_FAC: data.resumen.totalFac,
      TOTAL_EMITIDO_FEL: data.resumen.totalEmitidoFel,
      PENDIENTE_FEL: data.resumen.pendienteFel,
    });
    sheet.getRow(sheet.rowCount).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    sendXlsx(res, buffer, `pendientes_facturar_fac_${safeEmp}_${anio}-${String(mes).padStart(2, '0')}.xlsx`);
  } catch (err) {
    console.warn('[API GET /reportes-pendientes-facturar/export/facturas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export/productos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const data = await buildReportePendientesFacturar(pool, empnit, req.query.mes, req.query.anio);
    const { mes, anio } = data.resumen;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Productos');
    sheet.columns = [
      { header: 'CODPROD', key: 'CODPROD', width: 16 },
      { header: 'DESPROD', key: 'DESPROD', width: 40 },
      { header: 'Unidades pend.', key: 'CANTIDAD', width: 16 },
      { header: 'Monto pend. FEL', key: 'TOTALPRECIO', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    let totalU = 0;
    let totalM = 0;
    for (const r of data.productos) {
      sheet.addRow(r);
      totalU += Number(r.CANTIDAD) || 0;
      totalM += Number(r.TOTALPRECIO) || 0;
    }
    sheet.addRow({});
    sheet.addRow({
      CODPROD: 'TOTALES',
      DESPROD: '',
      CANTIDAD: totalU,
      TOTALPRECIO: totalM,
    });
    sheet.getRow(sheet.rowCount).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    sendXlsx(res, buffer, `pendientes_facturar_prod_${safeEmp}_${anio}-${String(mes).padStart(2, '0')}.xlsx`);
  } catch (err) {
    console.warn('[API GET /reportes-pendientes-facturar/export/productos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:coddoc/:correlativo/detalle', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const coddoc = String(req.params.coddoc || '').trim();
  const correlativo = req.params.correlativo;
  if (!coddoc) return res.status(400).json({ error: 'CODDOC requerido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const data = await getDetalleFacturaPendiente(pool, empnit, coddoc, correlativo);
    res.json(data);
  } catch (err) {
    const code = err.statusCode || 500;
    console.warn('[API GET /reportes-pendientes-facturar/detalle]', err.message);
    res.status(code).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const data = await buildReportePendientesFacturar(
      pool,
      empnit,
      req.query.mes,
      req.query.anio
    );
    res.json(data);
  } catch (err) {
    console.warn('[API GET /reportes-pendientes-facturar]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
