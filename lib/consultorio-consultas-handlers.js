const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { requireEmpNit } = require('../routes/lib/catalogo-empresa');
const { fechaIsoFromValue } = require('./documento-fecha');
const { usuarioFromReq } = require('./documentos-eliminados');
const { InventarioError } = require('./inventario');
const { searchMovimientoProductos } = require('./movimiento-productos-search');
const { normalizePreciosField } = require('./doc-producto-linea');
const {
  parseRecetaLinesInput,
  createRecetaEnTransaccion,
  loadRecetaLinesForConsulta,
  linkRecetaToConsulta,
  getPacienteNombre,
} = require('./consultorio-receta-doc');

const TIPOS_VALIDOS = new Set(['GENERAL', 'GINECOLOGICA', 'DERMATOLOGIA', 'PEDIATRIA']);

function parseTipo(raw) {
  const t = String(raw || '').trim().toUpperCase();
  return TIPOS_VALIDOS.has(t) ? t : null;
}

function roundNum(n, dec = 3) {
  const f = 10 ** dec;
  return Math.round((Number(n) || 0) * f) / f;
}

function parseTimeInput(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function normalizeRow(r) {
  return {
    CODCONSULTA: r.CODCONSULTA,
    CODPACIENTE: r.CODPACIENTE,
    TIPO: String(r.TIPO || '').trim(),
    FECHA: fechaIsoFromValue(r.FECHA) || null,
    HORA: String(r.HORA || '').trim(),
    MOTIVO: r.MOTIVO ?? null,
    SINTOMAS: r.SINTOMAS ?? null,
    PA: r.PA ?? null,
    FC: r.FC != null ? parseInt(r.FC, 10) : null,
    FR: r.FR != null ? parseInt(r.FR, 10) : null,
    TEMPERATURA: r.TEMPERATURA != null ? roundNum(r.TEMPERATURA, 2) : null,
    PESO: r.PESO != null ? roundNum(r.PESO, 3) : null,
    TALLA: r.TALLA != null ? parseInt(r.TALLA, 10) : null,
    IMPRESION_DIAGNOSTICA: r.IMPRESION_DIAGNOSTICA ?? null,
    TRATAMIENTO: r.TRATAMIENTO ?? null,
    PACIENTE: String(r.PACIENTE || '').trim(),
    CODDOC_RECETA: r.CODDOC_RECETA != null ? String(r.CODDOC_RECETA).trim() || null : null,
    CORRELATIVO_RECETA:
      r.CORRELATIVO_RECETA != null && r.CORRELATIVO_RECETA !== '' ? Number(r.CORRELATIVO_RECETA) : null,
  };
}

async function nextCodconsulta(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ISNULL(MAX(CODCONSULTA), 0) + 1 AS nextId
      FROM dbo.CONSULTORIO_CONSULTAS
      WHERE EMPNIT = @EMPNIT
    `);
  return result.recordset[0]?.nextId;
}

const LIST_SELECT = `
  SELECT
    c.CODCONSULTA,
    c.CODPACIENTE,
    c.TIPO,
    c.FECHA,
    c.HORA,
    c.MOTIVO,
    c.SINTOMAS,
    c.PA,
    c.FC,
    c.FR,
    c.TEMPERATURA,
    c.PESO,
    c.TALLA,
    c.IMPRESION_DIAGNOSTICA,
    c.TRATAMIENTO,
    c.CODDOC_RECETA,
    c.CORRELATIVO_RECETA,
    LTRIM(RTRIM(ISNULL(p.NOMBRE, ''))) AS PACIENTE
  FROM dbo.CONSULTORIO_CONSULTAS c
  LEFT JOIN dbo.CONSULTORIO_PACIENTES p
    ON p.EMPNIT = c.EMPNIT AND p.CODPACIENTE = c.CODPACIENTE
`;

function parseCodconsulta(req, res) {
  const cod = parseInt(req.params.codconsulta, 10);
  if (!Number.isFinite(cod) || cod <= 0) {
    res.status(400).json({ error: 'CODCONSULTA inválido' });
    return null;
  }
  return cod;
}

function readConsultaBody(req, res) {
  const codpaciente = parseInt(req.body?.CODPACIENTE, 10);
  if (!Number.isFinite(codpaciente) || codpaciente <= 0) {
    res.status(400).json({ error: 'CODPACIENTE requerido' });
    return null;
  }
  const fechaRaw = String(req.body?.FECHA || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
    res.status(400).json({ error: 'FECHA inválida' });
    return null;
  }
  const hora = parseTimeInput(req.body?.HORA);
  if (!hora) {
    res.status(400).json({ error: 'HORA inválida (use HH:mm)' });
    return null;
  }
  return {
    codpaciente,
    fechaRaw,
    hora,
    MOTIVO: String(req.body?.MOTIVO || '').trim() || null,
    SINTOMAS: String(req.body?.SINTOMAS || '').trim() || null,
    PA: String(req.body?.PA || '').trim() || null,
    FC: req.body?.FC != null && req.body.FC !== '' ? parseInt(req.body.FC, 10) : null,
    FR: req.body?.FR != null && req.body.FR !== '' ? parseInt(req.body.FR, 10) : null,
    TEMPERATURA:
      req.body?.TEMPERATURA != null && req.body.TEMPERATURA !== '' ? Number(req.body.TEMPERATURA) : null,
    PESO: req.body?.PESO != null && req.body.PESO !== '' ? Number(req.body.PESO) : null,
    TALLA: req.body?.TALLA != null && req.body.TALLA !== '' ? parseInt(req.body.TALLA, 10) : null,
    IMPRESION_DIAGNOSTICA: String(req.body?.IMPRESION_DIAGNOSTICA || '').trim() || null,
    TRATAMIENTO: String(req.body?.TRATAMIENTO || '').trim() || null,
  };
}

function bindConsultaInputs(request, body) {
  request.input('CODPACIENTE', sql.Int, body.codpaciente);
  request.input('FECHA', sql.Date, new Date(body.fechaRaw + 'T12:00:00'));
  request.input('HORA', sql.VarChar, body.hora);
  request.input('MOTIVO', sql.VarChar, body.MOTIVO);
  request.input('SINTOMAS', sql.VarChar(sql.MAX), body.SINTOMAS);
  request.input('PA', sql.VarChar, body.PA);
  request.input('FC', sql.Int, body.FC);
  request.input('FR', sql.Int, body.FR);
  request.input('TEMPERATURA', sql.Decimal(5, 2), body.TEMPERATURA);
  request.input('PESO', sql.Decimal(8, 3), body.PESO);
  request.input('TALLA', sql.Int, body.TALLA);
  request.input('IMPRESION_DIAGNOSTICA', sql.VarChar(sql.MAX), body.IMPRESION_DIAGNOSTICA);
  request.input('TRATAMIENTO', sql.VarChar(sql.MAX), body.TRATAMIENTO);
}

async function handleListConsultas(req, res) {
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
        ${LIST_SELECT}
        WHERE c.EMPNIT = @EMPNIT
        ORDER BY c.FECHA DESC, c.HORA DESC, c.CODCONSULTA DESC
      `);
    const rows = (result.recordset || []).map(normalizeRow);
    res.json({ rows, empnit });
  } catch (err) {
    console.warn('[API GET /consultorio/consultas]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleCreateConsulta(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;

  const tipo = parseTipo(req.body?.TIPO);
  if (!tipo) return res.status(400).json({ error: 'TIPO de consulta inválido' });

  const body = readConsultaBody(req, res);
  if (!body) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const pacChk = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPACIENTE', sql.Int, body.codpaciente)
      .query(`
        SELECT 1 AS ok FROM dbo.CONSULTORIO_PACIENTES
        WHERE EMPNIT = @EMPNIT AND CODPACIENTE = @CODPACIENTE
      `);
    if (!pacChk.recordset?.length) {
      return res.status(400).json({ error: 'Paciente no encontrado' });
    }

    const codconsulta = await nextCodconsulta(pool, empnit);
    const recetaLines = parseRecetaLinesInput(req.body);
    const pacienteNombre =
      String(req.body?.PACIENTE_NOMBRE || req.body?.pacienteNombre || '').trim() ||
      (await getPacienteNombre(pool, empnit, body.codpaciente));
    const usuario = usuarioFromReq(req);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODCONSULTA', sql.Int, codconsulta)
        .input('TIPO', sql.VarChar, tipo);
      bindConsultaInputs(request, body);
      await request.query(`
        INSERT INTO dbo.CONSULTORIO_CONSULTAS (
          EMPNIT, CODCONSULTA, CODPACIENTE, TIPO, FECHA, HORA, MOTIVO, SINTOMAS,
          PA, FC, FR, TEMPERATURA, PESO, TALLA, IMPRESION_DIAGNOSTICA, TRATAMIENTO
        ) VALUES (
          @EMPNIT, @CODCONSULTA, @CODPACIENTE, @TIPO, @FECHA, @HORA, @MOTIVO, @SINTOMAS,
          @PA, @FC, @FR, @TEMPERATURA, @PESO, @TALLA, @IMPRESION_DIAGNOSTICA, @TRATAMIENTO
        )
      `);

      let receta = null;
      if (recetaLines.length) {
        receta = await createRecetaEnTransaccion(transaction, pool, empnit, {
          lines: recetaLines,
          pacienteNombre,
          usuario,
          codconsulta,
        });
        if (receta) {
          try {
            await linkRecetaToConsulta(transaction, empnit, codconsulta, receta.CODDOC, receta.CORRELATIVO);
          } catch (linkErr) {
            console.warn('[consulta→receta link]', linkErr.message);
          }
        }
      }
      await transaction.commit();
      res.status(201).json({
        ok: true,
        CODCONSULTA: codconsulta,
        TIPO: tipo,
        receta: receta || undefined,
      });
    } catch (inner) {
      await transaction.rollback();
      throw inner;
    }
  } catch (err) {
    if (err instanceof InventarioError) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
    console.warn('[API POST /consultorio/consultas]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleUpdateConsulta(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codconsulta = parseCodconsulta(req, res);
  if (codconsulta == null) return;
  const body = readConsultaBody(req, res);
  if (!body) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const pacChk = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPACIENTE', sql.Int, body.codpaciente)
      .query(`
        SELECT 1 AS ok FROM dbo.CONSULTORIO_PACIENTES
        WHERE EMPNIT = @EMPNIT AND CODPACIENTE = @CODPACIENTE
      `);
    if (!pacChk.recordset?.length) {
      return res.status(400).json({ error: 'Paciente no encontrado' });
    }

    const prev = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCONSULTA', sql.Int, codconsulta)
      .query(`
        SELECT CODDOC_RECETA, CORRELATIVO_RECETA
        FROM dbo.CONSULTORIO_CONSULTAS
        WHERE EMPNIT = @EMPNIT AND CODCONSULTA = @CODCONSULTA
      `);
    if (!prev.recordset?.length) {
      return res.status(404).json({ error: 'Consulta no encontrada' });
    }
    const recetaLines = parseRecetaLinesInput(req.body);
    const tieneReceta = prev.recordset[0]?.CODDOC_RECETA;
    const pacienteNombre =
      String(req.body?.PACIENTE_NOMBRE || req.body?.pacienteNombre || '').trim() ||
      (await getPacienteNombre(pool, empnit, body.codpaciente));
    const usuario = usuarioFromReq(req);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const request = transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODCONSULTA', sql.Int, codconsulta);
      bindConsultaInputs(request, body);
      const result = await request.query(`
        UPDATE dbo.CONSULTORIO_CONSULTAS SET
          CODPACIENTE = @CODPACIENTE,
          FECHA = @FECHA,
          HORA = @HORA,
          MOTIVO = @MOTIVO,
          SINTOMAS = @SINTOMAS,
          PA = @PA,
          FC = @FC,
          FR = @FR,
          TEMPERATURA = @TEMPERATURA,
          PESO = @PESO,
          TALLA = @TALLA,
          IMPRESION_DIAGNOSTICA = @IMPRESION_DIAGNOSTICA,
          TRATAMIENTO = @TRATAMIENTO
        WHERE EMPNIT = @EMPNIT AND CODCONSULTA = @CODCONSULTA
      `);
      if (!result.rowsAffected[0]) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Consulta no encontrada' });
      }

      let receta = null;
      if (recetaLines.length && !tieneReceta) {
        receta = await createRecetaEnTransaccion(transaction, pool, empnit, {
          lines: recetaLines,
          pacienteNombre,
          usuario,
          codconsulta,
        });
        if (receta) {
          try {
            await linkRecetaToConsulta(transaction, empnit, codconsulta, receta.CODDOC, receta.CORRELATIVO);
          } catch (linkErr) {
            console.warn('[consulta→receta link]', linkErr.message);
          }
        }
      }
      await transaction.commit();
      res.json({ ok: true, CODCONSULTA: codconsulta, receta: receta || undefined });
    } catch (inner) {
      await transaction.rollback();
      throw inner;
    }
  } catch (err) {
    if (err instanceof InventarioError) {
      return res.status(err.statusCode || 400).json({ error: err.message, code: err.code });
    }
    console.warn('[API PUT /consultorio/consultas]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleDeleteConsulta(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codconsulta = parseCodconsulta(req, res);
  if (codconsulta == null) return;

  try {
    const pool = await req.app.locals.getDbPool();
    const { assertEliminacionRegistro } = require('./config-auth');
    await assertEliminacionRegistro(pool, String(req.body?.pass ?? req.body?.PASS ?? ''));
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCONSULTA', sql.Int, codconsulta)
      .query(`
        DELETE FROM dbo.CONSULTORIO_CONSULTAS
        WHERE EMPNIT = @EMPNIT AND CODCONSULTA = @CODCONSULTA
      `);
    if (!result.rowsAffected[0]) {
      return res.status(404).json({ error: 'Consulta no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({ error: err.message });
    }
    console.warn('[API DELETE /consultorio/consultas]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleBuscarPacientes(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 30);
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool.request().input('EMPNIT', sql.VarChar, empnit).input('limit', sql.Int, limit);
    let whereExtra = '';
    if (q.length >= 1) {
      request.input('qLike', sql.NVarChar, `%${q}%`);
      whereExtra = `
        AND (
          p.NOMBRE LIKE @qLike OR p.TELEFONOS LIKE @qLike OR p.EMAIL LIKE @qLike
          OR CAST(p.CODPACIENTE AS varchar(20)) LIKE @qLike
        )
      `;
    }
    const result = await request.query(`
      SELECT TOP (@limit)
        p.CODPACIENTE, p.NOMBRE, p.TELEFONOS, p.EMAIL, p.FECHA_NACIMIENTO
      FROM dbo.CONSULTORIO_PACIENTES p
      WHERE p.EMPNIT = @EMPNIT
        ${whereExtra}
      ORDER BY p.NOMBRE ASC
    `);
    const rows = (result.recordset || []).map((r) => ({
      ...r,
      FECHA_NACIMIENTO: fechaIsoFromValue(r.FECHA_NACIMIENTO) || null,
    }));
    res.json({ rows, q: q || null });
  } catch (err) {
    console.warn('[API GET /consultorio/pacientes/buscar]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleHistorialPaciente(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codpaciente = parseInt(req.query?.codpaciente, 10);
  if (!Number.isFinite(codpaciente) || codpaciente <= 0) {
    return res.status(400).json({ error: 'codpaciente requerido' });
  }
  const excluir = parseInt(req.query?.excluirConsulta, 10);
  try {
    const pool = await req.app.locals.getDbPool();
    const request = pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODPACIENTE', sql.Int, codpaciente);
    let excluirSql = '';
    if (Number.isFinite(excluir) && excluir > 0) {
      request.input('EXCL', sql.Int, excluir);
      excluirSql = ' AND c.CODCONSULTA <> @EXCL';
    }
    const result = await request.query(`
      SELECT
        c.CODCONSULTA,
        c.FECHA,
        c.HORA,
        c.MOTIVO,
        c.IMPRESION_DIAGNOSTICA,
        c.TRATAMIENTO
      FROM dbo.CONSULTORIO_CONSULTAS c
      WHERE c.EMPNIT = @EMPNIT AND c.CODPACIENTE = @CODPACIENTE
        ${excluirSql}
      ORDER BY c.FECHA DESC, c.HORA DESC, c.CODCONSULTA DESC
    `);
    const rows = (result.recordset || []).map((r) => ({
      ...r,
      FECHA: fechaIsoFromValue(r.FECHA) || null,
    }));
    res.json({ rows, codpaciente });
  } catch (err) {
    console.warn('[API GET /consultorio/consultas/historial-paciente]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleGetConsultaDetalle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codconsulta = parseCodconsulta(req, res);
  if (codconsulta == null) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCONSULTA', sql.Int, codconsulta)
      .query(`
        SELECT
          c.*,
          LTRIM(RTRIM(ISNULL(p.NOMBRE, ''))) AS PACIENTE,
          p.TELEFONOS AS PAC_TELEFONOS,
          p.EMAIL AS PAC_EMAIL,
          p.DIRECCION AS PAC_DIRECCION,
          p.FECHA_NACIMIENTO AS PAC_FECHA_NACIMIENTO
        FROM dbo.CONSULTORIO_CONSULTAS c
        LEFT JOIN dbo.CONSULTORIO_PACIENTES p
          ON p.EMPNIT = c.EMPNIT AND p.CODPACIENTE = c.CODPACIENTE
        WHERE c.EMPNIT = @EMPNIT AND c.CODCONSULTA = @CODCONSULTA
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Consulta no encontrada' });
    const consulta = normalizeRow(row);
    consulta.SINTOMAS = row.SINTOMAS ?? null;
    consulta.MOTIVO = row.MOTIVO ?? null;
    const paciente = {
      CODPACIENTE: row.CODPACIENTE,
      NOMBRE: String(row.PACIENTE || '').trim(),
      TELEFONOS: row.PAC_TELEFONOS ?? null,
      EMAIL: row.PAC_EMAIL ?? null,
      DIRECCION: row.PAC_DIRECCION ?? null,
      FECHA_NACIMIENTO: fechaIsoFromValue(row.PAC_FECHA_NACIMIENTO) || null,
    };
    let receta = null;
    if (row.CODDOC_RECETA && row.CORRELATIVO_RECETA != null) {
      const lines = await loadRecetaLinesForConsulta(
        pool,
        empnit,
        row.CODDOC_RECETA,
        row.CORRELATIVO_RECETA
      );
      receta = {
        CODDOC: row.CODDOC_RECETA,
        CORRELATIVO: Number(row.CORRELATIVO_RECETA),
        lines,
      };
    }
    res.json({ consulta, paciente, receta });
  } catch (err) {
    console.warn('[API GET /consultorio/consultas/:id/detalle]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleGetConsultaReceta(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codconsulta = parseCodconsulta(req, res);
  if (codconsulta == null) return;
  try {
    const pool = await req.app.locals.getDbPool();
    const head = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCONSULTA', sql.Int, codconsulta)
      .query(`
        SELECT CODDOC_RECETA, CORRELATIVO_RECETA
        FROM dbo.CONSULTORIO_CONSULTAS
        WHERE EMPNIT = @EMPNIT AND CODCONSULTA = @CODCONSULTA
      `);
    const row = head.recordset[0];
    if (!row?.CODDOC_RECETA) {
      return res.json({ lines: [], coddoc: null, correlativo: null });
    }
    const lines = await loadRecetaLinesForConsulta(
      pool,
      empnit,
      row.CODDOC_RECETA,
      row.CORRELATIVO_RECETA
    );
    res.json({
      lines,
      coddoc: row.CODDOC_RECETA,
      correlativo: Number(row.CORRELATIVO_RECETA),
    });
  } catch (err) {
    console.warn('[API GET /consultorio/consultas/:id/receta]', err.message);
    res.status(500).json({ error: err.message });
  }
}

async function handleRecetaProductos(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const q = String(req.query.q || '').trim();
  const campoPrecio = normalizePreciosField(req.query.campoPrecio);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 80);
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await searchMovimientoProductos(pool, {
      empnit,
      q,
      limit,
      campoPrecio,
      includeMayoreo: true,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API GET /consultorio/recetas/productos]', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  handleListConsultas,
  handleCreateConsulta,
  handleUpdateConsulta,
  handleDeleteConsulta,
  handleBuscarPacientes,
  handleHistorialPaciente,
  handleGetConsultaDetalle,
  handleGetConsultaReceta,
  handleRecetaProductos,
  parseTipo,
};