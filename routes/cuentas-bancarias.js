const express = require('express');
const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

/** Lista con nombre del banco (JOIN BANCOS) — antes del CRUD genérico. */
router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT
        c.CODCUENTA,
        c.EMPNIT,
        c.CODBANCO,
        c.NOCUENTA,
        b.DESBANCO
      FROM dbo.CUENTAS c
      LEFT JOIN dbo.BANCOS b ON b.CODBANCO = c.CODBANCO
      WHERE c.EMPNIT = @EMPNIT
      ORDER BY b.DESBANCO, c.NOCUENTA, c.CODCUENTA
    `);
    res.json({ rows: result.recordset, total: result.recordset.length, empnit });
  } catch (err) {
    console.warn('[API GET /cuentas-bancarias]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.use(
  createCatalogoRouter({
    logName: 'cuentas-bancarias',
    entityLabel: 'Cuenta bancaria',
    table: 'CUENTAS',
    orderBy: 'NOCUENTA',
    idColumn: 'CODCUENTA',
    idType: 'int',
    idRouteParam: 'codcuenta',
    identityColumn: true,
    listColumns: ['CODCUENTA', 'CODBANCO', 'NOCUENTA'],
    fields: [
      { name: 'CODBANCO', type: 'int', required: true },
      { name: 'NOCUENTA', type: 'varchar', required: true },
    ],
    insertFields: ['CODBANCO', 'NOCUENTA'],
    updateFields: ['CODBANCO', 'NOCUENTA'],
  })
);

module.exports = router;
