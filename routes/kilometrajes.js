const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const {
  isKilometrajeCombustibleValid,
  normalizeKilometrajeCombustible,
} = require('../lib/kilometrajes-combustible');

const router = express.Router();

const CODTIPO_EMPLEADO_TRANSPORTE = 6;

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

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
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
    CODPLATAFORMA: r.CODPLATAFORMA ?? null,
    MES: r.MES ?? null,
    ANIO: r.ANIO ?? null,
    FECHA: r.FECHA ?? null,
    KMS_INICIAL: toNumber(r.KMS_INICIAL),
    KMS_FINAL: toNumber(r.KMS_FINAL),
    KMS_RECORRIDO: toNumber(r.KMS_RECORRIDO),
    CODEMP: r.CODEMP ?? null,
    GALONES_COMBUSTIBLE: toNumber(r.GALONES_COMBUSTIBLE),
    IMPORTE_COMBUSTIBLE: toNumber(r.IMPORTE_COMBUSTIBLE),
    TIPO_COMBUSTIBLE: r.TIPO_COMBUSTIBLE ?? null,
    VIATICOS: toNumber(r.VIATICOS),
    OBS: r.OBS ?? null,
    PLACA: r.PLACA ?? null,
    VEHICULO_DESCRIPCION: r.VEHICULO_DESCRIPCION ?? null,
    NOMEMPLEADO: r.NOMEMPLEADO ?? null,
    PLATAFORMA_NOMBRE: r.PLATAFORMA_NOMBRE ?? null,
    PLATAFORMA_PLACA: r.PLATAFORMA_PLACA ?? null,
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
      SELECT TOP 1 CODVEHICULO FROM dbo.VEHICULOS
      WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
    `);
  return result.recordset.length > 0;
}

async function empleadoExists(pool, empnit, codemp) {
  const cod = parseId(codemp);
  if (cod === null) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMP', sql.Int, cod)
    .input('CODTIPO', sql.Int, CODTIPO_EMPLEADO_TRANSPORTE)
    .query(`
      SELECT TOP 1 CODEMPLEADO FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMP
        AND CODTIPOEMPLEADO = @CODTIPO AND ACTIVO = 'SI'
    `);
  return result.recordset.length > 0;
}

async function plataformaExists(pool, empnit, codplataforma) {
  const cod = parseId(codplataforma);
  if (cod === null) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPLATAFORMA', sql.Int, cod)
    .query(`
      SELECT TOP 1 CODPLATAFORMA FROM dbo.VEHICULOS_PLATAFORMAS
      WHERE EMPNIT = @EMPNIT AND CODPLATAFORMA = @CODPLATAFORMA
    `);
  return result.recordset.length > 0;
}

async function findLastRecord(request, empnit, codvehiculo) {
  const req = request;
  req.input('EMPNIT', sql.VarChar, empnit);
  req.input('CODVEHICULO', sql.Int, codvehiculo);
  const result = await req.query(`
    SELECT TOP 1 ID, KMS_INICIAL, KMS_FINAL, FECHA
    FROM dbo.VEHICULOS_KILOMETRAJES
    WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
    ORDER BY FECHA DESC, ID DESC
  `);
  return result.recordset[0] || null;
}

async function findPredecessorRecord(request, empnit, codvehiculo, fecha, id) {
  const req = request;
  req.input('EMPNIT', sql.VarChar, empnit);
  req.input('CODVEHICULO', sql.Int, codvehiculo);
  req.input('FECHA', sql.Date, fecha);
  req.input('ID', sql.Int, id);
  const result = await req.query(`
    SELECT TOP 1 ID, KMS_INICIAL, KMS_FINAL
    FROM dbo.VEHICULOS_KILOMETRAJES
    WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
      AND (FECHA < @FECHA OR (FECHA = @FECHA AND ID < @ID))
    ORDER BY FECHA DESC, ID DESC
  `);
  return result.recordset[0] || null;
}

async function findPreviousRecord(request, empnit, codvehiculo, excludeId = null) {
  if (excludeId !== null) {
    const current = await new sql.Request(request.transaction || request)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, excludeId)
      .query(`
        SELECT FECHA FROM dbo.VEHICULOS_KILOMETRAJES
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    const row = current.recordset[0];
    if (!row) return null;
    return findPredecessorRecord(request, empnit, codvehiculo, row.FECHA, excludeId);
  }
  return findLastRecord(request, empnit, codvehiculo);
}

