const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { assertAdminPass } = require('../lib/config-auth');

const router = express.Router();

const MONTO_TOKENS = ['TOTAL', 'SUBTOTAL', 'IVA', 'COSTO'];

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

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

async function loadFormatoMeta(pool, empnit, id) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ID, CODFORMATO, DESFORMATO
      FROM dbo.CONTA_FORMATOS
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return result.recordset[0] || null;
}

async function codformatoExists(pool, empnit, codformato, excludeId = null) {
  const cod = String(codformato ?? '').trim();
  if (!cod) return false;
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODFORMATO', sql.VarChar, cod);
  let excludeSql = '';
  if (excludeId != null) {
    request.input('ID', sql.Int, excludeId);
    excludeSql = ' AND ID <> @ID';
  }
  const result = await request.query(`
    SELECT COUNT(*) AS cnt FROM dbo.CONTA_FORMATOS
    WHERE EMPNIT = @EMPNIT
      AND UPPER(LTRIM(RTRIM(CODFORMATO))) = UPPER(LTRIM(RTRIM(@CODFORMATO)))
      ${excludeSql}
  `);
  return Number(result.recordset[0]?.cnt) > 0;
}

async function formatoEnTipodocumentos(pool, empnit, codformato) {
  const cod = String(codformato ?? '').trim();
  if (!cod) return 0;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('COD', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND (
        UPPER(LTRIM(RTRIM(ISNULL(CODFORMATO, '')))) = UPPER(LTRIM(RTRIM(@COD)))
        OR UPPER(LTRIM(RTRIM(ISNULL(CODFORMATOCON, '')))) = UPPER(LTRIM(RTRIM(@COD)))
        OR UPPER(LTRIM(RTRIM(ISNULL(CODFORMATOCRE, '')))) = UPPER(LTRIM(RTRIM(@COD)))
      )
    `);
  return Number(result.recordset[0]?.cnt) || 0;
}

async function cuentaExists(pool, empnit, codcuenta) {
  const cod = String(codcuenta ?? '').trim();
  if (!cod) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCUENTA', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt FROM dbo.CONTA_CUENTAS
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(CODCUENTA))) = UPPER(LTRIM(RTRIM(@CODCUENTA)))
    `);
  return Number(result.recordset[0]?.cnt) > 0;
}

function normalizeMontoToken(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return '';
  return MONTO_TOKENS.includes(s) ? s : null;
}

function validatePartidaBody(body) {
  const codcuenta = String(body?.CODCUENTA ?? '').trim();
  if (!codcuenta) return 'CODCUENTA es obligatorio';
  const debe = normalizeMontoToken(body?.DEBE);
  if (body?.DEBE !== undefined && body?.DEBE !== null && String(body.DEBE).trim() && debe === null) {
    return `DEBE inválido (${MONTO_TOKENS.join(', ')})`;
  }
  const haber = normalizeMontoToken(body?.HABER);
  if (body?.HABER !== undefined && body?.HABER !== null && String(body.HABER).trim() && haber === null) {
    return `HABER inválido (${MONTO_TOKENS.join(', ')})`;
  }
  if (!debe && !haber) return 'Indique DEBE o HABER';
  if (debe && haber) {
    return 'Una línea no puede tener DEBE y HABER. Agregue la cuenta otra vez en una segunda línea';
  }
  const centro = String(body?.CENTRO_COSTO ?? '1').trim() || '1';
  if (centro.length > 3) return 'CENTRO_COSTO máximo 3 caracteres';
  return {
    CODCUENTA: codcuenta,
    DEBE: debe || '',
    HABER: haber || '',
    CENTRO_COSTO: centro,
  };
}

