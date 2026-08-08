const express = require('express');
const { isDbConfigured } = require('../config/database');
const { listLibroCompras, TIPODOC_LIBRO_COMPRAS } = require('../lib/libro-compras');
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
  { header: 'Fecha', key: 'FEL_FECHA', width: 12, type: 'string' },
  { header: 'Tipo', key: 'TIPODOC', width: 8 },
  { header: 'Serie', key: 'FEL_SERIE', width: 10 },
  { header: 'Número', key: 'FEL_NUMERO', width: 12 },
  { header: 'NIT', key: 'DOC_NIT', width: 14 },
  { header: 'Nombre', key: 'DOC_NOMCLIE', width: 28 },
  { header: 'Exentas', key: 'TOTALEXENTO', width: 12, type: 'money' },
  { header: 'Gravadas', key: 'TOTALSINIVA', width: 12, type: 'money' },
  { header: 'IVA', key: 'TOTALIVA', width: 12, type: 'money' },
  { header: 'Total', key: 'TOTAL', width: 12, type: 'money' },
  { header: 'Anulado', key: 'ANULADO', width: 10 },
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
    const data = await listLibroCompras(pool, require('mssql'), empnit, period.mes, period.anio);
    res.json({
      rows: data.rows,
      totals: data.totals,
      mes: data.mes,
      anio: data.anio,
      tipodocs: TIPODOC_LIBRO_COMPRAS,
    });
  } catch (err) {
    console.warn('[API GET /libro-compras]', err.message);
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
    const data = await listLibroCompras(pool, require('mssql'), empnit, period.mes, period.anio);
    const exportRows = (data.rows || []).map((r) => ({
      ...r,
      FEL_FECHA: r.FEL_FECHA ? String(r.FEL_FECHA).slice(0, 10) : '',
      ANULADO: r.ANULADO ? 'Sí' : 'No',
    }));
    const t = data.totals || {};
    const buffer = await buildLibroWorkbook({
      sheetName: 'Libro Compras',
      title: 'Libro de Compras y Servicios Recibidos',
      periodLabel: `Período: ${mesLabel(period.mes)} ${period.anio}`,
      columns: EXPORT_COLUMNS,
      rows: exportRows,
      totalsRow: {
        LINEA: '',
        FEL_FECHA: '',
        TIPODOC: '',
        FEL_SERIE: '',
        FEL_NUMERO: '',
        DOC_NIT: '',
        DOC_NOMCLIE: 'Totales (sin anulados)',
        TOTALEXENTO: t.exento ?? 0,
        TOTALSINIVA: t.gravado ?? 0,
        TOTALIVA: t.iva ?? 0,
        TOTAL: t.total ?? 0,
        ANULADO: '',
      },
    });
    const filename = `libro_compras_${safeFilenamePart(empnit)}_${period.mes}_${period.anio}_${Date.now()}.xlsx`;
    sendLibroXlsx(res, buffer, filename);
  } catch (err) {
    console.warn('[API GET /libro-compras/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