function readBody(req) {
  const kmsInicial = req.body?.KMS_INICIAL !== undefined && req.body?.KMS_INICIAL !== ''
    ? round3(req.body.KMS_INICIAL)
    : null;

  const fecha = parseFecha(req.body?.FECHA);
  const { MES, ANIO } = fecha ? mesAnioFromFecha(fecha) : { MES: null, ANIO: null };

  const tipoRaw = req.body?.TIPO_COMBUSTIBLE;
  const tipo = tipoRaw !== undefined && tipoRaw !== null && String(tipoRaw).trim() !== ''
    ? normalizeKilometrajeCombustible(tipoRaw)
    : null;

  const codPlataformaRaw = req.body?.CODPLATAFORMA;
  const codPlataforma = codPlataformaRaw !== undefined && codPlataformaRaw !== null && String(codPlataformaRaw).trim() !== ''
    ? parseId(codPlataformaRaw)
    : null;

  return {
    CODVEHICULO: parseId(req.body?.CODVEHICULO),
    CODEMP: parseId(req.body?.CODEMP),
    CODPLATAFORMA: codPlataforma,
    FECHA: fecha,
    MES,
    ANIO,
    KMS_INICIAL: kmsInicial,
    GALONES_COMBUSTIBLE:
      req.body?.GALONES_COMBUSTIBLE !== undefined && req.body?.GALONES_COMBUSTIBLE !== ''
        ? round3(req.body.GALONES_COMBUSTIBLE)
        : null,
    IMPORTE_COMBUSTIBLE:
      req.body?.IMPORTE_COMBUSTIBLE !== undefined && req.body?.IMPORTE_COMBUSTIBLE !== ''
        ? round3(req.body.IMPORTE_COMBUSTIBLE)
        : null,
    TIPO_COMBUSTIBLE: tipo,
    VIATICOS:
      req.body?.VIATICOS !== undefined && req.body?.VIATICOS !== ''
        ? round3(req.body.VIATICOS)
        : null,
    OBS: String(req.body?.OBS ?? '').trim() || null,
  };
}

function validateBody(data) {
  if (data.CODVEHICULO === null) return 'Seleccione el vehículo';
  if (data.CODEMP === null) return 'Seleccione el empleado';
  if (!data.FECHA) return 'La fecha es obligatoria (YYYY-MM-DD)';
  if (!data.TIPO_COMBUSTIBLE) return 'Seleccione el tipo de combustible';
  if (!isKilometrajeCombustibleValid(data.TIPO_COMBUSTIBLE)) {
    return 'TIPO_COMBUSTIBLE debe ser DIESEL, SUPER, REGULAR o PREMIUM';
  }
  if (data.KMS_INICIAL === null) return 'Kilometraje inicial es obligatorio';
  return null;
}

