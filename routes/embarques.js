const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { assertEliminacionRegistro } = require('../lib/config-auth');
const { fechaIsoFromValue, parseFechaInput } = require('../lib/documento-fecha');

const router = express.Router();
const TIPO_TRANSPORTE = 6;

const ENSURE_TABLE_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'EMBARQUES' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.EMBARQUES (
    EMPNIT VARCHAR(50) NOT NULL,
    CODEMBARQUE VARCHAR(50) NOT NULL,
    DESEMBARQUE VARCHAR(200) NULL,
    DESCRIPCION VARCHAR(500) NULL,
    FECHA DATE NULL,
    MES INT NULL,
    ANIO INT NULL,
    USUARIOCREADO VARCHAR(80) NULL,
    AUX_REPARTIDOR VARCHAR(150) NULL,
    CODREP INT NULL,
    FINALIZADO VARCHAR(10) NOT NULL CONSTRAINT DF_EMBARQUES_FINALIZADO DEFAULT ('NO'),
    CONSTRAINT PK_EMBARQUES PRIMARY KEY (EMPNIT, CODEMBARQUE)
  );
END
`;

const EXTRA_COLUMNS = [
  { name: 'FECHA', ddl: 'DATE NULL' },
  { name: 'DESCRIPCION', ddl: 'VARCHAR(500) NULL' },
  { name: 'USUARIOCREADO', ddl: 'VARCHAR(80) NULL' },
  { name: 'MES', ddl: 'INT NULL' },
  { name: 'ANIO', ddl: 'INT NULL' },
  { name: 'AUX_REPARTIDOR', ddl: 'VARCHAR(150) NULL' },
  { name: 'CODREP', ddl: 'INT NULL' },
];

function ensureColumnSql(name, ddl) {
  return `
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EMBARQUES' AND schema_id = SCHEMA_ID('dbo'))
AND NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.EMBARQUES') AND name = '${name}'
)
BEGIN
  ALTER TABLE dbo.EMBARQUES ADD ${name} ${ddl};
END
`;
}

const ENSURE_FINALIZADO_SQL = `
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EMBARQUES' AND schema_id = SCHEMA_ID('dbo'))
AND NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.EMBARQUES') AND name = 'FINALIZADO'
)
BEGIN
  ALTER TABLE dbo.EMBARQUES ADD FINALIZADO VARCHAR(10) NULL;
  EXEC('UPDATE dbo.EMBARQUES SET FINALIZADO = ''NO'' WHERE FINALIZADO IS NULL');
END
`;

const ENSURE_DESEMBARQUE_SQL = `
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'EMBARQUES' AND schema_id = SCHEMA_ID('dbo'))
AND NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.EMBARQUES') AND name = 'DESEMBARQUE'
)
AND NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.EMBARQUES') AND name = 'NOMBRE'
)
BEGIN
  ALTER TABLE dbo.EMBARQUES ADD DESEMBARQUE VARCHAR(200) NULL;
END
`;

let schemaCache = null;

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

function normalizeFinalizado(value) {
  const s = String(value ?? '').trim().toUpperCase();
  if (['SI', 'SÍ', 'S', '1', 'TRUE', 'FINALIZADO', 'FIN'].includes(s)) return 'SI';
  return 'NO';
}

function pickCol(set, names) {
  for (const n of names) {
    if (set.has(n.toUpperCase())) return n;
  }
  return null;
}

function parseCodRep(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function partsFromFecha(raw) {
  const parsed = parseFechaInput(raw) || parseFechaInput(fechaIsoFromValue(raw));
  if (!parsed) return null;
  return { fecha: parsed.fecha, mes: parsed.mes, anio: parsed.anio };
}

async function loadSchema(pool) {
  if (schemaCache) return schemaCache;
  await pool.request().query(ENSURE_TABLE_SQL);
  await pool.request().query(ENSURE_FINALIZADO_SQL);
  await pool.request().query(ENSURE_DESEMBARQUE_SQL);
  for (const col of EXTRA_COLUMNS) {
    await pool.request().query(ensureColumnSql(col.name, col.ddl));
  }

  const colsRes = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'EMBARQUES'
  `);
  const set = new Set(colsRes.recordset.map((r) => String(r.COLUMN_NAME || '').toUpperCase()));
  schemaCache = {
    idCol: pickCol(set, ['CODEMBARQUE']) || 'CODEMBARQUE',
    nameCol: pickCol(set, ['DESEMBARQUE', 'NOMBRE']) || 'DESEMBARQUE',
    statusCol: pickCol(set, ['FINALIZADO', 'STATUS']) || 'FINALIZADO',
    hasEmpnit: set.has('EMPNIT'),
    hasFecha: set.has('FECHA'),
    hasDescripcion: set.has('DESCRIPCION'),
    hasUsuario: set.has('USUARIOCREADO'),
    hasMes: set.has('MES'),
    hasAnio: set.has('ANIO'),
    hasAux: set.has('AUX_REPARTIDOR'),
    hasCodrep: set.has('CODREP'),
  };
  return schemaCache;
}

