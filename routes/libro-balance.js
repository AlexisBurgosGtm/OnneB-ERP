const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLibroBalance } = require('../lib/libro-balance');
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
  { header: 'Sección', key: 'SECCION', width: 18 },
  { header: 'Est. fin.', key: 'ESTFIN', width: 12 },
  { header: 'Cuenta', key: 'CODCUENTA', width: 14 },
  { header: 'Descripción', key: 'DESCRIPCION', width: 32 },
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
    const data = await listLibroBalance(pool, require('mssql'), empnit, period.mes, period.anio);
    res.json(data);
  } catch (err) {
    console.warn('[API GET /libro-balance]', err.message);
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
    const data = await listLibroBalance(pool, require('mssql'), empnit, period.mes, period.anio);
    const exportRows = (data.rows || [])
      .filter((r) => r.TIPO === 'CUENTA' || r.TIPO === 'GRUPO')
      .map((r) => ({
        LINEA: r.LINEA,
        SECCION: r.SECCION || '',
        ESTFIN: r.ESTFIN || '',
        CODCUENTA: r.CODCUENTA || '',
        DESCRIPCION: r.DESCRIPCION || '',
        DEBE: r.DEBE ?? '',
        HABER: r.HABER ?? '',
        SALDO: r.SALDO ?? '',
      }));

    const t = data.totals || {};
    const buffer = await buildLibroWorkbook({
      sheetName: 'Balance',
      title: 'Balance General y Estado de Resultados',
      periodLabel: `Período: ${mesLabel(period.mes)} ${period.anio}`,
      columns: EXPORT_COLUMNS,
      rows: exportRows,
      totalsRow: {
        LINEA: '',
        SECCION: '',
        ESTFIN: '',
        CODCUENTA: '',
        DESCRIPCION: 'Utilidad del período',
        DEBE: '',
        HABER: '',
        SALDO: t.utilidad ?? 0,
      },
    });

    const stamp = Date.now();
    const filename = `libro_balance_${safeFilenamePart(empnit)}_${period.mes}_${period.anio}_${stamp}.xlsx`;
    sendLibroXlsx(res, buffer, filename);
  } catch (err) {
    console.warn('[API GET /libro-balance/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
