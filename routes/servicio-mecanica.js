const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { cleanText } = require('../lib/clean-text');

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
  return Math.round(Number(n) * 100) / 100;
}

function parseFecha(value) {
  const s = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function mesAnioFromFecha(fecha) {
  const [y, m] = String(fecha).slice(0, 10).split('-').map(Number);
  return { MES: m, ANIO: y };
}

function mapRow(r) {
  return {
    ID: r.ID ?? null,
    EMPNIT: r.EMPNIT ?? null,
    CODVEHICULO: r.CODVEHICULO ?? null,
    MES: r.MES ?? null,
    ANIO: r.ANIO ?? null,
    FECHA: r.FECHA ?? null,
    FALLA_REPORTADA: r.FALLA_REPORTADA ?? null,
    SERVICIO_REALIZADO: r.SERVICIO_REALIZADO ?? null,
    IMPORTE: toNumber(r.IMPORTE) ?? 0,
    OBS: r.OBS ?? null,
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

function readBody(req) {
  const fecha = parseFecha(req.body?.FECHA);
  const { MES, ANIO } = fecha ? mesAnioFromFecha(fecha) : { MES: null, ANIO: null };
  let importe = null;
  if (req.body?.IMPORTE !== undefined && req.body?.IMPORTE !== '') {
    const raw = String(req.body.IMPORTE).replace(/[^\d.-]/g, '');
    const n = Number(raw);
    importe = Number.isFinite(n) ? roundMoney(n) : null;
  }

  return {
    CODVEHICULO: parseId(req.body?.CODVEHICULO),
    FECHA: fecha,
    MES,
    ANIO,
    FALLA_REPORTADA: cleanText(req.body?.FALLA_REPORTADA),
    SERVICIO_REALIZADO: cleanText(req.body?.SERVICIO_REALIZADO),
    IMPORTE: importe,
    OBS: cleanText(req.body?.OBS, 500),
  };
}

function validateBody(data) {
  if (data.CODVEHICULO === null) return 'Seleccione el vehículo';
  if (!data.FECHA) return 'La fecha es obligatoria (YYYY-MM-DD)';
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
    console.warn('[API GET /servicio-mecanica/lookups/vehiculos]', err.message);
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
  const codvehiculo = parseId(req.query.codvehiculo);
  const filterVehiculo = codvehiculo !== null;
  const fechaini = parseFecha(req.query.fechaini);
  const fechafin = parseFecha(req.query.fechafin);
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('q', sql.NVarChar, q || null)
      .input('qLike', sql.NVarChar, qLike);
    if (filterVehiculo) request.input('CODVEHICULO', sql.Int, codvehiculo);
    if (fechaini) request.input('FECHAINI', sql.Date, fechaini);
    if (fechafin) request.input('FECHAFIN', sql.Date, fechafin);
    const vehiculoSql = filterVehiculo ? ' AND m.CODVEHICULO = @CODVEHICULO' : '';
    const fechaIniSql = fechaini ? ' AND m.FECHA >= @FECHAINI' : '';
    const fechaFinSql = fechafin ? ' AND m.FECHA <= @FECHAFIN' : '';
    const result = await request.query(`
        SELECT
          m.ID,
          m.EMPNIT,
          m.CODVEHICULO,
          m.MES,
          m.ANIO,
          m.FECHA,
          m.FALLA_REPORTADA,
          m.SERVICIO_REALIZADO,
          m.IMPORTE,
          m.OBS,
          v.PLACA,
          v.DESCRIPCION AS VEHICULO_DESCRIPCION
        FROM dbo.VEHICULOS_MECANICA m
        LEFT JOIN dbo.VEHICULOS v
          ON m.EMPNIT = v.EMPNIT AND m.CODVEHICULO = v.CODVEHICULO
        WHERE m.EMPNIT = @EMPNIT
          ${vehiculoSql}
          ${fechaIniSql}
          ${fechaFinSql}
          AND (
            @q IS NULL OR @q = ''
            OR CAST(m.CODVEHICULO AS VARCHAR(20)) LIKE @qLike
            OR m.FALLA_REPORTADA LIKE @qLike
            OR m.SERVICIO_REALIZADO LIKE @qLike
            OR m.OBS LIKE @qLike
            OR v.PLACA LIKE @qLike
            OR v.DESCRIPCION LIKE @qLike
          )
        ORDER BY m.FECHA ASC, m.ID ASC
      `);
    const rows = result.recordset.map(mapRow);
    res.json({ rows, total: rows.length, empnit });
  } catch (err) {
    console.warn('[API GET /servicio-mecanica]', err.message);
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
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
      .input('MES', sql.Int, data.MES)
      .input('ANIO', sql.Int, data.ANIO)
      .input('FECHA', sql.Date, data.FECHA)
      .input('FALLA_REPORTADA', sql.VarChar, data.FALLA_REPORTADA)
      .input('SERVICIO_REALIZADO', sql.VarChar, data.SERVICIO_REALIZADO)
      .input('IMPORTE', sql.Decimal(18, 2), data.IMPORTE ?? 0)
      .input('OBS', sql.VarChar, data.OBS)
      .query(`
        INSERT INTO dbo.VEHICULOS_MECANICA (
          EMPNIT, CODVEHICULO, MES, ANIO, FECHA,
          FALLA_REPORTADA, SERVICIO_REALIZADO, IMPORTE, OBS
        )
        OUTPUT INSERTED.ID
        VALUES (
          @EMPNIT, @CODVEHICULO, @MES, @ANIO, @FECHA,
          @FALLA_REPORTADA, @SERVICIO_REALIZADO, @IMPORTE, @OBS
        )
      `);
    const id = result.recordset[0]?.ID;
    res.status(201).json({ ok: true, ID: id, ...data });
  } catch (err) {
    console.warn('[API POST /servicio-mecanica]', err.message);
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
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
      .input('MES', sql.Int, data.MES)
      .input('ANIO', sql.Int, data.ANIO)
      .input('FECHA', sql.Date, data.FECHA)
      .input('FALLA_REPORTADA', sql.VarChar, data.FALLA_REPORTADA)
      .input('SERVICIO_REALIZADO', sql.VarChar, data.SERVICIO_REALIZADO)
      .input('IMPORTE', sql.Decimal(18, 2), data.IMPORTE ?? 0)
      .input('OBS', sql.VarChar, data.OBS)
      .query(`
        UPDATE dbo.VEHICULOS_MECANICA
        SET CODVEHICULO = @CODVEHICULO,
            MES = @MES,
            ANIO = @ANIO,
            FECHA = @FECHA,
            FALLA_REPORTADA = @FALLA_REPORTADA,
            SERVICIO_REALIZADO = @SERVICIO_REALIZADO,
            IMPORTE = @IMPORTE,
            OBS = @OBS
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ ok: true, ID: id, ...data });
  } catch (err) {
    console.warn('[API PUT /servicio-mecanica/:id]', err.message);
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
        DELETE FROM dbo.VEHICULOS_MECANICA
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /servicio-mecanica/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