router.get('/cuentas-lookup', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT CODCUENTA, DESCRIPCION, NIVEL, PD
      FROM dbo.CONTA_CUENTAS
      WHERE EMPNIT = @EMPNIT AND ISNULL(ACTIVO, 'SI') = 'SI'
      ORDER BY CODCUENTA
    `);
    res.json({ rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /formatos-contables/cuentas-lookup]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT
        f.ID,
        f.CODFORMATO,
        f.DESFORMATO,
        (
          SELECT COUNT(*)
          FROM dbo.CONTA_FORMATOS_PARTIDAS p
          WHERE p.EMPNIT = f.EMPNIT AND p.CODFORMATO = f.CODFORMATO
        ) AS PARTIDAS
      FROM dbo.CONTA_FORMATOS f
      WHERE f.EMPNIT = @EMPNIT
      ORDER BY f.CODFORMATO
    `);
    res.json({ rows: result.recordset, total: result.recordset.length, empnit });
  } catch (err) {
    console.warn('[API GET /formatos-contables]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codformato = String(req.body?.CODFORMATO ?? '').trim();
  const desformato = String(req.body?.DESFORMATO ?? '').trim();
  if (!codformato) return res.status(400).json({ error: 'CODFORMATO es obligatorio' });
  if (!desformato) return res.status(400).json({ error: 'DESFORMATO es obligatorio' });
  try {
    const pool = await req.app.locals.getDbPool();
    if (await codformatoExists(pool, empnit, codformato)) {
      return res.status(400).json({ error: `Ya existe el formato "${codformato}"` });
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODFORMATO', sql.VarChar, codformato)
      .input('DESFORMATO', sql.VarChar, desformato)
      .query(`
        INSERT INTO dbo.CONTA_FORMATOS (EMPNIT, CODFORMATO, DESFORMATO)
        OUTPUT INSERTED.ID
        VALUES (@EMPNIT, @CODFORMATO, @DESFORMATO)
      `);
    res.status(201).json({
      ok: true,
      ID: result.recordset[0]?.ID,
      CODFORMATO: codformato,
      DESFORMATO: desformato,
    });
  } catch (err) {
    console.warn('[API POST /formatos-contables]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/partidas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const meta = await loadFormatoMeta(pool, empnit, id);
    if (!meta) return res.status(404).json({ error: 'Formato no encontrado' });
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODFORMATO', sql.VarChar, meta.CODFORMATO)
      .query(`
        SELECT
          p.ID,
          p.CODFORMATO,
          p.CODCUENTA,
          p.DEBE,
          p.HABER,
          p.CENTRO_COSTO,
          c.DESCRIPCION AS DESCRIPCION_CUENTA
        FROM dbo.CONTA_FORMATOS_PARTIDAS p
        LEFT JOIN dbo.CONTA_CUENTAS c
          ON c.EMPNIT = p.EMPNIT AND c.CODCUENTA = p.CODCUENTA
        WHERE p.EMPNIT = @EMPNIT AND p.CODFORMATO = @CODFORMATO
        ORDER BY
          CASE WHEN LTRIM(RTRIM(ISNULL(p.DEBE, ''))) <> '' THEN 0 ELSE 1 END,
          p.ID
      `);
    res.json({ header: meta, rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /formatos-contables/partidas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/partidas', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  const validated = validatePartidaBody(req.body);
  if (typeof validated === 'string') return res.status(400).json({ error: validated });
  try {
    const pool = await req.app.locals.getDbPool();
    const meta = await loadFormatoMeta(pool, empnit, id);
    if (!meta) return res.status(404).json({ error: 'Formato no encontrado' });
    if (!(await cuentaExists(pool, empnit, validated.CODCUENTA))) {
      return res.status(400).json({ error: `La cuenta "${validated.CODCUENTA}" no existe en nomenclatura` });
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODFORMATO', sql.VarChar, meta.CODFORMATO)
      .input('CODCUENTA', sql.VarChar, validated.CODCUENTA)
      .input('DEBE', sql.VarChar, validated.DEBE)
      .input('HABER', sql.VarChar, validated.HABER)
      .input('CENTRO_COSTO', sql.VarChar, validated.CENTRO_COSTO)
      .query(`
        INSERT INTO dbo.CONTA_FORMATOS_PARTIDAS
          (EMPNIT, CODFORMATO, CODCUENTA, DEBE, HABER, CENTRO_COSTO)
        OUTPUT INSERTED.ID
        VALUES (@EMPNIT, @CODFORMATO, @CODCUENTA, @DEBE, @HABER, @CENTRO_COSTO)
      `);
    res.status(201).json({ ok: true, ID: result.recordset[0]?.ID, ...validated });
  } catch (err) {
    console.warn('[API POST /formatos-contables/partidas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/partidas/:partidaId', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const partidaId = parseId(req.params.partidaId);
  if (partidaId === null) return res.status(400).json({ error: 'ID de partida inválido' });
  const validated = validatePartidaBody(req.body);
  if (typeof validated === 'string') return res.status(400).json({ error: validated });
  try {
    const pool = await req.app.locals.getDbPool();
    if (!(await cuentaExists(pool, empnit, validated.CODCUENTA))) {
      return res.status(400).json({ error: `La cuenta "${validated.CODCUENTA}" no existe en nomenclatura` });
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, partidaId)
      .input('CODCUENTA', sql.VarChar, validated.CODCUENTA)
      .input('DEBE', sql.VarChar, validated.DEBE)
      .input('HABER', sql.VarChar, validated.HABER)
      .input('CENTRO_COSTO', sql.VarChar, validated.CENTRO_COSTO)
      .query(`
        UPDATE dbo.CONTA_FORMATOS_PARTIDAS
        SET CODCUENTA = @CODCUENTA,
            DEBE = @DEBE,
            HABER = @HABER,
            CENTRO_COSTO = @CENTRO_COSTO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }
    res.json({ ok: true, ID: partidaId, ...validated });
  } catch (err) {
    console.warn('[API PUT /formatos-contables/partidas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/partidas/:partidaId', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const partidaId = parseId(req.params.partidaId);
  if (partidaId === null) return res.status(400).json({ error: 'ID de partida inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, partidaId)
      .query(`
        DELETE FROM dbo.CONTA_FORMATOS_PARTIDAS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /formatos-contables/partidas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  const desformato = String(req.body?.DESFORMATO ?? '').trim();
  if (!desformato) return res.status(400).json({ error: 'DESFORMATO es obligatorio' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .input('DESFORMATO', sql.VarChar, desformato)
      .query(`
        UPDATE dbo.CONTA_FORMATOS
        SET DESFORMATO = @DESFORMATO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Formato no encontrado' });
    }
    res.json({ ok: true, ID: id, DESFORMATO: desformato });
  } catch (err) {
    console.warn('[API PUT /formatos-contables]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await assertAdminPass(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));
    const meta = await loadFormatoMeta(pool, empnit, id);
    if (!meta) return res.status(404).json({ error: 'Formato no encontrado' });
    const used = await formatoEnTipodocumentos(pool, empnit, meta.CODFORMATO);
    if (used > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: el formato está asignado en ${used} tipo(s) de documento`,
      });
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODFORMATO', sql.VarChar, meta.CODFORMATO)
        .query(`
          DELETE FROM dbo.CONTA_FORMATOS_PARTIDAS
          WHERE EMPNIT = @EMPNIT AND CODFORMATO = @CODFORMATO
        `);
      const del = await transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, id)
        .query(`
          DELETE FROM dbo.CONTA_FORMATOS
          WHERE EMPNIT = @EMPNIT AND ID = @ID
        `);
      if (del.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Formato no encontrado' });
      }
      await transaction.commit();
      res.json({ ok: true });
    } catch (inner) {
      await transaction.rollback();
      throw inner;
    }
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ error: err.message });
    }
    console.warn('[API DELETE /formatos-contables]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
