const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const { isDbConfigured } = require('../config/database');
const { parseActualizacionCostosExcel } = require('../lib/actualizacion-costos-excel');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 500;
const BULK_MAX = 5000;

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    if (name.endsWith('.xls') || name.endsWith('.xlsx')) {
      cb(null, true);
      return;
    }
    cb(new Error('Solo se permiten archivos .xls o .xlsx'));
  },
});

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

async function updateProductoCosto(transaction, empnit, codprod, costo) {
  const exists = await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .query(`
      SELECT TOP 1 CODPROD
      FROM dbo.PRODUCTOS
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);
  if (!exists.recordset.length) {
    return { ok: false, code: 'NOT_FOUND' };
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

  return {
    ok: true,
    CODPROD: codprod,
    COSTO: costo,
    preciosActualizados: precios.rowsAffected?.[0] || 0,
  };
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
 * Parsea Excel (CODPROD, COSTO) y arma la lista enriquecida con datos del producto.
 */
router.post('/import-excel', excelUpload.single('archivo'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  if (!req.file?.buffer) {
    return res.status(400).json({ error: 'Seleccione un archivo Excel (.xls o .xlsx)' });
  }

  try {
    const parsed = parseActualizacionCostosExcel(req.file.buffer);
    const pool = await req.app.locals.getDbPool();
    const rows = [];
    const missing = [];
    const skipped = [...(parsed.skipped || [])];

    for (const item of parsed.rows) {
      const found = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODPROD', sql.VarChar, item.CODPROD)
        .query(`
          SELECT TOP 1 CODPROD, DESPROD, DESPROD2, COSTO
          FROM dbo.PRODUCTOS
          WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
        `);
      if (!found.recordset.length) {
        missing.push(item.CODPROD);
        skipped.push(`Fila ${item.excelRow} (${item.CODPROD}): producto no existe en la empresa`);
        continue;
      }
      const p = found.recordset[0];
      rows.push({
        CODPROD: String(p.CODPROD || '').trim(),
        DESPROD: p.DESPROD || '',
        DESPROD2: p.DESPROD2 || '',
        COSTO: item.COSTO,
        COSTO_ANTERIOR: p.COSTO,
        fromExcel: true,
      });
    }

    if (!rows.length) {
      return res.status(400).json({
        error: 'Ningún código del Excel coincide con productos de la empresa',
        skipped,
        missing,
      });
    }

    res.json({
      ok: true,
      rows,
      total: rows.length,
      truncated: false,
      skipped,
      missing,
      empnit,
      fromExcel: true,
    });
  } catch (err) {
    const status = err.statusCode || (err instanceof multer.MulterError ? 400 : 500);
    console.warn('[API POST /actualizacion-costos/import-excel]', err.message);
    res.status(status).json({ error: err.message || 'Error al leer Excel' });
  }
});

function parseCostoItems(itemsRaw) {
  const items = [];
  for (const raw of itemsRaw || []) {
    const codprod = String(raw?.CODPROD ?? raw?.codprod ?? '').trim();
    const costo = Number(raw?.COSTO ?? raw?.costo);
    if (!codprod || !Number.isFinite(costo) || costo <= 0) continue;
    items.push({ CODPROD: codprod, COSTO: costo });
  }
  return items;
}

async function applyCostoItems(transaction, empnit, items) {
  const updated = [];
  const errors = [];
  for (const item of items) {
    const result = await updateProductoCosto(transaction, empnit, item.CODPROD, item.COSTO);
    if (!result.ok) {
      errors.push({ CODPROD: item.CODPROD, error: 'Producto no encontrado' });
      continue;
    }
    updated.push(result);
  }
  return { updated, errors };
}

async function recalcAllPreciosCosto(transaction, empnit) {
  const result = await new sql.Request(transaction).input('EMPNIT', sql.VarChar, empnit).query(`
    UPDATE pr
    SET pr.COSTO = ISNULL(p.COSTO, 0) * ISNULL(NULLIF(pr.EQUIVALE, 0), 1)
    FROM dbo.PRECIOS pr
    INNER JOIN dbo.PRODUCTOS p
      ON p.EMPNIT = pr.EMPNIT
     AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(pr.CODPROD))
    WHERE pr.EMPNIT = @EMPNIT
  `);
  return result.rowsAffected?.[0] || 0;
}

/**
 * Recalcula PRECIOS.COSTO de todos los productos de la empresa
 * (PRODUCTOS.COSTO × EQUIVALE). Opcionalmente aplica primero items editados en pantalla.
 */
router.put('/all', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const itemsRaw = Array.isArray(req.body?.items)
    ? req.body.items
    : Array.isArray(req.body?.rows)
      ? req.body.rows
      : [];
  if (itemsRaw.length > BULK_MAX) {
    return res.status(400).json({ error: `Máximo ${BULK_MAX} productos editados por lote` });
  }
  const items = parseCostoItems(itemsRaw);

  const transaction = new sql.Transaction(await req.app.locals.getDbPool());
  try {
    await transaction.begin();
    const applied = await applyCostoItems(transaction, empnit, items);
    const preciosActualizados = await recalcAllPreciosCosto(transaction, empnit);
    const productosRes = await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`SELECT COUNT(*) AS total FROM dbo.PRODUCTOS WHERE EMPNIT = @EMPNIT`);
    await transaction.commit();
    res.json({
      ok: true,
      all: true,
      productos: productosRes.recordset[0]?.total || 0,
      preciosActualizados,
      actualizados: applied.updated.length,
      errores: applied.errors.length,
      updated: applied.updated,
      errors: applied.errors,
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    console.warn('[API PUT /actualizacion-costos/all]', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Actualización masiva: [{ CODPROD, COSTO }, ...]
 */
router.put('/bulk', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const itemsRaw = Array.isArray(req.body?.items)
    ? req.body.items
    : Array.isArray(req.body?.rows)
      ? req.body.rows
      : [];
  if (!itemsRaw.length) {
    return res.status(400).json({ error: 'Envíe items con CODPROD y COSTO' });
  }
  if (itemsRaw.length > BULK_MAX) {
    return res.status(400).json({ error: `Máximo ${BULK_MAX} productos por lote` });
  }

  const items = parseCostoItems(itemsRaw);
  if (!items.length) {
    return res.status(400).json({ error: 'No hay ítems válidos para actualizar' });
  }

  const transaction = new sql.Transaction(await req.app.locals.getDbPool());
  try {
    await transaction.begin();
    const { updated, errors } = await applyCostoItems(transaction, empnit, items);
    await transaction.commit();
    res.json({
      ok: true,
      actualizados: updated.length,
      errores: errors.length,
      updated,
      errors,
    });
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    console.warn('[API PUT /actualizacion-costos/bulk]', err.message);
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
    const result = await updateProductoCosto(transaction, empnit, codprod, costo);
    if (!result.ok) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    await transaction.commit();
    res.json(result);
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
