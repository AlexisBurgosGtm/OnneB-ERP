const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

async function nextCodMarca(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query('SELECT ISNULL(MAX(CODMARCA), 0) + 1 AS nextCod FROM dbo.Marcas WHERE EMPNIT = @EMPNIT');
  return result.recordset[0].nextCod;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT CODMARCA, DESMARCA
        FROM dbo.Marcas
        WHERE EMPNIT = @EMPNIT
        ORDER BY DESMARCA
      `);
    res.json({ rows: result.recordset, total: result.recordset.length, empnit });
  } catch (err) {
    console.warn('[API GET /marcas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const desmarca = String(req.body.DESMARCA ?? '').trim();
  if (!desmarca) {
    return res.status(400).json({ error: 'DESMARCA es obligatorio' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const codmarca = await nextCodMarca(pool, empnit);
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODMARCA', sql.Int, codmarca)
      .input('DESMARCA', sql.VarChar, desmarca)
      .query(`
        INSERT INTO dbo.Marcas (EMPNIT, CODMARCA, DESMARCA)
        VALUES (@EMPNIT, @CODMARCA, @DESMARCA)
      `);
    res.status(201).json({ ok: true, CODMARCA: codmarca, DESMARCA: desmarca });
  } catch (err) {
    console.warn('[API POST /marcas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:codmarca', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codmarca = parseInt(req.params.codmarca, 10);
  if (Number.isNaN(codmarca)) {
    return res.status(400).json({ error: 'CODMARCA inválido' });
  }
  const desmarca = String(req.body.DESMARCA ?? '').trim();
  if (!desmarca) {
    return res.status(400).json({ error: 'DESMARCA es obligatorio' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODMARCA', sql.Int, codmarca)
      .input('DESMARCA', sql.VarChar, desmarca)
      .query(`
        UPDATE dbo.Marcas SET DESMARCA = @DESMARCA
        WHERE EMPNIT = @EMPNIT AND CODMARCA = @CODMARCA
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Marca no encontrada' });
    }
    res.json({ ok: true, CODMARCA: codmarca, DESMARCA: desmarca });
  } catch (err) {
    console.warn('[API PUT /marcas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:codmarca', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codmarca = parseInt(req.params.codmarca, 10);
  if (Number.isNaN(codmarca)) {
    return res.status(400).json({ error: 'CODMARCA inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const { assertEliminacionRegistro } = require('../lib/config-auth');
    await assertEliminacionRegistro(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODMARCA', sql.Int, codmarca)
      .query('DELETE FROM dbo.Marcas WHERE EMPNIT = @EMPNIT AND CODMARCA = @CODMARCA');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Marca no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ error: err.message });
    }
    console.warn('[API DELETE /marcas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
