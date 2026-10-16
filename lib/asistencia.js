const sql = require('mssql');
const { nowParts } = require('./documento-fecha');
const {
  SETTING_OPCION,
  getSettingControlAsistenciaAlmuerzo,
} = require('./settings');

class AsistenciaError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'AsistenciaError';
    this.statusCode = statusCode;
  }
}

let lunchColumnsReadyCache = null;

async function lunchColumnsReady(pool) {
  if (lunchColumnsReadyCache !== null) return lunchColumnsReadyCache;
  try {
    const result = await pool.request().query(`
      SELECT CASE
        WHEN COL_LENGTH('dbo.CONTROL_ASISTENCIA', 'HORA_SALIDA_ALMUERZO') IS NOT NULL
         AND COL_LENGTH('dbo.CONTROL_ASISTENCIA', 'HORA_ENTRADA_ALMUERZO') IS NOT NULL
        THEN 1 ELSE 0 END AS ok
    `);
    lunchColumnsReadyCache = !!result.recordset?.[0]?.ok;
  } catch {
    lunchColumnsReadyCache = false;
  }
  return lunchColumnsReadyCache;
}

function resetAsistenciaSchemaCacheForTests() {
  lunchColumnsReadyCache = null;
}

async function getAsistenciaConfig(pool) {
  const soporteColumnasAlmuerzo = await lunchColumnsReady(pool);
  let aplicaAlmuerzo = false;
  if (soporteColumnasAlmuerzo) {
    aplicaAlmuerzo = (await getSettingControlAsistenciaAlmuerzo(pool)) === 'SI';
  }
  return { aplicaAlmuerzo, soporteColumnasAlmuerzo };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTimeFromParts(parts) {
  const h = Number(parts.hora);
  const m = Number(parts.minuto);
  const s = Number(parts.segundo) || 0;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function formatTimeFromSql(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}:${pad2(value.getUTCSeconds())}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${pad2(m[1])}:${pad2(m[2])}:${pad2(m[3] || '0')}`;
  return s.slice(0, 8);
}

function formatFechaFromSql(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s.slice(0, 10);
}

function parseQrPayload(raw, sessionEmpnit) {
  const parsed = tryParseCarnePayload(raw);
  if (!parsed) {
    throw new AsistenciaError('Código inválido. Use el formato empnit-codempleado');
  }
  if (String(sessionEmpnit).trim() !== parsed.empnit) {
    throw new AsistenciaError(
      `El código pertenece a otra empresa (${parsed.empnit}). Sesión actual: ${sessionEmpnit}`
    );
  }
  return parsed;
}

function tryParseCarnePayload(raw) {
  const text = String(raw || '').trim();
  if (!text || !text.includes('-')) return null;
  const parts = text.split('-');
  if (parts.length < 2) return null;
  const codempleado = parseInt(parts[parts.length - 1], 10);
  const empnit = parts.slice(0, -1).join('-').trim();
  if (!empnit || !Number.isFinite(codempleado) || codempleado <= 0) return null;
  return { empnit, codempleado };
}

async function loadEmpleado(pool, empnit, codempleado) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, codempleado)
    .query(`
      SELECT
        e.CODEMPLEADO,
        e.NOMEMPLEADO,
        ISNULL(e.ACTIVO, 'SI') AS ACTIVO,
        LTRIM(RTRIM(ISNULL(n.DEPARTAMENTO, ''))) AS DEPARTAMENTO
      FROM dbo.Empleados e
      LEFT JOIN dbo.NOMINA_EMPLEADO n
        ON n.EMPNIT = e.EMPNIT AND n.CODEMPLEADO = e.CODEMPLEADO
      WHERE e.EMPNIT = @EMPNIT AND e.CODEMPLEADO = @CODEMPLEADO
    `);
  return result.recordset[0] || null;
}

function registroSelectSql(withLunch) {
  const base =
    'ID, EMPNIT, FECHA, CODEMPLEADO, HORA_ENTRADA, HORA_SALIDA, USUARIO';
  if (!withLunch) return base;
  return `${base}, HORA_SALIDA_ALMUERZO, HORA_ENTRADA_ALMUERZO`;
}

async function getRegistroDia(pool, empnit, fecha, codempleado) {
  const withLunch = await lunchColumnsReady(pool);
  const cols = registroSelectSql(withLunch);
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .input('CODEMPLEADO', sql.Int, codempleado)
    .query(`
      SELECT ${cols}
      FROM dbo.CONTROL_ASISTENCIA
      WHERE EMPNIT = @EMPNIT AND FECHA = @FECHA AND CODEMPLEADO = @CODEMPLEADO
    `);
  return result.recordset[0] || null;
}

function mapRegistro(row, empleado = null) {
  if (!row && !empleado) return null;
  return {
    ID: row?.ID ?? null,
    EMPNIT: row?.EMPNIT ?? null,
    FECHA: formatFechaFromSql(row?.FECHA),
    CODEMPLEADO: row?.CODEMPLEADO ?? empleado?.CODEMPLEADO ?? null,
    NOMEMPLEADO: empleado?.NOMEMPLEADO ?? row?.NOMEMPLEADO ?? null,
    DEPARTAMENTO: empleado?.DEPARTAMENTO ?? row?.DEPARTAMENTO ?? null,
    HORA_ENTRADA: formatTimeFromSql(row?.HORA_ENTRADA),
    HORA_SALIDA: formatTimeFromSql(row?.HORA_SALIDA),
    HORA_SALIDA_ALMUERZO: formatTimeFromSql(row?.HORA_SALIDA_ALMUERZO),
    HORA_ENTRADA_ALMUERZO: formatTimeFromSql(row?.HORA_ENTRADA_ALMUERZO),
    USUARIO: row?.USUARIO ?? null,
  };
}

/**
 * Siguiente marca según registro del día y si aplica almuerzo.
 */
function resolveSiguienteAccion(reg, aplicaAlmuerzo) {
  if (!reg?.HORA_ENTRADA) return 'ENTRADA';
  if (reg.HORA_SALIDA) return 'COMPLETO';
  if (!aplicaAlmuerzo) return 'SALIDA';
  if (!reg.HORA_SALIDA_ALMUERZO) return 'SALIDA_ALMUERZO';
  if (!reg.HORA_ENTRADA_ALMUERZO) return 'ENTRADA_ALMUERZO';
  return 'SALIDA';
}

async function getEstadoAsistencia(pool, empnit, codempleado, fechaOpt) {
  const parts = nowParts();
  const fecha = fechaOpt || parts.fecha;
  const config = await getAsistenciaConfig(pool);
  const emp = await loadEmpleado(pool, empnit, codempleado);
  if (!emp) throw new AsistenciaError('Empleado no encontrado', 404);
  if (String(emp.ACTIVO || 'SI').toUpperCase() !== 'SI') {
    throw new AsistenciaError('El empleado no está activo');
  }
  const reg = await getRegistroDia(pool, empnit, fecha, codempleado);
  const mapped = mapRegistro(reg, emp);
  const accion = resolveSiguienteAccion(reg, config.aplicaAlmuerzo);
  return {
    fecha,
    horaActual: formatTimeFromParts(parts),
    accion,
    aplicaAlmuerzo: config.aplicaAlmuerzo,
    empleado: {
      CODEMPLEADO: emp.CODEMPLEADO,
      NOMEMPLEADO: emp.NOMEMPLEADO,
      DEPARTAMENTO: emp.DEPARTAMENTO || null,
    },
    registro: mapped,
  };
}

async function marcarAsistencia(pool, empnit, codempleado, usuario) {
  const config = await getAsistenciaConfig(pool);
  const estado = await getEstadoAsistencia(pool, empnit, codempleado);
  if (estado.accion === 'COMPLETO') {
    throw new AsistenciaError(
      `${estado.empleado.NOMEMPLEADO} ya tiene el día de asistencia completo`
    );
  }

  const parts = nowParts();
  const fecha = parts.fecha;
  const hora = formatTimeFromParts(parts);
  const user = String(usuario || '').trim() || null;
  const accion = estado.accion;

  if (accion === 'ENTRADA') {
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.Date, fecha)
      .input('CODEMPLEADO', sql.Int, codempleado)
      .input('HORA_ENTRADA', sql.VarChar, hora)
      .input('USUARIO', sql.VarChar, user)
      .query(`
        INSERT INTO dbo.CONTROL_ASISTENCIA (
          EMPNIT, FECHA, CODEMPLEADO, HORA_ENTRADA, HORA_SALIDA, USUARIO
        ) VALUES (
          @EMPNIT, @FECHA, @CODEMPLEADO, CAST(@HORA_ENTRADA AS TIME(0)), NULL, @USUARIO
        )
      `);
  } else if (accion === 'SALIDA') {
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.Date, fecha)
      .input('CODEMPLEADO', sql.Int, codempleado)
      .input('HORA_SALIDA', sql.VarChar, hora)
      .input('USUARIO', sql.VarChar, user)
      .query(`
        UPDATE dbo.CONTROL_ASISTENCIA
        SET HORA_SALIDA = CAST(@HORA_SALIDA AS TIME(0)),
            USUARIO = COALESCE(@USUARIO, USUARIO)
        WHERE EMPNIT = @EMPNIT AND FECHA = @FECHA AND CODEMPLEADO = @CODEMPLEADO
          AND HORA_ENTRADA IS NOT NULL
          AND HORA_SALIDA IS NULL
      `);
  } else if (accion === 'SALIDA_ALMUERZO') {
    if (!config.aplicaAlmuerzo) {
      throw new AsistenciaError('El registro de almuerzo no está habilitado');
    }
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.Date, fecha)
      .input('CODEMPLEADO', sql.Int, codempleado)
      .input('HORA', sql.VarChar, hora)
      .input('USUARIO', sql.VarChar, user)
      .query(`
        UPDATE dbo.CONTROL_ASISTENCIA
        SET HORA_SALIDA_ALMUERZO = CAST(@HORA AS TIME(0)),
            USUARIO = COALESCE(@USUARIO, USUARIO)
        WHERE EMPNIT = @EMPNIT AND FECHA = @FECHA AND CODEMPLEADO = @CODEMPLEADO
          AND HORA_ENTRADA IS NOT NULL
          AND HORA_SALIDA IS NULL
          AND HORA_SALIDA_ALMUERZO IS NULL
      `);
  } else if (accion === 'ENTRADA_ALMUERZO') {
    if (!config.aplicaAlmuerzo) {
      throw new AsistenciaError('El registro de almuerzo no está habilitado');
    }
    await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('FECHA', sql.Date, fecha)
      .input('CODEMPLEADO', sql.Int, codempleado)
      .input('HORA', sql.VarChar, hora)
      .input('USUARIO', sql.VarChar, user)
      .query(`
        UPDATE dbo.CONTROL_ASISTENCIA
        SET HORA_ENTRADA_ALMUERZO = CAST(@HORA AS TIME(0)),
            USUARIO = COALESCE(@USUARIO, USUARIO)
        WHERE EMPNIT = @EMPNIT AND FECHA = @FECHA AND CODEMPLEADO = @CODEMPLEADO
          AND HORA_ENTRADA IS NOT NULL
          AND HORA_SALIDA IS NULL
          AND HORA_SALIDA_ALMUERZO IS NOT NULL
          AND HORA_ENTRADA_ALMUERZO IS NULL
      `);
  } else {
    throw new AsistenciaError('No hay acción de asistencia disponible');
  }

  const nuevo = await getEstadoAsistencia(pool, empnit, codempleado, fecha);
  return {
    ok: true,
    marcado: accion,
    hora,
    ...nuevo,
  };
}

async function listAsistenciaDia(pool, empnit, fecha) {
  const withLunch = await lunchColumnsReady(pool);
  const lunchCols = withLunch ? ', a.HORA_SALIDA_ALMUERZO, a.HORA_ENTRADA_ALMUERZO' : '';
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .query(`
      SELECT
        a.ID, a.EMPNIT, a.FECHA, a.CODEMPLEADO,
        a.HORA_ENTRADA, a.HORA_SALIDA, a.USUARIO${lunchCols},
        e.NOMEMPLEADO,
        LTRIM(RTRIM(ISNULL(n.DEPARTAMENTO, ''))) AS DEPARTAMENTO
      FROM dbo.CONTROL_ASISTENCIA a
      INNER JOIN dbo.Empleados e
        ON e.EMPNIT = a.EMPNIT AND e.CODEMPLEADO = a.CODEMPLEADO
      LEFT JOIN dbo.NOMINA_EMPLEADO n
        ON n.EMPNIT = a.EMPNIT AND n.CODEMPLEADO = a.CODEMPLEADO
      WHERE a.EMPNIT = @EMPNIT AND a.FECHA = @FECHA
      ORDER BY a.HORA_ENTRADA, e.NOMEMPLEADO
    `);
  return result.recordset.map((r) => mapRegistro(r, r));
}

async function buscarEmpleados(pool, empnit, q, limit = 30) {
  const term = String(q || '').trim();
  if (!term) return [];

  const carne = tryParseCarnePayload(term);
  if (carne) {
    if (String(empnit).trim() !== carne.empnit) return [];
    const emp = await loadEmpleado(pool, empnit, carne.codempleado);
    if (!emp) return [];
    if (String(emp.ACTIVO || 'SI').toUpperCase() !== 'SI') return [];
    return [
      {
        CODEMPLEADO: emp.CODEMPLEADO,
        NOMEMPLEADO: emp.NOMEMPLEADO,
        DEPARTAMENTO: String(emp.DEPARTAMENTO || '').trim() || null,
        CARNE: `${empnit}-${emp.CODEMPLEADO}`,
      },
    ];
  }

  if (term.length < 2) return [];
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('Q', sql.VarChar, `%${term}%`)
    .input('LIMIT', sql.Int, Math.min(Math.max(limit, 1), 50))
    .query(`
      SELECT TOP (@LIMIT)
        e.CODEMPLEADO,
        e.NOMEMPLEADO,
        LTRIM(RTRIM(ISNULL(n.DEPARTAMENTO, ''))) AS DEPARTAMENTO
      FROM dbo.Empleados e
      LEFT JOIN dbo.NOMINA_EMPLEADO n
        ON n.EMPNIT = e.EMPNIT AND n.CODEMPLEADO = e.CODEMPLEADO
      WHERE e.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(e.ACTIVO, 'SI')))) = 'SI'
        AND (
          e.NOMEMPLEADO LIKE @Q
          OR CAST(e.CODEMPLEADO AS VARCHAR(20)) LIKE @Q
          OR (e.EMPNIT + '-' + CAST(e.CODEMPLEADO AS VARCHAR(20))) LIKE @Q
        )
      ORDER BY e.NOMEMPLEADO
    `);
  return result.recordset.map((r) => ({
    CODEMPLEADO: r.CODEMPLEADO,
    NOMEMPLEADO: r.NOMEMPLEADO,
    DEPARTAMENTO: String(r.DEPARTAMENTO || '').trim() || null,
    CARNE: `${empnit}-${r.CODEMPLEADO}`,
  }));
}

module.exports = {
  AsistenciaError,
  parseQrPayload,
  tryParseCarnePayload,
  getAsistenciaConfig,
  getEstadoAsistencia,
  marcarAsistencia,
  listAsistenciaDia,
  buscarEmpleados,
  nowParts,
  resetAsistenciaSchemaCacheForTests,
};