function mapRow(r, schema) {
  const fin = normalizeFinalizado(r[schema.statusCol] ?? r.FINALIZADO);
  return {
    CODEMBARQUE: String(r[schema.idCol] ?? r.CODEMBARQUE ?? '').trim(),
    DESEMBARQUE: String(r[schema.nameCol] ?? r.DESEMBARQUE ?? r.NOMBRE ?? '').trim(),
    DESCRIPCION: String(r.DESCRIPCION ?? '').trim(),
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    USUARIOCREADO: String(r.USUARIOCREADO ?? '').trim(),
    AUX_REPARTIDOR: String(r.AUX_REPARTIDOR ?? '').trim(),
    CODREP: r.CODREP ?? null,
    REPARTIDOR: String(r.REPARTIDOR ?? '').trim(),
    FINALIZADO: fin,
    ESTADO: fin === 'SI' ? 'Finalizado' : 'No finalizado',
  };
}

function extraSelect(schema) {
  const parts = [];
  if (schema.hasFecha) parts.push('e.FECHA');
  if (schema.hasDescripcion) parts.push('e.DESCRIPCION');
  if (schema.hasUsuario) parts.push('e.USUARIOCREADO');
  if (schema.hasAux) parts.push('e.AUX_REPARTIDOR');
  if (schema.hasCodrep) parts.push('e.CODREP');
  return parts.length ? `, ${parts.join(', ')}` : '';
}

router.use(async (req, res, next) => {
  if (!isDbConfigured()) return next();
  try {
    const pool = await req.app.locals.getDbPool();
    await loadSchema(pool);
  } catch (err) {
    console.warn('[API /embarques ensure]', err.message);
  }
  next();
});

