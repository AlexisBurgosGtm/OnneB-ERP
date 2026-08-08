const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLibroMayor } = require('../lib/libro-mayor');
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
  { header: 'Cuenta', key: 'CODCUENTA', width: 14 },
  { header: 'Fecha', key: 'FECHA', width: 12, type: 'date' },
  { header: 'Documento', key: 'DOC_REF', width: 16 },
  { header: 'Glosa', key: 'GLOSA', width: 28 },
  { header: 'Debe', key: 'DEBE', width: 14, type: 'money' },
  { header: 'Haber', key: 'HABER', width: 14, type: 'money' },
  { header: 'Saldo', key: 'SALDO', width: 14, type: 'money' },
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
    const data = await listLibroMayor(pool, require('mssql'), empnit, period.mes, period.anio);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /libro-mayor]', err.message);
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
    const data = await listLibroMayor(pool, require('mssql'), empnit, period.mes, period.anio);
    const exportRows = (data.rows || [])
      .filter((r) => r.TIPO === 'MOV' || r.TIPO === 'SUBTOTAL')
      .map((r) => ({
        LINEA: r.LINEA,
        CODCUENTA: r.CODCUENTA,
        FECHA: r.FECHA || '',
        DOC_REF: r.DOC_REF || '',
        GLOSA: r.GLOSA || '',
        DEBE: r.DEBE ?? '',
        HABER: r.HABER ?? '',
        SALDO: r.SALDO ?? '',
      }));

    const buffer = await buildLibroWorkbook({
      sheetName: 'Libro Mayor',
      title: 'Libro Mayor',
      periodLabel: `Período: ${mesLabel(period.mes)} ${period.anio}`,
      columns: EXPORT_COLUMNS,
      rows: exportRows,
      totalsRow: {
        LINEA: '',
        CODCUENTA: '',
        FECHA: '',
        DOC_REF: '',
        GLOSA: 'Totales',
        DEBE: data.totals?.debe ?? 0,
        HABER: data.totals?.haber ?? 0,
        SALDO: '',
      },
    });

    const stamp = Date.now();
    const filename = `libro_mayor_${safeFilenamePart(empnit)}_${period.mes}_${period.anio}_${stamp}.xlsx`;
    sendLibroXlsx(res, buffer, filename);
  } catch (err) {
    console.warn('[API GET /libro-mayor/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
