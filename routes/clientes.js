const express = require('express');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { isDbConfigured } = require('../config/database');
const { stripDiacritics } = require('../lib/clean-text');

const router = express.Router();

const DEFAULT_LIMIT = 50;
const SEARCH_LIMIT = 500;

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

const BODY_FIELDS = [
  'NIT',
  'NOMBRECLIENTE',
  'DIRCLIENTE',
  'CODMUNICIPIO',
  'CODDEPARTAMENTO',
  'TELEFONOCLIENTE',
  'EMAILCLIENTE',
  'LATITUDCLIENTE',
  'LONGITUDCLIENTE',
  'CODRUTA',
  'SALDO',
  'FECHAINICIO',
  'DIAVISITA',
  'LIMITECREDITO',
  'DIASCREDITO',
  'PROVINCIA',
  'TIPONEGOCIO',
  'NEGOCIO',
  'TIPO',
];

const LIST_FROM = `
  FROM dbo.CLIENTES c
  LEFT JOIN dbo.Rutas r ON c.EMPNIT = r.EMPNIT AND c.CODRUTA = r.CODRUTA
`;

const LIST_SELECT = `
  c.DIAVISITA,
  c.CODCLIENTE,
  c.NIT,
  c.TIPONEGOCIO,
  c.NEGOCIO,
  c.NOMBRECLIENTE,
  c.CODRUTA,
  r.DESRUTA,
  c.HABILITADO
`;

function parseListQuery(req) {
  const q = String(req.query.q || '').trim();
  const habilitadoRaw = String(req.query.habilitado || req.query.activo || '')
    .trim()
    .toUpperCase();
  const habilitado = habilitadoRaw === 'SI' || habilitadoRaw === 'NO' ? habilitadoRaw : null;
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
  return { q, habilitado, limit };
}

function buildClientSearchLike(q) {
  const raw = String(q || '').trim();
  if (!raw) return null;
  // Si el usuario escribe % o _, respeta el patrón LIKE tal cual.
  if (raw.includes('%') || raw.includes('_')) return raw;
  return `%${raw}%`;
}

function bindListFilters(request, { empnit, q, habilitado }) {
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('q', sql.NVarChar, q || null);
  request.input('qLike', sql.NVarChar, buildClientSearchLike(q));
  request.input('habilitado', sql.VarChar, habilitado);
}

const LIST_WHERE = `
  WHERE c.EMPNIT = @EMPNIT
    AND (@habilitado IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(c.HABILITADO, '')))) = @habilitado)
    AND (
      @q IS NULL OR @q = ''
      OR CAST(c.CODCLIENTE AS varchar(20)) LIKE @qLike
      OR c.NIT LIKE @qLike
      OR (
        LTRIM(RTRIM(ISNULL(c.TIPONEGOCIO, ''))) + ' ' +
        LTRIM(RTRIM(ISNULL(c.NEGOCIO, ''))) + ' ' +
        LTRIM(RTRIM(ISNULL(c.NOMBRECLIENTE, '')))
      ) LIKE @qLike
      OR c.DIAVISITA LIKE @qLike
      OR r.DESRUTA LIKE @qLike
    )
`;

function normalizeNitKey(nit) {
  return String(nit || '').trim().toUpperCase();
}

/** CF y vacío pueden repetirse; cualquier otro NIT debe ser único por empresa. */
function isNitExemptFromUnique(nit) {
  const key = normalizeNitKey(nit);
  return !key || key === 'CF';
}

/**
 * @param {import('mssql').ConnectionPool} pool
 * @param {string} empnit
 * @param {string|null} nit
 * @param {{ excludeCodcliente?: number|null }} [opts]
 */