async function validateKmsInicialAgainstPrevious(pool, empnit, data, excludeId = null) {
  const prev = await findPreviousRecord(pool.request(), empnit, data.CODVEHICULO, excludeId);
  if (!prev) return null;
  const prevIni = toNumber(prev.KMS_INICIAL) ?? 0;
  if (data.KMS_INICIAL < prevIni) {
    return 'El kilometraje inicial no puede ser menor al del registro anterior del vehículo';
  }
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
    console.warn('[API GET /kilometrajes/lookups/vehiculos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/lookups/empleados', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODTIPO', sql.Int, CODTIPO_EMPLEADO_TRANSPORTE)
      .query(`
        SELECT CODEMPLEADO AS CODEMP, NOMEMPLEADO
        FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT
          AND CODTIPOEMPLEADO = @CODTIPO
          AND ACTIVO = 'SI'
        ORDER BY NOMEMPLEADO
      `);
    res.json({ rows: result.recordset, empnit });
  } catch (err) {
    console.warn('[API GET /kilometrajes/lookups/empleados]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/lookups/plataformas', async (req, res) => {
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
        SELECT CODPLATAFORMA, NOPLACA, PLATAFORMA
        FROM dbo.VEHICULOS_PLATAFORMAS
        WHERE EMPNIT = @EMPNIT
        ORDER BY PLATAFORMA, CODPLATAFORMA
      `);
    res.json({ rows: result.recordset, empnit });
  } catch (err) {
    console.warn('[API GET /kilometrajes/lookups/plataformas]', err.message);
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
    const vehiculoSql = filterVehiculo ? ' AND k.CODVEHICULO = @CODVEHICULO' : '';
    const fechaIniSql = fechaini ? ' AND k.FECHA >= @FECHAINI' : '';
    const fechaFinSql = fechafin ? ' AND k.FECHA <= @FECHAFIN' : '';
    const result = await request.query(`
        SELECT
          k.ID,
          k.EMPNIT,
          k.CODVEHICULO,
          k.CODPLATAFORMA,
          k.MES,
          k.ANIO,
          k.FECHA,
          k.KMS_INICIAL,
          k.KMS_FINAL,
          k.KMS_RECORRIDO,
          k.CODEMP,
          k.GALONES_COMBUSTIBLE,
          k.IMPORTE_COMBUSTIBLE,
          k.TIPO_COMBUSTIBLE,
          k.VIATICOS,
          k.OBS,
          v.PLACA,
          v.DESCRIPCION AS VEHICULO_DESCRIPCION,
          e.NOMEMPLEADO,
          p.PLATAFORMA AS PLATAFORMA_NOMBRE,
          p.NOPLACA AS PLATAFORMA_PLACA
        FROM dbo.VEHICULOS_KILOMETRAJES k
        LEFT JOIN dbo.VEHICULOS v
          ON k.EMPNIT = v.EMPNIT AND k.CODVEHICULO = v.CODVEHICULO
        LEFT JOIN dbo.Empleados e
          ON k.EMPNIT = e.EMPNIT AND k.CODEMP = e.CODEMPLEADO
        LEFT JOIN dbo.VEHICULOS_PLATAFORMAS p
          ON k.EMPNIT = p.EMPNIT AND k.CODPLATAFORMA = p.CODPLATAFORMA
        WHERE k.EMPNIT = @EMPNIT
          ${vehiculoSql}
          ${fechaIniSql}
          ${fechaFinSql}
          AND (
            @q IS NULL OR @q = ''
            OR CAST(k.CODVEHICULO AS VARCHAR(20)) LIKE @qLike
            OR CAST(k.CODEMP AS VARCHAR(20)) LIKE @qLike
            OR k.TIPO_COMBUSTIBLE LIKE @qLike
            OR k.OBS LIKE @qLike
            OR v.PLACA LIKE @qLike
            OR v.DESCRIPCION LIKE @qLike
            OR e.NOMEMPLEADO LIKE @qLike
            OR p.PLATAFORMA LIKE @qLike
            OR p.NOPLACA LIKE @qLike
          )
        ORDER BY k.FECHA ASC, k.ID ASC
      `);
    const rows = result.recordset.map(mapRow);
    res.json({ rows, total: rows.length, empnit });
  } catch (err) {
    console.warn('[API GET /kilometrajes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function validateRefs(pool, empnit, data) {
  if (!(await vehiculoExists(pool, empnit, data.CODVEHICULO))) {
    return 'Vehículo no encontrado en la empresa';
  }
  if (!(await empleadoExists(pool, empnit, data.CODEMP))) {
    return 'Empleado de transporte activo no encontrado en la empresa';
  }
  if (data.CODPLATAFORMA !== null && !(await plataformaExists(pool, empnit, data.CODPLATAFORMA))) {
    return 'Plataforma no encontrada en la empresa';
  }
  return null;
}

async function closePreviousRecord(transaction, empnit, codvehiculo, kmsInicial, excludeId = null) {
  const prev = await findPreviousRecord(new sql.Request(transaction), empnit, codvehiculo, excludeId);
  if (!prev) return;
  const prevIni = toNumber(prev.KMS_INICIAL) ?? 0;
  const kmsRecorrido = round3(kmsInicial - prevIni);
  await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, prev.ID)
    .input('KMS_FINAL', sql.Float, kmsInicial)
    .input('KMS_RECORRIDO', sql.Float, kmsRecorrido)
    .query(`
      UPDATE dbo.VEHICULOS_KILOMETRAJES
      SET KMS_FINAL = @KMS_FINAL, KMS_RECORRIDO = @KMS_RECORRIDO
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
}

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const data = readBody(req);
  const errReq = validateBody(data);
  if (errReq) return res.status(400).json({ error: errReq });
  try {
    const pool = await req.app.locals.getDbPool();
    const refErr = await validateRefs(pool, empnit, data);
    if (refErr) return res.status(400).json({ error: refErr });
    const kmsErr = await validateKmsInicialAgainstPrevious(pool, empnit, data);
    if (kmsErr) return res.status(400).json({ error: kmsErr });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const prevBeforeInsert = await findLastRecord(new sql.Request(transaction), empnit, data.CODVEHICULO);

      const insertResult = await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
        .input('CODPLATAFORMA', sql.Int, data.CODPLATAFORMA)
        .input('MES', sql.Int, data.MES)
        .input('ANIO', sql.Int, data.ANIO)
        .input('FECHA', sql.Date, data.FECHA)
        .input('KMS_INICIAL', sql.Float, data.KMS_INICIAL)
        .input('CODEMP', sql.Int, data.CODEMP)
        .input('GALONES_COMBUSTIBLE', sql.Float, data.GALONES_COMBUSTIBLE ?? 0)
        .input('IMPORTE_COMBUSTIBLE', sql.Float, data.IMPORTE_COMBUSTIBLE ?? 0)
        .input('TIPO_COMBUSTIBLE', sql.VarChar, data.TIPO_COMBUSTIBLE)
        .input('VIATICOS', sql.Float, data.VIATICOS ?? 0)
        .input('OBS', sql.VarChar, data.OBS)
        .query(`
          INSERT INTO dbo.VEHICULOS_KILOMETRAJES (
            EMPNIT, CODVEHICULO, CODPLATAFORMA, MES, ANIO, FECHA, KMS_INICIAL,
            CODEMP, GALONES_COMBUSTIBLE, IMPORTE_COMBUSTIBLE, TIPO_COMBUSTIBLE, VIATICOS, OBS
          )
          OUTPUT INSERTED.ID
          VALUES (
            @EMPNIT, @CODVEHICULO, @CODPLATAFORMA, @MES, @ANIO, @FECHA, @KMS_INICIAL,
            @CODEMP, @GALONES_COMBUSTIBLE, @IMPORTE_COMBUSTIBLE, @TIPO_COMBUSTIBLE, @VIATICOS, @OBS
          )
        `);
      const id = insertResult.recordset[0]?.ID;
      if (prevBeforeInsert) {
        const prevIni = toNumber(prevBeforeInsert.KMS_INICIAL) ?? 0;
        const kmsRecorrido = round3(data.KMS_INICIAL - prevIni);
        await new sql.Request(transaction)
          .input('EMPNIT', sql.VarChar, empnit)
          .input('ID', sql.Int, prevBeforeInsert.ID)
          .input('KMS_FINAL', sql.Float, data.KMS_INICIAL)
          .input('KMS_RECORRIDO', sql.Float, kmsRecorrido)
          .query(`
            UPDATE dbo.VEHICULOS_KILOMETRAJES
            SET KMS_FINAL = @KMS_FINAL, KMS_RECORRIDO = @KMS_RECORRIDO
            WHERE EMPNIT = @EMPNIT AND ID = @ID
          `);
      }
      await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
        .input('KILOMETRAJE_ACTUAL', sql.Float, data.KMS_INICIAL)
        .query(`
          UPDATE dbo.VEHICULOS
          SET KILOMETRAJE_ACTUAL = @KILOMETRAJE_ACTUAL
          WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
        `);
      await transaction.commit();
      res.status(201).json({ ok: true, ID: id, ...data });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.warn('[API POST /kilometrajes]', err.message);
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
    const refErr = await validateRefs(pool, empnit, data);
    if (refErr) return res.status(400).json({ error: refErr });
    const kmsErr = await validateKmsInicialAgainstPrevious(pool, empnit, data, id);
    if (kmsErr) return res.status(400).json({ error: kmsErr });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const result = await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar, empnit)
        .input('ID', sql.Int, id)
        .input('CODVEHICULO', sql.Int, data.CODVEHICULO)
        .input('CODPLATAFORMA', sql.Int, data.CODPLATAFORMA)
        .input('MES', sql.Int, data.MES)
        .input('ANIO', sql.Int, data.ANIO)
        .input('FECHA', sql.Date, data.FECHA)
        .input('KMS_INICIAL', sql.Float, data.KMS_INICIAL)
        .input('CODEMP', sql.Int, data.CODEMP)
        .input('GALONES_COMBUSTIBLE', sql.Float, data.GALONES_COMBUSTIBLE ?? 0)
        .input('IMPORTE_COMBUSTIBLE', sql.Float, data.IMPORTE_COMBUSTIBLE ?? 0)
        .input('TIPO_COMBUSTIBLE', sql.VarChar, data.TIPO_COMBUSTIBLE)
        .input('VIATICOS', sql.Float, data.VIATICOS ?? 0)
        .input('OBS', sql.VarChar, data.OBS)
        .query(`
          UPDATE dbo.VEHICULOS_KILOMETRAJES
          SET CODVEHICULO = @CODVEHICULO,
              CODPLATAFORMA = @CODPLATAFORMA,
              MES = @MES,
              ANIO = @ANIO,
              FECHA = @FECHA,
              KMS_INICIAL = @KMS_INICIAL,
              CODEMP = @CODEMP,
              GALONES_COMBUSTIBLE = @GALONES_COMBUSTIBLE,
              IMPORTE_COMBUSTIBLE = @IMPORTE_COMBUSTIBLE,
              TIPO_COMBUSTIBLE = @TIPO_COMBUSTIBLE,
              VIATICOS = @VIATICOS,
              OBS = @OBS
          WHERE EMPNIT = @EMPNIT AND ID = @ID
        `);
      if (result.rowsAffected[0] === 0) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      await closePreviousRecord(transaction, empnit, data.CODVEHICULO, data.KMS_INICIAL, id);
      await transaction.commit();
      res.json({ ok: true, ID: id, ...data });
    } catch (innerErr) {
      await transaction.rollback();
      throw innerErr;
    }
  } catch (err) {
    console.warn('[API PUT /kilometrajes/:id]', err.message);
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
        DELETE FROM dbo.VEHICULOS_KILOMETRAJES
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /kilometrajes/:id]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