router.get('/repartidores', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODTIPO', sql.Int, TIPO_TRANSPORTE)
      .query(`
        SELECT CODEMPLEADO, NOMEMPLEADO
        FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT AND CODTIPOEMPLEADO = @CODTIPO
        ORDER BY NOMEMPLEADO
      `);
    res.json({
      rows: result.recordset.map((r) => ({
        CODEMPLEADO: r.CODEMPLEADO,
        NOMEMPLEADO: String(r.NOMEMPLEADO || '').trim(),
      })),
    });
  } catch (err) {
    console.warn('[API GET /embarques/repartidores]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const fromParts = parseFechaInput(req.query.from || req.query.fechaDesde);
  const toParts = parseFechaInput(req.query.to || req.query.fechaHasta);
  const finalizadoFilter = String(req.query.finalizado || '').trim().toUpperCase();

  try {
    const pool = await req.app.locals.getDbPool();
    const schema = await loadSchema(pool);
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
    const clauses = [];
    if (schema.hasEmpnit) clauses.push('e.EMPNIT = @EMPNIT');
    if (finalizadoFilter === 'NO' || finalizadoFilter === 'SI') {
      request.input('FINALIZADO_FILTRO', sql.VarChar, finalizadoFilter);
      clauses.push(`UPPER(LTRIM(RTRIM(ISNULL(e.${schema.statusCol}, 'NO')))) = @FINALIZADO_FILTRO`);
    }
    if (schema.hasFecha && fromParts) {
      request.input('FECHA_FROM', sql.Date, fromParts.fecha);
      clauses.push('e.FECHA >= @FECHA_FROM');
    }
    if (schema.hasFecha && toParts) {
      request.input('FECHA_TO', sql.Date, toParts.fecha);
      clauses.push('e.FECHA <= @FECHA_TO');
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const joinEmp = schema.hasCodrep
      ? `LEFT JOIN dbo.Empleados emp ON emp.CODEMPLEADO = e.CODREP AND emp.EMPNIT = @EMPNIT`
      : '';
    const result = await request.query(`
      SELECT ${schema.hasEmpnit ? 'e.EMPNIT,' : ''} e.${schema.idCol}, e.${schema.nameCol}, e.${schema.statusCol}
        ${extraSelect(schema)}
        ${schema.hasCodrep ? ', emp.NOMEMPLEADO AS REPARTIDOR' : ''}
      FROM dbo.EMBARQUES e
      ${joinEmp}
      ${where}
      ORDER BY ${schema.hasFecha ? 'e.FECHA DESC,' : ''} e.${schema.idCol}
    `);
    const rows = result.recordset.map((r) => mapRow(r, schema));
    res.json({ rows, total: rows.length, empnit });
  } catch (err) {
    console.warn('[API GET /embarques]', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function nextCodEmbarque(pool, schema, empnit) {
  const request = pool.request();
  let where = '';
  if (schema.hasEmpnit) {
    request.input('EMPNIT', sql.VarChar, empnit);
    where = ' WHERE EMPNIT = @EMPNIT';
  }
  const result = await request.query(`
    SELECT ISNULL(MAX(TRY_CONVERT(INT, ${schema.idCol})), 0) + 1 AS nextId
    FROM dbo.EMBARQUES
    ${where}
  `);
  return String(result.recordset[0]?.nextId || 1);
}

function bindExtra(request, schema, data, { includeUsuario }) {
  if (schema.hasFecha) request.input('FECHA', sql.Date, data.fecha);
  if (schema.hasMes) request.input('MES', sql.Int, data.mes);
  if (schema.hasAnio) request.input('ANIO', sql.Int, data.anio);
  if (schema.hasDescripcion) request.input('DESCRIPCION', sql.VarChar, data.descripcion);
  if (includeUsuario && schema.hasUsuario) {
    request.input('USUARIOCREADO', sql.VarChar, data.usuariocreado);
  }
  if (schema.hasAux) request.input('AUX_REPARTIDOR', sql.VarChar, data.aux);
  if (schema.hasCodrep) request.input('CODREP', sql.Int, data.codrep);
}

function extraInsert(schema, { includeUsuario }) {
  const cols = [];
  const vals = [];
  if (schema.hasFecha) {
    cols.push('FECHA');
    vals.push('@FECHA');
  }
  if (schema.hasMes) {
    cols.push('MES');
    vals.push('@MES');
  }
  if (schema.hasAnio) {
    cols.push('ANIO');
    vals.push('@ANIO');
  }
  if (schema.hasDescripcion) {
    cols.push('DESCRIPCION');
    vals.push('@DESCRIPCION');
  }
  if (includeUsuario && schema.hasUsuario) {
    cols.push('USUARIOCREADO');
    vals.push('@USUARIOCREADO');
  }
  if (schema.hasAux) {
    cols.push('AUX_REPARTIDOR');
    vals.push('@AUX_REPARTIDOR');
  }
  if (schema.hasCodrep) {
    cols.push('CODREP');
    vals.push('@CODREP');
  }
  return { cols, vals };
}

function extraUpdateSet(schema) {
  const sets = [];
  if (schema.hasFecha) sets.push('FECHA = @FECHA');
  if (schema.hasMes) sets.push('MES = @MES');
  if (schema.hasAnio) sets.push('ANIO = @ANIO');
  if (schema.hasDescripcion) sets.push('DESCRIPCION = @DESCRIPCION');
  if (schema.hasAux) sets.push('AUX_REPARTIDOR = @AUX_REPARTIDOR');
  if (schema.hasCodrep) sets.push('CODREP = @CODREP');
  return sets;
}

function readPayload(body) {
  const nombre = String(body?.DESEMBARQUE ?? body?.NOMBRE ?? '').trim();
  const descripcion = String(body?.DESCRIPCION ?? '').trim() || null;
  const aux = String(body?.AUX_REPARTIDOR ?? '').trim() || null;
  const usuariocreado = String(body?.USUARIOCREADO ?? body?.USUARIO ?? '').trim() || null;
  const parts = partsFromFecha(body?.FECHA);
  return {
    nombre,
    descripcion: descripcion ? descripcion.slice(0, 500) : null,
    aux: aux ? aux.slice(0, 150) : null,
    usuariocreado: usuariocreado ? usuariocreado.slice(0, 80) : null,
    fecha: parts?.fecha || null,
    mes: parts?.mes ?? null,
    anio: parts?.anio ?? null,
    codrep: parseCodRep(body?.CODREP),
  };
}

router.post('/', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const data = readPayload(req.body);
  let cod = String(req.body?.CODEMBARQUE ?? '').trim();
  if (!data.nombre) return res.status(400).json({ error: 'El nombre del embarque es obligatorio' });
  if (!data.fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });

  try {
    const pool = await req.app.locals.getDbPool();
    const schema = await loadSchema(pool);
    if (!cod) cod = await nextCodEmbarque(pool, schema, empnit);

    const extra = extraInsert(schema, { includeUsuario: true });
    const request = pool.request().input('CODEMBARQUE', sql.VarChar, cod.slice(0, 50));
    request.input('DESEMBARQUE', sql.VarChar, data.nombre.slice(0, 200));
    request.input('FINALIZADO', sql.VarChar, 'NO');
    bindExtra(request, schema, data, { includeUsuario: true });

    const cols = [schema.idCol, schema.nameCol, schema.statusCol, ...extra.cols];
    const vals = ['@CODEMBARQUE', '@DESEMBARQUE', '@FINALIZADO', ...extra.vals];
    if (schema.hasEmpnit) {
      request.input('EMPNIT', sql.VarChar, empnit);
      cols.unshift('EMPNIT');
      vals.unshift('@EMPNIT');
    }
    await request.query(`
      INSERT INTO dbo.EMBARQUES (${cols.join(', ')})
      VALUES (${vals.join(', ')})
    `);
    res.status(201).json({ ok: true, CODEMBARQUE: cod, FINALIZADO: 'NO' });
  } catch (err) {
    console.warn('[API POST /embarques]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.put('/:codembarque', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const cod = String(req.params.codembarque || '').trim();
  if (!cod) return res.status(400).json({ error: 'CODEMBARQUE inválido' });

  const data = readPayload(req.body);
  if (!data.nombre) return res.status(400).json({ error: 'El nombre del embarque es obligatorio' });
  if (!data.fecha) return res.status(400).json({ error: 'La fecha es obligatoria' });

  try {
    const pool = await req.app.locals.getDbPool();
    const schema = await loadSchema(pool);
    const sets = [`${schema.nameCol} = @DESEMBARQUE`, ...extraUpdateSet(schema)];
    const request = pool
      .request()
      .input('CODEMBARQUE', sql.VarChar, cod)
      .input('DESEMBARQUE', sql.VarChar, data.nombre.slice(0, 200));
    bindExtra(request, schema, data, { includeUsuario: false });
    let where = `WHERE ${schema.idCol} = @CODEMBARQUE`;
    if (schema.hasEmpnit) {
      request.input('EMPNIT', sql.VarChar, empnit);
      where += ' AND EMPNIT = @EMPNIT';
    }
    const result = await request.query(`
      UPDATE dbo.EMBARQUES SET ${sets.join(', ')}
      ${where}
    `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado' });
    }
    res.json({ ok: true, CODEMBARQUE: cod });
  } catch (err) {
    console.warn('[API PUT /embarques]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:codembarque', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const cod = String(req.params.codembarque || '').trim();
  if (!cod) return res.status(400).json({ error: 'CODEMBARQUE inválido' });

  try {
    const pool = await req.app.locals.getDbPool();
    await assertEliminacionRegistro(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));
    const schema = await loadSchema(pool);
    const request = pool.request().input('CODEMBARQUE', sql.VarChar, cod);
    let where = `WHERE ${schema.idCol} = @CODEMBARQUE`;
    if (schema.hasEmpnit) {
      request.input('EMPNIT', sql.VarChar, empnit);
      where += ' AND EMPNIT = @EMPNIT';
    }
    const result = await request.query(`DELETE FROM dbo.EMBARQUES ${where}`);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Embarque no encontrado' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 401) return res.status(401).json({ error: err.message });
    console.warn('[API DELETE /embarques]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