async function assertNitUniqueInEmpresa(pool, empnit, nit, { excludeCodcliente = null } = {}) {
  if (isNitExemptFromUnique(nit)) return;
  const nitKey = normalizeNitKey(nit);
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('NIT', sql.NVarChar, nitKey);
  let excludeSql = '';
  if (excludeCodcliente != null && Number.isFinite(Number(excludeCodcliente))) {
    request.input('CODCLIENTE', sql.Int, Number(excludeCodcliente));
    excludeSql = 'AND CODCLIENTE <> @CODCLIENTE';
  }
  const result = await request.query(`
    SELECT TOP 1 CODCLIENTE, NOMBRECLIENTE, NIT
    FROM dbo.CLIENTES
    WHERE EMPNIT = @EMPNIT
      AND UPPER(LTRIM(RTRIM(ISNULL(NIT, '')))) = @NIT
      ${excludeSql}
  `);
  const row = result.recordset[0];
  if (!row) return;
  const nombre = String(row.NOMBRECLIENTE || '').trim() || `#${row.CODCLIENTE}`;
  const err = new Error(`Ya existe un cliente con el NIT ${nitKey}: ${nombre}`);
  err.statusCode = 409;
  throw err;
}

function todayDateOnly() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIntOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function parseNumOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

function parseStrOrNull(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

function parseDateOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function readClienteBody(req, { defaultFechaInicio = false } = {}) {
  const data = {};
  for (const name of BODY_FIELDS) {
    if (name === 'CODMUNICIPIO' || name === 'CODDEPARTAMENTO' || name === 'CODRUTA' || name === 'DIASCREDITO') {
      data[name] = parseIntOrNull(req.body[name]);
    } else if (name === 'SALDO' || name === 'LIMITECREDITO') {
      data[name] = parseNumOrNull(req.body[name]);
    } else if (name === 'FECHAINICIO') {
      data[name] = parseDateOrNull(req.body[name]);
    } else {
      data[name] = parseStrOrNull(req.body[name]);
    }
  }
  if (data.NOMBRECLIENTE) {
    data.NOMBRECLIENTE = stripDiacritics(data.NOMBRECLIENTE).trim() || null;
  }
  if (defaultFechaInicio && !data.FECHAINICIO) {
    data.FECHAINICIO = parseDateOrNull(todayDateOnly());
  }
  return data;
}

function bindClienteRequest(request, data) {
  request.input('NIT', sql.NVarChar, data.NIT);
  request.input('NOMBRECLIENTE', sql.NVarChar, data.NOMBRECLIENTE);
  request.input('DIRCLIENTE', sql.NVarChar, data.DIRCLIENTE);
  request.input('CODMUNICIPIO', sql.Int, data.CODMUNICIPIO);
  request.input('CODDEPARTAMENTO', sql.Int, data.CODDEPARTAMENTO);
  request.input('TELEFONOCLIENTE', sql.NVarChar, data.TELEFONOCLIENTE);
  request.input('EMAILCLIENTE', sql.NVarChar, data.EMAILCLIENTE);
  request.input('LATITUDCLIENTE', sql.NVarChar, data.LATITUDCLIENTE);
  request.input('LONGITUDCLIENTE', sql.NVarChar, data.LONGITUDCLIENTE);
  request.input('CODRUTA', sql.Int, data.CODRUTA);
  request.input('SALDO', sql.Decimal(18, 2), data.SALDO);
  request.input('FECHAINICIO', sql.DateTime, data.FECHAINICIO);
  request.input('DIAVISITA', sql.VarChar, data.DIAVISITA);
  request.input('LIMITECREDITO', sql.Decimal(18, 2), data.LIMITECREDITO);
  request.input('DIASCREDITO', sql.Int, data.DIASCREDITO);
  request.input('PROVINCIA', sql.VarChar, data.PROVINCIA);
  request.input('TIPONEGOCIO', sql.VarChar, data.TIPONEGOCIO);
  request.input('NEGOCIO', sql.VarChar, data.NEGOCIO);
  request.input('TIPO', sql.VarChar, data.TIPO);
}

function validateCliente(data) {
  if (!data.NOMBRECLIENTE) return 'NOMBRECLIENTE es obligatorio';
  if (data.TIPO && !['VENTAS', 'PROSPECTO'].includes(data.TIPO)) {
    return 'TIPO debe ser VENTAS o PROSPECTO';
  }
  const dias = [
    'OTROS',
    'LUNES',
    'MARTES',
    'MIERCOLES',
    'JUEVES',
    'VIERNES',
    'SABADO',
    'DOMINGO',
  ];
  if (data.DIAVISITA && !dias.includes(data.DIAVISITA)) {
    return 'Día de visita no válido';
  }
  return null;
}

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const { q, habilitado, limit } = parseListQuery(req);

  try {
    const pool = await req.app.locals.getDbPool();

    const countReq = pool.request();
    bindListFilters(countReq, { empnit, q, habilitado });
    const countResult = await countReq.query(`
      SELECT COUNT(*) AS total
      ${LIST_FROM}
      ${LIST_WHERE}
    `);
    const total = countResult.recordset[0].total;

    const listReq = pool.request();
    bindListFilters(listReq, { empnit, q, habilitado });
    listReq.input('limit', sql.Int, limit);
    const listResult = await listReq.query(`
      SELECT TOP (@limit) ${LIST_SELECT}
      ${LIST_FROM}
      ${LIST_WHERE}
      ORDER BY c.NOMBRECLIENTE, c.CODCLIENTE
    `);

    res.json({
      rows: listResult.recordset,
      total,
      limit,
      truncated: total > listResult.recordset.length,
      empnit,
      q: q || null,
      habilitado,
    });
  } catch (err) {
    console.warn('[API GET /clientes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
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
        SELECT
          c.CODCLIENTE,
          c.DIAVISITA,
          c.NIT,
          c.NEGOCIO,
          c.NOMBRECLIENTE,
          r.DESRUTA,
          c.HABILITADO,
          c.TIPO,
          c.TIPONEGOCIO,
          c.DIRCLIENTE,
          m.DESMUNICIPIO,
          d.DESDEPARTAMENTO,
          c.TELEFONOCLIENTE,
          c.EMAILCLIENTE,
          c.PROVINCIA,
          c.LIMITECREDITO,
          c.DIASCREDITO,
          c.SALDO,
          c.FECHAINICIO,
          c.LATITUDCLIENTE,
          c.LONGITUDCLIENTE
        FROM dbo.CLIENTES c
        LEFT JOIN dbo.Rutas r ON c.EMPNIT = r.EMPNIT AND c.CODRUTA = r.CODRUTA
        LEFT JOIN dbo.MUNICIPIOS m ON c.CODMUNICIPIO = m.CODMUNICIPIO
        LEFT JOIN dbo.DEPARTAMENTOS d ON c.CODDEPARTAMENTO = d.CODDEPARTAMENTO
        WHERE c.EMPNIT = @EMPNIT
        ORDER BY c.NOMBRECLIENTE, c.CODCLIENTE
      `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Clientes');
    sheet.columns = [
      { header: 'Código', key: 'CODCLIENTE', width: 10 },
      { header: 'Visita', key: 'DIAVISITA', width: 12 },
      { header: 'NIT', key: 'NIT', width: 14 },
      { header: 'Negocio', key: 'NEGOCIO', width: 22 },
      { header: 'Nombre', key: 'NOMBRECLIENTE', width: 28 },
      { header: 'Ruta', key: 'DESRUTA', width: 18 },
      { header: 'Habilitado', key: 'HABILITADO', width: 10 },
      { header: 'Tipo', key: 'TIPO', width: 12 },
      { header: 'Tipo negocio', key: 'TIPONEGOCIO', width: 16 },
      { header: 'Dirección', key: 'DIRCLIENTE', width: 30 },
      { header: 'Municipio', key: 'DESMUNICIPIO', width: 18 },
      { header: 'Departamento', key: 'DESDEPARTAMENTO', width: 18 },
      { header: 'Teléfono', key: 'TELEFONOCLIENTE', width: 14 },
      { header: 'Email', key: 'EMAILCLIENTE', width: 22 },
      { header: 'Provincia', key: 'PROVINCIA', width: 20 },
      { header: 'Límite crédito', key: 'LIMITECREDITO', width: 14 },
      { header: 'Días crédito', key: 'DIASCREDITO', width: 12 },
      { header: 'Saldo', key: 'SALDO', width: 12 },
      { header: 'Fecha inicio', key: 'FECHAINICIO', width: 14 },
      { header: 'Latitud', key: 'LATITUDCLIENTE', width: 12 },
      { header: 'Longitud', key: 'LONGITUDCLIENTE', width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    const { excelDateCellValue, EXCEL_DATE_NUMFMT } = require('../lib/excel-export');
    for (const row of result.recordset) {
      const r = { ...row };
      r.FECHAINICIO = excelDateCellValue(r.FECHAINICIO);
      sheet.addRow(r);
    }
    sheet.getColumn('FECHAINICIO').numFmt = EXCEL_DATE_NUMFMT;
    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const cell = sheet.getRow(r).getCell('FECHAINICIO');
      if (cell.value instanceof Date) cell.numFmt = EXCEL_DATE_NUMFMT;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const safeEmp = empnit.replace(/[^\w-]+/g, '_');
    const stamp = todayDateOnly();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="clientes_${safeEmp}_${stamp}.xlsx"`
    );
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.warn('[API GET /clientes/export]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codcliente', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcliente = parseInt(req.params.codcliente, 10);
  if (Number.isNaN(codcliente)) {
    return res.status(400).json({ error: 'CODCLIENTE inválido' });
  }
  const cols = ['CODCLIENTE', ...BODY_FIELDS].join(', ');
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .query(`
        SELECT ${cols}
        FROM dbo.CLIENTES
        WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
      `);
    if (!result.recordset.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ row: result.recordset[0] });
  } catch (err) {
    console.warn('[API GET /clientes/:codcliente]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:codcliente/habilitado', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const id = parseInt(req.params.codcliente, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'CODCLIENTE inválido' });
  }
  const raw = String(req.body?.HABILITADO ?? req.body?.habilitado ?? '')
    .trim()
    .toUpperCase();
  if (raw !== 'SI' && raw !== 'NO') {
    return res.status(400).json({ error: 'HABILITADO debe ser SI o NO' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, id)
      .input('HABILITADO', sql.VarChar, raw)
      .query(`
        UPDATE dbo.CLIENTES SET HABILITADO = @HABILITADO
        WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ ok: true, CODCLIENTE: id, HABILITADO: raw });
  } catch (err) {
    console.warn('[API PATCH /clientes/:codcliente/habilitado]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const data = readClienteBody(req, { defaultFechaInicio: true });
  const errVal = validateCliente(data);
  if (errVal) return res.status(400).json({ error: errVal });

  try {
    const pool = await req.app.locals.getDbPool();
    await assertNitUniqueInEmpresa(pool, empnit, data.NIT);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    bindClienteRequest(request, data);
    request.input('HABILITADO', sql.VarChar, 'SI');
    const result = await request.query(`
      INSERT INTO dbo.CLIENTES (
        EMPNIT,
        NIT, NOMBRECLIENTE, DIRCLIENTE, CODMUNICIPIO, CODDEPARTAMENTO,
        TELEFONOCLIENTE, EMAILCLIENTE, LATITUDCLIENTE, LONGITUDCLIENTE,
        CODRUTA, SALDO, FECHAINICIO,
        HABILITADO, DIAVISITA, LIMITECREDITO, DIASCREDITO, PROVINCIA,
        TIPONEGOCIO, NEGOCIO, TIPO
      )
      OUTPUT INSERTED.CODCLIENTE AS CODCLIENTE
      VALUES (
        @EMPNIT,
        @NIT, @NOMBRECLIENTE, @DIRCLIENTE, @CODMUNICIPIO, @CODDEPARTAMENTO,
        @TELEFONOCLIENTE, @EMAILCLIENTE, @LATITUDCLIENTE, @LONGITUDCLIENTE,
        @CODRUTA, @SALDO, @FECHAINICIO,
        @HABILITADO, @DIAVISITA, @LIMITECREDITO, @DIASCREDITO, @PROVINCIA,
        @TIPONEGOCIO, @NEGOCIO, @TIPO
      )
    `);
    const codcliente = result.recordset[0]?.CODCLIENTE;
    res.status(201).json({ ok: true, CODCLIENTE: codcliente, ...data });
  } catch (err) {
    console.warn('[API POST /clientes]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.put('/:codcliente', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcliente = parseInt(req.params.codcliente, 10);
  if (Number.isNaN(codcliente)) {
    return res.status(400).json({ error: 'CODCLIENTE inválido' });
  }
  const data = readClienteBody(req);
  const errVal = validateCliente(data);
  if (errVal) return res.status(400).json({ error: errVal });

  try {
    const pool = await req.app.locals.getDbPool();
    await assertNitUniqueInEmpresa(pool, empnit, data.NIT, { excludeCodcliente: codcliente });
    const request = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente);
    bindClienteRequest(request, data);
    const result = await request.query(`
      UPDATE dbo.CLIENTES SET
        NIT = @NIT,
        NOMBRECLIENTE = @NOMBRECLIENTE,
        DIRCLIENTE = @DIRCLIENTE,
        CODMUNICIPIO = @CODMUNICIPIO,
        CODDEPARTAMENTO = @CODDEPARTAMENTO,
        TELEFONOCLIENTE = @TELEFONOCLIENTE,
        EMAILCLIENTE = @EMAILCLIENTE,
        LATITUDCLIENTE = @LATITUDCLIENTE,
        LONGITUDCLIENTE = @LONGITUDCLIENTE,
        CODRUTA = @CODRUTA,
        SALDO = @SALDO,
        FECHAINICIO = @FECHAINICIO,
        DIAVISITA = @DIAVISITA,
        LIMITECREDITO = @LIMITECREDITO,
        DIASCREDITO = @DIASCREDITO,
        PROVINCIA = @PROVINCIA,
        TIPONEGOCIO = @TIPONEGOCIO,
        NEGOCIO = @NEGOCIO,
        TIPO = @TIPO
      WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
    `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ ok: true, CODCLIENTE: codcliente, ...data });
  } catch (err) {
    console.warn('[API PUT /clientes]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.delete('/:codcliente', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codcliente = parseInt(req.params.codcliente, 10);
  if (Number.isNaN(codcliente)) {
    return res.status(400).json({ error: 'CODCLIENTE inválido' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const { assertEliminacionRegistro } = require('../lib/config-auth');
    await assertEliminacionRegistro(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));

    const exists = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .query(`
        SELECT TOP 1 CODCLIENTE
        FROM dbo.CLIENTES
        WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
      `);
    if (!exists.recordset.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const docs = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .query(`
        SELECT TOP 1 1 AS X
        FROM dbo.DOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
      `);

    if (docs.recordset.length) {
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODCLIENTE', sql.Int, codcliente)
        .query(`
          UPDATE dbo.CLIENTES SET HABILITADO = 'NO'
          WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE
        `);
      return res.json({
        ok: true,
        action: 'disabled',
        CODCLIENTE: codcliente,
        HABILITADO: 'NO',
        message:
          'El cliente tiene documentos asociados; no se eliminó y quedó deshabilitado (HABILITADO = NO).',
      });
    }

    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCLIENTE', sql.Int, codcliente)
      .query('DELETE FROM dbo.CLIENTES WHERE EMPNIT = @EMPNIT AND CODCLIENTE = @CODCLIENTE');
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json({ ok: true, action: 'deleted', CODCLIENTE: codcliente });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ error: err.message });
    }
    console.warn('[API DELETE /clientes]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
