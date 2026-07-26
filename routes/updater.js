const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { getUpdateDbConfig, isUpdateDbConfigured } = require('../config/update-database');
const { getUpdateDbPool } = require('../lib/update-db-pool');

const router = express.Router();

const ANIO_MIN = 2024;
const ANIO_MAX = 2030;

function parseAnio(raw) {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < ANIO_MIN || n > ANIO_MAX) return null;
  return n;
}

router.get('/queries', async (req, res) => {
  if (!isUpdateDbConfigured()) {
    res.status(503).json({ error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)' });
    return;
  }

  try {
    const pool = await getUpdateDbPool();
    const result = await pool.request().query(`
        SELECT ID, QRY, FECHA, VERSION, DB
        FROM UPDATE_QUERIES
        ORDER BY ID DESC
      `);

    res.json({ rows: result.recordset, total: result.recordset.length });
  } catch (err) {
    console.error('[Updater] list:', err.message);
    res.status(500).json({ error: err.message || 'Error al consultar UPDATE_QUERIES' });
  }
});

router.post('/execute', async (req, res) => {
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'Base de datos interna no configurada' });
    return;
  }
  if (!isUpdateDbConfigured()) {
    res.status(503).json({ error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)' });
    return;
  }

  const anio = parseAnio(req.body?.anio ?? req.query?.anio);
  if (anio === null) {
    res.status(400).json({ error: `Año inválido (${ANIO_MIN}–${ANIO_MAX})` });
    return;
  }

  const dbFilter = String(req.body?.db ?? 'P')
    .trim()
    .toUpperCase()
    .slice(0, 1);
  if (!dbFilter) {
    res.status(400).json({ error: 'DB inválido' });
    return;
  }

  try {
    const extPool = await getUpdateDbPool();
    const qResult = await extPool
      .request()
      .input('anio', sql.Int, anio)
      .input('db', sql.VarChar(1), dbFilter)
      .query(`
        SELECT ID, QRY
        FROM UPDATE_QUERIES
        WHERE VERSION = @anio AND DB = @db
        ORDER BY ID ASC
      `);

    const queries = qResult.recordset || [];
    if (!queries.length) {
      res.json({
        ok: true,
        anio,
        db: dbFilter,
        executed: 0,
        message: 'No hay queries para ejecutar con los filtros indicados',
        results: [],
      });
      return;
    }

    const getDbPool = req.app.locals.getDbPool;
    const intPool = await getDbPool();
    if (!intPool) {
      res.status(503).json({ error: 'No se pudo conectar a la base de datos interna' });
      return;
    }

    const results = [];
    let executed = 0;
    let failed = 0;

    for (const row of queries) {
      const id = row.ID;
      const qry = String(row.QRY ?? '').trim();
      if (!qry) {
        failed += 1;
        results.push({ id, ok: false, error: 'Query vacía' });
        continue;
      }

      try {
        await intPool.request().query(qry);
        executed += 1;
        results.push({ id, ok: true });
      } catch (err) {
        failed += 1;
        results.push({ id, ok: false, error: err.message || String(err) });
      }
    }

    res.json({
      ok: failed === 0,
      anio,
      db: dbFilter,
      executed,
      failed,
      total: queries.length,
      results,
    });
  } catch (err) {
    console.error('[Updater] execute:', err.message);
    res.status(500).json({ error: err.message || 'Error al ejecutar actualizaciones' });
  }
});

router.get('/status', async (_req, res) => {
  let external = 'not_configured';
  let internal = 'not_configured';

  if (isUpdateDbConfigured()) {
    try {
      const pool = await getUpdateDbPool();
      await pool.request().query('SELECT 1 AS ok');
      external = 'connected';
    } catch (err) {
      external = 'error';
      console.warn('[Updater] externa:', err.message);
    }
  }

  if (isDbConfigured()) {
    try {
      const getDbPool = _req.app.locals.getDbPool;
      const pool = await getDbPool();
      await pool.request().query('SELECT 1 AS ok');
      internal = 'connected';
    } catch (err) {
      internal = 'error';
      console.warn('[Updater] interna:', err.message);
    }
  }

  res.json({ external, internal });
});

module.exports = router;
