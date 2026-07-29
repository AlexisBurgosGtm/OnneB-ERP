const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 500;

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

function parseListQuery(req) {
  const q = String(req.query.q || '').trim();
  let limit = DEFAULT_LIMIT;
  if (q) {
    const requested = parseInt(req.query.limit, 10);
    limit = Number.isNaN(requested)
      ? SEARCH_LIMIT
      : Math.min(Math.max(requested, 1), SEARCH_LIMIT);
  } else {
    const requested = parseInt(req.query.limit, 10);
    if (!Number.isNaN(requested)) {
      limit = Math.min(Math.max(requested, 1), SEARCH_LIMIT);
    }
  }
  return { q, limit };
}

/** Lista productos para edición de costo unitario. */
router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const { q, limit } = parseListQuery(req);

  try {
    const pool = await req.app.locals.getDbPool();
    const qLike = q ? `%${q}%` : null;

    const countReq = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('q', sql.NVarChar, q || null)
      .input('qLike', sql.NVarChar, qLike);
    const total = (
      await countReq.query(`
        SELECT COUNT(*) AS total
        FROM dbo.PRODUCTOS p
        WHERE p.EMPNIT = @EMPNIT
          AND (
            @q IS NULL OR @q = ''
            OR p.CODPROD LIKE @qLike
            OR p.CODPROD2 LIKE @qLike
            OR p.DESPROD LIKE @qLike
            OR p.DESPROD2 LIKE @qLike
          )
      `)
    ).recordset[0].total;

    const listReq = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('q', sql.NVarChar, q || null)
      .input('qLike', sql.NVarChar, qLike)
      .input('limit', sql.Int, limit);
    const rows = (
      await listReq.query(`
        SELECT TOP (@limit)
          p.CODPROD,
          p.DESPROD,
          p.DESPROD2,
          p.COSTO
        FROM dbo.PRODUCTOS p
        WHERE p.EMPNIT = @EMPNIT
          AND (
            @q IS NULL OR @q = ''
            OR p.CODPROD LIKE @qLike
            OR p.CODPROD2 LIKE @qLike
            OR p.DESPROD LIKE @qLike
            OR p.DESPROD2 LIKE @qLike
          )
        ORDER BY p.DESPROD, p.CODPROD
      `)
    ).recordset;

    res.json({
      rows,
      total,
      limit,
      truncated: total > rows.length,
      empnit,
      q: q || null,
    });
  } catch (err) {
    console.warn('[API GET /actualizacion-costos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Actualiza PRODUCTOS.COSTO y recalcula PRECIOS.COSTO = PRODUCTOS.COSTO × PRECIOS.EQUIVALE
 */
router.put('/:codprod', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const codprod = String(req.params.codprod || '').trim();
  if (!codprod) {
    return res.status(400).json({ error: 'CODPROD requerido' });
  }

  const costoRaw = req.body?.COSTO ?? req.body?.costo;
  const costo = Number(costoRaw);
  if (!Number.isFinite(costo) || costo < 0) {
    return res.status(400).json({ error: 'COSTO inválido' });
  }

  const transaction = new sql.Transaction(await req.app.locals.getDbPool());
  try {
    await transaction.begin();

    const exists = await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROD', sql.VarChar, codprod)
      .query(`
        SELECT TOP 1 CODPROD, COSTO
        FROM dbo.PRODUCTOS
        WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
      `);
    if (!exists.recordset.length) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROD', sql.VarChar, codprod)
      .input('COSTO', sql.Decimal(18, 6), costo)
      .query(`
        UPDATE dbo.PRODUCTOS
        SET COSTO = @COSTO
        WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
      `);

    const precios = await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPROD', sql.VarChar, codprod)
      .input('COSTO', sql.Decimal(18, 6), costo)
      .query(`
        UPDATE dbo.PRECIOS
        SET COSTO = @COSTO * ISNULL(NULLIF(EQUIVALE, 0), 1)
        WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
      `);

    await transaction.commit();
    res.json({
      ok: true,
      CODPROD: codprod,
      COSTO: costo,
      preciosActualizados: precios.rowsAffected?.[0] || 0,
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    console.warn('[API PUT /actualizacion-costos/:codprod]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
