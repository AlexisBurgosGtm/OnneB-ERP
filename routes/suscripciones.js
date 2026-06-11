const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');

const router = express.Router();

const CREATE_TABLE_SQL = `
IF EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'SUSCRIPCIONES' AND schema_id = SCHEMA_ID('dbo')
) AND NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'DOCUMENTOS_SUSCRIPCIONES' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  EXEC sp_rename 'dbo.SUSCRIPCIONES', 'DOCUMENTOS_SUSCRIPCIONES';
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'DOCUMENTOS_SUSCRIPCIONES' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.DOCUMENTOS_SUSCRIPCIONES (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    CODCLIENTE INT NOT NULL,
    CODPROD VARCHAR(30) NOT NULL,
    COBRO_MENSUAL DECIMAL(18, 3) NOT NULL CONSTRAINT DF_DOCUMENTOS_SUSCRIPCIONES_COBRO DEFAULT (0),
    PAGADO_MES VARCHAR(2) NOT NULL CONSTRAINT DF_DOCUMENTOS_SUSCRIPCIONES_PAGADO DEFAULT ('NO'),
    MESES_DEBE INT NOT NULL CONSTRAINT DF_DOCUMENTOS_SUSCRIPCIONES_MESES DEFAULT (0),
    ACTIVO VARCHAR(2) NOT NULL CONSTRAINT DF_DOCUMENTOS_SUSCRIPCIONES_ACTIVO DEFAULT ('SI'),
    OBS VARCHAR(255) NULL,
    FECHA_INICIO DATE NULL,
    CONSTRAINT UQ_DOCUMENTOS_SUSCRIPCIONES UNIQUE (EMPNIT, CODCLIENTE, CODPROD)
  );
  CREATE INDEX IX_DOCUMENTOS_SUSCRIPCIONES_EMPNIT ON dbo.DOCUMENTOS_SUSCRIPCIONES (EMPNIT);
END;
`;

let tableEnsured = false;

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

function normalizeSiNo(value, defaultVal = 'NO') {
  const s = String(value ?? defaultVal).trim().toUpperCase();
  return s === 'SI' ? 'SI' : 'NO';
}

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

async function ensureTable(pool) {
  if (tableEnsured) return;
  await pool.request().query(CREATE_TABLE_SQL);
  tableEnsured = true;
}

const LIST_SELECT = `
  s.ID,
  s.EMPNIT,
  s.CODCLIENTE,
  s.CODPROD,
  s.COBRO_MENSUAL,
  s.PAGADO_MES,
  s.MESES_DEBE,
  s.ACTIVO,
  s.OBS,
  s.FECHA_INICIO,
  c.NEGOCIO,
  c.NOMBRECLIENTE,
  c.NIT,
  p.DESPROD
`;

const LIST_FROM = `
  FROM dbo.DOCUMENTOS_SUSCRIPCIONES s
  INNER JOIN dbo.CLIENTES c ON s.EMPNIT = c.EMPNIT AND s.CODCLIENTE = c.CODCLIENTE
  INNER JOIN dbo.PRODUCTOS p ON s.EMPNIT = p.EMPNIT AND s.CODPROD = p.CODPROD
`;

