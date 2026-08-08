const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLibroDiario } = require('../lib/libro-diario');
const {
  requireEmpNit,
  parsePeriod,
  buildLibroWorkbook,
  sendLibroXlsx,
  safeFilenamePart,
  mesLabel,
} = require('../lib/libro-contable-utils');

const router = express.Router();

const EXPORT_COLUMNS = [
  { header: 'No.', key: 'LINEA', width: 6 },
  { header: 'Fecha', key: 'FECHA', width: 12, type: 'date' },
  { header: 'Documento', key: 'DOC_REF', width: 16 },
  { header: 'Tipo', key: 'TIPODOC', width: 8 },
  { header: 'Pago', key: 'TIPOPAGO', width: 10 },
  { header: 'Formato', key: 'CODFORMATO', width: 14 },
  { header: 'Cuenta', key: 'CODCUENTA', width: 14 },
  { header: 'Descripción', key: 'DESCRIPCION_CUENTA', width: 28 },
  { header: 'Debe', key: 'DEBE', width: 14, type: 'money' },
  { header: 'Haber', key: 'HABER', width: 14, type: 'money' },
  { header: 'C. costo', key: 'CENTRO_COSTO', width: 10 },
];

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const period = parsePeriod(req, res);
  if (!period) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await listLibroDiario(pool, require('mssql'), empnit, period.mes, period.anio);
    res.json({
      rows: data.rows,
      warnings: data.warnings,
      totals: data.totals,
      mes: data.mes,
      anio: data.anio,
    });
  } catch (err) {
    console.warn('[API GET /libro-diario]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const period = parsePeriod(req, res);
  if (!period) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const data = await listLibroDiario(pool, require('mssql'), empnit, period.mes, period.anio);
    const exportRows = (data.rows || []).map((r) => ({ ...r }));
    const t = data.totals || {};
    const buffer = await buildLibroWorkbook({
      sheetName: 'Libro Diario',
      title: 'Libro Diario',
      periodLabel: `Período: ${mesLabel(period.mes)} ${period.anio}`,
      columns: EXPORT_COLUMNS,
      rows: exportRows,
      totalsRow: {
        LINEA: '',
        FECHA: '',
        DOC_REF: '',
        TIPODOC: '',
        TIPOPAGO: '',
        CODFORMATO: '',
        CODCUENTA: '',
        DESCRIPCION_CUENTA: 'Totales (sin anulados)',
        DEBE: t.debe ?? 0,
        HABER: t.haber ?? 0,
        CENTRO_COSTO: '',
      },
    });
    const filename = `libro_diario_${safeFilenamePart(empnit)}_${period.mes}_${period.anio}_${Date.now()}.xlsx`;
    sendLibroXlsx(res, buffer, filename);
  } catch (err) {
    console.warn('[API GET /libro-diario/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
