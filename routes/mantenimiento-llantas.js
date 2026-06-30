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

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function parseFecha(value) {
  const s = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function mapRow(r) {
  return {
    ID: r.ID ?? null,
    EMPNIT: r.EMPNIT ?? null,
    CODVEHICULO: r.CODVEHICULO ?? null,
    FECHA: r.FECHA ?? null,
    NOLLANTA: r.NOLLANTA ?? null,
    DETALLES: r.DETALLES ?? null,
    IMPORTE: toNumber(r.IMPORTE) ?? 0,
    ENCARGADO: r.ENCARGADO ?? null,
    PLACA: r.PLACA ?? null,
    VEHICULO_DESCRIPCION: r.VEHICULO_DESCRIPCION ?? null,
  };
}

async function vehiculoExists(pool, empnit, codvehiculo) {
  const cod = parseId(codvehiculo);
  if (cod === null) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODVEHICULO', sql.Int, cod)
    .query(`
      SELECT TOP 1 CODVEHICULO
      FROM dbo.VEHICULOS
      WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
    `);
  return result.recordset.length > 0;
}

async function nollantaExists(pool, nollanta) {
  const code = String(nollanta || '').trim();
  if (!code) return false;
  const result = await pool
    .request()
    .input('NOLLANTA', sql.VarChar, code)
    .query(`
      SELECT TOP 1 NOLLANTA
      FROM dbo.VEHICULOS_CONFIG_LLANTAS
      WHERE NOLLANTA = @NOLLANTA
    `);
  return result.recordset.length > 0;
}

function readBody(req) {
  return {
    CODVEHICULO: parseId(req.body?.CODVEHICULO),
    FECHA: parseFecha(req.body?.FECHA),
    NOLLANTA: String(req.body?.NOLLANTA ?? '').trim() || null,
    DETALLES: String(req.body?.DETALLES ?? '').trim() || null,
    IMPORTE: req.body?.IMPORTE !== undefined && req.body?.IMPORTE !== '' ? roundMoney(req.body.IMPORTE) : null,
    ENCARGADO: String(req.body?.ENCARGADO ?? '').trim() || null,
  };
}

function validateBody(data) {
  if (data.CODVEHICULO === null) return 'Seleccione el vehículo';
  if (!data.FECHA) return 'La fecha es obligatoria (YYYY-MM-DD)';
  if (!data.NOLLANTA) return 'Seleccione el número de llanta';
  return null;
}

router.get('/lookups/vehiculos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT CODVEHICULO, PLACA, DESCRIPCION, MARCA, LINEA, TIPO
        FROM dbo.VEHICULOS
        WHERE EMPNIT = @EMPNIT
        ORDER BY PLACA, CODVEHICULO
      `);
    res.json({ rows: result.recordset, empnit });
  } catch (err) {
    console.warn('[API GET /mantenimiento-llantas/lookups/vehiculos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/lookups/nollantas', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().query(`
      SELECT NOLLANTA
      FROM dbo.VEHICULOS_CONFIG_LLANTAS
      WHERE NOLLANTA IS NOT NULL AND LTRIM(RTRIM(NOLLANTA)) <> ''
      ORDER BY NOLLANTA
    `);
    res.json({ rows: result.recordset });
  } catch (err) {
    console.warn('[API GET /mantenimiento-llantas/lookups/nollantas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const qLike = q ? `%${q}%` : null;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('q', sql.NVarChar, q || null)
      .input('qLike', sql.NVarChar, qLike)
      .query(`
        SELECT
          m.ID,
          m.EMPNIT,
          m.CODVEHICULO,
          m.FECHA,
          m.NOLLANTA,
          m.DETALLES,
          m.IMPORTE,
          m.ENCARGADO,
          v.PLACA,
          v.DESCRIPCION AS VEHICULO_DESCRIPCION
        FROM dbo.VEHICULOS_MANTENIMIENTO_LLANTAS m
        LEFT JOIN dbo.VEHICULOS v
          ON m.EMPNIT = v.EMPNIT AND m.CODVEHICULO = v.CODVEHICULO
        WHERE m.EMPNIT = @EMPNIT
          AND (
            @q IS NULL OR @q = ''
            OR CAST(m.CODVEHICULO AS VARCHAR(20)) LIKE @qLike
            OR m.NOLLANTA LIKE @qLike
            OR m.DETALLES LIKE @qLike
            OR m.ENCARGADO LIKE @qLike
            OR v.PLACA LIKE @qLike
            OR v.DESCRIPCION LIKE @qLike
          )
        ORDER BY m.FECHA DESC, m.ID DESC
      `);
    const rows = result.recordset.map(mapRow);
    res.json({ rows, total: rows.length, empnit });
  } catch (err) {
    console.warn('[API GET /mantenimiento-llantas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const data = readBody(req);
  const errReq = validateBody(data);
  if (errReq) return res.status(400).json({ error: errReq });
  try {
    const pool = await req.app.locals.getDbPool();
    if (!(await vehiculoExists(pool, empnit, data.CODVEHICULO))) {
      return res.status(400).json({ error: 'Vehículo no encontrado en la empresa' });
    }
    if (!(await nollantaExists(pool, data.NOLLANTA))) {
      return res.status(400).json({ error: 'Número de llanta no válido' });
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
      .input('FECHA', sql.Date, data.FECHA)
      .input('NOLLANTA', sql.VarChar, data.NOLLANTA)
      .input('DETALLES', sql.VarChar, data.DETALLES)
      .input('IMPORTE', sql.Decimal(18, 3), data.IMPORTE ?? 0)
      .input('ENCARGADO', sql.VarChar, data.ENCARGADO)
      .query(`
        INSERT INTO dbo.VEHICULOS_MANTENIMIENTO_LLANTAS
          (EMPNIT, CODVEHICULO, FECHA, NOLLANTA, DETALLES, IMPORTE, ENCARGADO)
        OUTPUT INSERTED.ID
        VALUES (@EMPNIT, @CODVEHICULO, @FECHA, @NOLLANTA, @DETALLES, @IMPORTE, @ENCARGADO)
      `);
    const id = result.recordset[0]?.ID;
    res.status(201).json({ ok: true, ID: id, ...data });
  } catch (err) {
    console.warn('[API POST /mantenimiento-llantas]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ error: 'ID inválido' });
  const data = readBody(req);
  const errReq = validateBody(data);
  if (errReq) return res.status(400).json({ error: errReq });
  try {
    const pool = await req.app.locals.getDbPool();
    if (!(await vehiculoExists(pool, empnit, data.CODVEHICULO))) {
      return res.status(400).json({ error: 'Vehículo no encontrado en la empresa' });
    }
    if (!(await nollantaExists(pool, data.NOLLANTA))) {
      return res.status(400).json({ error: 'Número de llanta no válido' });
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
      .input('FECHA', sql.Date, data.FECHA)
      .input('NOLLANTA', sql.VarChar, data.NOLLANTA)
      .input('DETALLES', sql.VarChar, data.DETALLES)
      .input('IMPORTE', sql.Decimal(18, 3), data.IMPORTE ?? 0)
      .input('ENCARGADO', sql.VarChar, data.ENCARGADO)
      .query(`
        UPDATE dbo.VEHICULOS_MANTENIMIENTO_LLANTAS
        SET CODVEHICULO = @CODVEHICULO,
            FECHA = @FECHA,
            NOLLANTA = @NOLLANTA,
            DETALLES = @DETALLES,
            IMPORTE = @IMPORTE,
            ENCARGADO = @ENCARGADO
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ ok: true, ID: id, ...data });
  } catch (err) {
    console.warn('[API PUT /mantenimiento-llantas/:id]', err.message);
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
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .query(`
        DELETE FROM dbo.VEHICULOS_MANTENIMIENTO_LLANTAS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /mantenimiento-llantas/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