async function getSubscription(pool, empnit, id) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ${LIST_SELECT}
      ${LIST_FROM}
      WHERE s.EMPNIT = @EMPNIT AND s.ID = @ID
    `);
  return result.recordset[0] || null;
}

async function validateCliente(pool, empnit, codcliente) {
  const r = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCLIENTE', sql.Int, codcliente)
    .query(`
      SELECT CODCLIENTE, NOMBRECLIENTE, NEGOCIO, HABILITADO
      FROM dbo.CLIENTES
      WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
    `);
  return r.recordset[0] || null;
}

async function validateServicio(pool, empnit, codprod) {
  const r = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .query(`
      SELECT CODPROD, DESPROD, TIPOPROD, HABILITADO
      FROM dbo.PRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD AND TIPOPROD = 'S'
    `);
  return r.recordset[0] || null;
}

router.get('/lookups/servicios', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool.request().input('EMPNIT', sql.VarChar, empnit).query(`
      SELECT
        p.CODPROD,
        p.DESPROD,
        p.COSTO,
        (
          SELECT TOP 1 pr.PRECIO
          FROM dbo.PRECIOS pr
          WHERE pr.EMPNIT = p.EMPNIT AND pr.CODPROD = p.CODPROD AND pr.HABILITADO = 'SI'
          ORDER BY pr.EQUIVALE DESC
        ) AS PRECIO_REF
      FROM dbo.PRODUCTOS p
      WHERE p.EMPNIT = @EMPNIT
        AND p.TIPOPROD = 'S'
        AND p.HABILITADO = 'SI'
      ORDER BY p.DESPROD, p.CODPROD
    `);
    res.json({ rows: result.recordset, empnit });
  } catch (err) {
    console.warn('[API GET /suscripciones/lookups/servicios]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const activo = String(req.query.activo || '').trim().toUpperCase();
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    let whereExtra = '';
    if (q) {
      request.input('qLike', sql.NVarChar, `%${q}%`);
      whereExtra += `
        AND (
          CAST(s.CODCLIENTE AS varchar(20)) LIKE @qLike
          OR c.NOMBRECLIENTE LIKE @qLike
          OR c.NEGOCIO LIKE @qLike
          OR c.NIT LIKE @qLike
          OR s.CODPROD LIKE @qLike
          OR p.DESPROD LIKE @qLike
        )
      `;
    }
    if (activo === 'SI' || activo === 'NO') {
      request.input('ACTIVO', sql.VarChar, activo);
      whereExtra += ' AND s.ACTIVO = @ACTIVO';
    }
    const result = await request.query(`
      SELECT ${LIST_SELECT}
      ${LIST_FROM}
      WHERE s.EMPNIT = @EMPNIT
      ${whereExtra}
      ORDER BY c.NOMBRECLIENTE, p.DESPROD, s.ID
    `);
    res.json({ rows: result.recordset, total: result.recordset.length, empnit, q: q || null });
  } catch (err) {
    console.warn('[API GET /suscripciones]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const codcliente = parseInt(req.body?.CODCLIENTE, 10);
  const codprod = String(req.body?.CODPROD || '').trim();
  const cobro = roundMoney(req.body?.COBRO_MENSUAL);
  const pagadoMes = normalizeSiNo(req.body?.PAGADO_MES, 'NO');
  const mesesDebe = Math.max(0, parseInt(req.body?.MESES_DEBE, 10) || 0);
  const activo = normalizeSiNo(req.body?.ACTIVO, 'SI');
  const obs = String(req.body?.OBS || '').trim();
  const fechaInicio = req.body?.FECHA_INICIO ? String(req.body.FECHA_INICIO).slice(0, 10) : null;

  if (Number.isNaN(codcliente)) return res.status(400).json({ error: 'CODCLIENTE inválido' });
  if (!codprod) return res.status(400).json({ error: 'CODPROD es obligatorio' });
  if (cobro < 0) return res.status(400).json({ error: 'COBRO_MENSUAL inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);

    const cliente = await validateCliente(pool, empnit, codcliente);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    const servicio = await validateServicio(pool, empnit, codprod);
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado (TIPOPROD = S)' });

    const ins = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .input('CODPROD', sql.VarChar, codprod)
      .input('COBRO_MENSUAL', sql.Decimal(18, 3), cobro)
      .input('PAGADO_MES', sql.VarChar, pagadoMes)
      .input('MESES_DEBE', sql.Int, mesesDebe)
      .input('ACTIVO', sql.VarChar, activo)
      .input('OBS', sql.VarChar, obs || null)
      .input('FECHA_INICIO', sql.Date, fechaInicio || null)
      .query(`
        INSERT INTO dbo.DOCUMENTOS_SUSCRIPCIONES (
          EMPNIT, CODCLIENTE, CODPROD, COBRO_MENSUAL, PAGADO_MES, MESES_DEBE, ACTIVO, OBS, FECHA_INICIO
        ) VALUES (
          @EMPNIT, @CODCLIENTE, @CODPROD, @COBRO_MENSUAL, @PAGADO_MES, @MESES_DEBE, @ACTIVO, @OBS, @FECHA_INICIO
        );
        SELECT SCOPE_IDENTITY() AS ID;
      `);

    const id = ins.recordset[0]?.ID;
    const row = await getSubscription(pool, empnit, id);
    res.status(201).json(row);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ error: 'Ya existe una suscripción de este servicio para el cliente' });
    }
    console.warn('[API POST /suscripciones]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });

  const codcliente = parseInt(req.body?.CODCLIENTE, 10);
  const codprod = String(req.body?.CODPROD || '').trim();
  const cobro = roundMoney(req.body?.COBRO_MENSUAL);
  const pagadoMes = normalizeSiNo(req.body?.PAGADO_MES, 'NO');
  const mesesDebe = Math.max(0, parseInt(req.body?.MESES_DEBE, 10) || 0);
  const activo = normalizeSiNo(req.body?.ACTIVO, 'SI');
  const obs = String(req.body?.OBS || '').trim();
  const fechaInicio = req.body?.FECHA_INICIO ? String(req.body.FECHA_INICIO).slice(0, 10) : null;

  if (Number.isNaN(codcliente)) return res.status(400).json({ error: 'CODCLIENTE inválido' });
  if (!codprod) return res.status(400).json({ error: 'CODPROD es obligatorio' });
  if (cobro < 0) return res.status(400).json({ error: 'COBRO_MENSUAL inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);

    const cliente = await validateCliente(pool, empnit, codcliente);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });
    const servicio = await validateServicio(pool, empnit, codprod);
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado (TIPOPROD = S)' });

    const result = await pool
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .input('CODPROD', sql.VarChar, codprod)
      .input('COBRO_MENSUAL', sql.Decimal(18, 3), cobro)
      .input('PAGADO_MES', sql.VarChar, pagadoMes)
      .input('MESES_DEBE', sql.Int, mesesDebe)
      .input('ACTIVO', sql.VarChar, activo)
      .input('OBS', sql.VarChar, obs || null)
      .input('FECHA_INICIO', sql.Date, fechaInicio || null)
      .query(`
        UPDATE dbo.DOCUMENTOS_SUSCRIPCIONES SET
          CODCLIENTE = @CODCLIENTE,
          CODPROD = @CODPROD,
          COBRO_MENSUAL = @COBRO_MENSUAL,
          PAGADO_MES = @PAGADO_MES,
          MESES_DEBE = @MESES_DEBE,
          ACTIVO = @ACTIVO,
          OBS = @OBS,
          FECHA_INICIO = @FECHA_INICIO
        WHERE ID = @ID AND EMPNIT = @EMPNIT
      `);

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Suscripción no encontrada' });
    const row = await getSubscription(pool, empnit, id);
    res.json(row);
  } catch (err) {
    if (err.number === 2627 || err.number === 2601) {
      return res.status(409).json({ error: 'Ya existe una suscripción de este servicio para el cliente' });
    }
    console.warn('[API PUT /suscripciones/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/pagado-mes', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  const pagadoMes = normalizeSiNo(req.body?.PAGADO_MES, 'NO');

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);

    const current = await getSubscription(pool, empnit, id);
    if (!current) return res.status(404).json({ error: 'Suscripción no encontrada' });

    let mesesDebe = Math.max(0, parseInt(current.MESES_DEBE, 10) || 0);
    const wasPaid = normalizeSiNo(current.PAGADO_MES) === 'SI';
    if (pagadoMes === 'SI' && !wasPaid && mesesDebe > 0) mesesDebe -= 1;
    if (pagadoMes === 'NO' && wasPaid) mesesDebe += 1;

    await pool
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('PAGADO_MES', sql.VarChar, pagadoMes)
      .input('MESES_DEBE', sql.Int, mesesDebe)
      .query(`
        UPDATE dbo.DOCUMENTOS_SUSCRIPCIONES SET PAGADO_MES = @PAGADO_MES, MESES_DEBE = @MESES_DEBE
        WHERE ID = @ID AND EMPNIT = @EMPNIT
      `);

    const row = await getSubscription(pool, empnit, id);
    res.json(row);
  } catch (err) {
    console.warn('[API PATCH /suscripciones/:id/pagado-mes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/meses-debe', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  const mesesDebe = Math.max(0, parseInt(req.body?.MESES_DEBE, 10));
  if (Number.isNaN(mesesDebe)) return res.status(400).json({ error: 'MESES_DEBE inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('MESES_DEBE', sql.Int, mesesDebe)
      .query(`
        UPDATE dbo.DOCUMENTOS_SUSCRIPCIONES SET MESES_DEBE = @MESES_DEBE
        WHERE ID = @ID AND EMPNIT = @EMPNIT
      `);
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Suscripción no encontrada' });
    const row = await getSubscription(pool, empnit, id);
    res.json(row);
  } catch (err) {
    console.warn('[API PATCH /suscripciones/:id/meses-debe]', err.message);
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
    await ensureTable(pool);
    const result = await pool
      .request()
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar, empnit)
      .query('DELETE FROM dbo.DOCUMENTOS_SUSCRIPCIONES WHERE ID = @ID AND EMPNIT = @EMPNIT');
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Suscripción no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /suscripciones/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
