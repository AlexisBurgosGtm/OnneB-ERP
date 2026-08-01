/**
 * Series por defecto por empleado (dbo.EMPLEADOS_DEFAULT).
 * Predetermina CODDOC según vista (OPCION) para el empleado de sesión.
 */

const OPCION_SERIES = {
  PEDIDOS_MOSTRADOR: 'PEDIDOS MOSTRADOR',
  FACTURAS_NORMALES: 'FACTURAS NORMALES',
  FACTURAS_ELECTRONICAS: 'FACTURAS ELECTRONICAS',
  COMPRAS: 'COMPRAS',
  COTIZACIONES: 'COTIZACIONES',
  ENTRADA_INVENTARIO: 'ENTRADA INVENTARIO',
  SALIDA_INVENTARIO: 'SALIDA INVENTARIO',
  CAJAS: 'CAJAS',
};

const OPCION_SERIES_LIST = [
  OPCION_SERIES.PEDIDOS_MOSTRADOR,
  OPCION_SERIES.FACTURAS_NORMALES,
  OPCION_SERIES.FACTURAS_ELECTRONICAS,
  OPCION_SERIES.COMPRAS,
  OPCION_SERIES.COTIZACIONES,
  OPCION_SERIES.ENTRADA_INVENTARIO,
  OPCION_SERIES.SALIDA_INVENTARIO,
  OPCION_SERIES.CAJAS,
];

/** Reglas de series/cajas permitidas por opción. */
const OPCION_SERIES_RULES = {
  [OPCION_SERIES.PEDIDOS_MOSTRADOR]: { kind: 'tipodoc', tipodocs: ['ENV'] },
  [OPCION_SERIES.FACTURAS_NORMALES]: { kind: 'tipodoc', tipodocs: ['FAC'] },
  [OPCION_SERIES.FACTURAS_ELECTRONICAS]: { kind: 'tipodoc', tipodocs: ['FEF', 'FEC', 'FES'] },
  [OPCION_SERIES.COMPRAS]: { kind: 'tipodoc', tipodocs: ['COM'] },
  [OPCION_SERIES.COTIZACIONES]: { kind: 'tipodoc', tipodocs: ['COT'] },
  [OPCION_SERIES.ENTRADA_INVENTARIO]: { kind: 'tipodoc', tipodocs: ['ENT'] },
  [OPCION_SERIES.SALIDA_INVENTARIO]: { kind: 'tipodoc', tipodocs: ['SAL'] },
  [OPCION_SERIES.CAJAS]: { kind: 'caja' },
};

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function parseId(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseCodemp(raw) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeOpcion(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function assertOpcionValida(opcion) {
  const opt = normalizeOpcion(opcion);
  if (!OPCION_SERIES_LIST.includes(opt)) {
    throw httpError('Opción inválida');
  }
  return opt;
}

function ruleForOpcion(opcion) {
  return OPCION_SERIES_RULES[normalizeOpcion(opcion)] || null;
}

async function listSeriesDefault(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT
        d.ID,
        d.EMPNIT,
        d.CODEMP,
        d.OPCION,
        d.CODDOC,
        d.VALOR,
        ISNULL(e.NOMEMPLEADO, '') AS NOMEMPLEADO,
        CASE
          WHEN d.OPCION = 'CAJAS' THEN ISNULL(cj.DESCAJA, '')
          ELSE ISNULL(t.DESDOC, '')
        END AS DESDOC,
        ISNULL(t.TIPODOC, '') AS TIPODOC
      FROM dbo.EMPLEADOS_DEFAULT d
      LEFT JOIN dbo.Empleados e
        ON e.EMPNIT = d.EMPNIT AND e.CODEMPLEADO = d.CODEMP
      LEFT JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      LEFT JOIN dbo.Cajas cj
        ON d.OPCION = 'CAJAS'
        AND cj.EMPNIT = d.EMPNIT
        AND CAST(cj.CODCAJA AS VARCHAR(50)) = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
      ORDER BY e.NOMEMPLEADO ASC, d.OPCION ASC, d.ID ASC
    `);
  return result.recordset || [];
}

async function listEmpleadosLookup(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND ISNULL(ACTIVO, 'SI') = 'SI'
      ORDER BY NOMEMPLEADO ASC
    `);
  return result.recordset || [];
}

async function listTipodocsLookup(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODDOC, DESDOC, TIPODOC
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND ACTIVO = 'SI'
      ORDER BY CODDOC ASC
    `);
  return result.recordset || [];
}

async function listCajasLookup(pool, sql, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCAJA, DESCAJA
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT
      ORDER BY DESCAJA ASC
    `);
  return result.recordset || [];
}

async function findDuplicate(pool, sql, empnit, codemp, opcion, excludeId = null) {
  const req = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMP', sql.Int, codemp)
    .input('OPCION', sql.VarChar, opcion);
  let excludeSql = '';
  if (excludeId != null) {
    req.input('ID', sql.Int, excludeId);
    excludeSql = ' AND ID <> @ID';
  }
  const result = await req.query(`
    SELECT TOP 1 ID
    FROM dbo.EMPLEADOS_DEFAULT
    WHERE EMPNIT = @EMPNIT AND CODEMP = @CODEMP AND OPCION = @OPCION
      ${excludeSql}
  `);
  return result.recordset[0] || null;
}

async function assertEmpleadoExists(pool, sql, empnit, codemp) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, codemp)
    .query(`
      SELECT TOP 1 CODEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
    `);
  if (!result.recordset.length) throw httpError('Empleado no encontrado', 404);
}

async function assertValorForOpcion(pool, sql, empnit, opcion, coddoc) {
  const rule = ruleForOpcion(opcion);
  if (!rule) throw httpError('Opción inválida');

  if (rule.kind === 'caja') {
    const codcaja = parseInt(coddoc, 10);
    if (!Number.isFinite(codcaja) || codcaja <= 0) {
      throw httpError('Seleccione una caja válida');
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODCAJA', sql.Int, codcaja)
      .query(`
        SELECT TOP 1 CODCAJA
        FROM dbo.Cajas
        WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
      `);
    if (!result.recordset.length) throw httpError('Caja no encontrada', 404);
    return String(codcaja);
  }

  const tipodocs = rule.tipodocs || [];
  const tipodocIn = tipodocs.map((t) => `'${t}'`).join(', ');
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT TOP 1 CODDOC, TIPODOC
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT
        AND CODDOC = @CODDOC
        AND ACTIVO = 'SI'
        AND TIPODOC IN (${tipodocIn})
    `);
  if (!result.recordset.length) {
    throw httpError(
      `El CODDOC no es válido para ${opcion} (se requieren: ${tipodocs.join(', ')})`
    );
  }
  return coddoc;
}

async function createSeriesDefault(pool, sql, empnit, body) {
  const codemp = parseCodemp(body?.CODEMP ?? body?.codemp);
  if (!codemp) throw httpError('Seleccione un empleado');
  const opcion = assertOpcionValida(body?.OPCION ?? body?.opcion);
  const coddocRaw = String(body?.CODDOC ?? body?.coddoc ?? '').trim();
  if (!coddocRaw) {
    throw httpError(opcion === OPCION_SERIES.CAJAS ? 'Seleccione una caja' : 'Seleccione un CODDOC');
  }

  await assertEmpleadoExists(pool, sql, empnit, codemp);
  const coddoc = await assertValorForOpcion(pool, sql, empnit, opcion, coddocRaw);
  if (await findDuplicate(pool, sql, empnit, codemp, opcion)) {
    throw httpError('Ya existe una serie por defecto para este empleado y opción');
  }

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMP', sql.Int, codemp)
    .input('OPCION', sql.VarChar, opcion)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      INSERT INTO dbo.EMPLEADOS_DEFAULT (EMPNIT, CODEMP, OPCION, CODDOC, VALOR)
      OUTPUT INSERTED.ID, INSERTED.EMPNIT, INSERTED.CODEMP, INSERTED.OPCION, INSERTED.CODDOC, INSERTED.VALOR
      VALUES (@EMPNIT, @CODEMP, @OPCION, @CODDOC, NULL)
    `);
  return result.recordset[0];
}

async function updateSeriesDefault(pool, sql, empnit, id, body) {
  const rowId = parseId(id);
  if (!rowId) throw httpError('ID inválido');
  const codemp = parseCodemp(body?.CODEMP ?? body?.codemp);
  if (!codemp) throw httpError('Seleccione un empleado');
  const opcion = assertOpcionValida(body?.OPCION ?? body?.opcion);
  const coddocRaw = String(body?.CODDOC ?? body?.coddoc ?? '').trim();
  if (!coddocRaw) {
    throw httpError(opcion === OPCION_SERIES.CAJAS ? 'Seleccione una caja' : 'Seleccione un CODDOC');
  }

  const existing = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, rowId)
    .query(`
      SELECT TOP 1 ID
      FROM dbo.EMPLEADOS_DEFAULT
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  if (!existing.recordset.length) throw httpError('Registro no encontrado', 404);

  await assertEmpleadoExists(pool, sql, empnit, codemp);
  const coddoc = await assertValorForOpcion(pool, sql, empnit, opcion, coddocRaw);
  if (await findDuplicate(pool, sql, empnit, codemp, opcion, rowId)) {
    throw httpError('Ya existe una serie por defecto para este empleado y opción');
  }

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, rowId)
    .input('CODEMP', sql.Int, codemp)
    .input('OPCION', sql.VarChar, opcion)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      UPDATE dbo.EMPLEADOS_DEFAULT
      SET CODEMP = @CODEMP, OPCION = @OPCION, CODDOC = @CODDOC
      OUTPUT INSERTED.ID, INSERTED.EMPNIT, INSERTED.CODEMP, INSERTED.OPCION, INSERTED.CODDOC, INSERTED.VALOR
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return result.recordset[0];
}

async function deleteSeriesDefault(pool, sql, empnit, id) {
  const rowId = parseId(id);
  if (!rowId) throw httpError('ID inválido');
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, rowId)
    .query(`
      DELETE FROM dbo.EMPLEADOS_DEFAULT
      OUTPUT DELETED.ID
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  if (!result.recordset.length) throw httpError('Registro no encontrado', 404);
  return { ok: true, ID: rowId };
}

/**
 * CODDOC preferido del empleado para una OPCION (p. ej. PEDIDOS MOSTRADOR).
 * Si no hay OPCION, mantiene compatibilidad leyendo Empleados.WHATSAPP.
 */
async function resolveEmpleadoCoddocPreferido(pool, sql, empnit, codempleado, opcion = null) {
  const cod = Number(codempleado);
  if (!Number.isFinite(cod) || cod <= 0) return null;

  const opt = String(opcion || '').trim();
  if (opt) {
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODEMP', sql.Int, cod)
      .input('OPCION', sql.VarChar, normalizeOpcion(opt))
      .query(`
        SELECT TOP 1 LTRIM(RTRIM(ISNULL(CODDOC, ''))) AS CODDOC
        FROM dbo.EMPLEADOS_DEFAULT
        WHERE EMPNIT = @EMPNIT AND CODEMP = @CODEMP AND OPCION = @OPCION
        ORDER BY ID DESC
      `);
    const preferred = String(result.recordset[0]?.CODDOC || '').trim();
    return preferred || null;
  }

  const legacy = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, cod)
    .query(`
      SELECT TOP 1 LTRIM(RTRIM(ISNULL(WHATSAPP, ''))) AS WHATSAPP
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
    `);
  const preferred = String(legacy.recordset[0]?.WHATSAPP || '').trim();
  return preferred || null;
}

function pickCoddocDefault(tipos, preferred) {
  const list = Array.isArray(tipos) ? tipos : [];
  const want = String(preferred || '').trim();
  if (want) {
    const match = list.find((t) => String(t.CODDOC ?? '').trim() === want);
    if (match) return match.CODDOC;
  }
  return list[0]?.CODDOC || null;
}

function pickCajaDefault(cajas, preferred) {
  const list = Array.isArray(cajas) ? cajas : [];
  const want = String(preferred || '').trim();
  if (want) {
    const match = list.find((c) => String(c.CODCAJA ?? '').trim() === want);
    if (match) return match.CODCAJA;
  }
  return list[0]?.CODCAJA ?? null;
}

/** Cajas abiertas (STATUS=1) + CODCAJA preferido del empleado (OPCION=CAJAS). */
async function listCajasAbiertasConDefault(pool, sql, empnit, codempleado = null) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCAJA, DESCAJA
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND STATUS = 1
      ORDER BY DESCAJA ASC
    `);
  const rows = result.recordset || [];
  const preferred = await resolveEmpleadoCoddocPreferido(
    pool,
    sql,
    empnit,
    codempleado,
    OPCION_SERIES.CAJAS
  );
  return {
    rows,
    preferredCaja: preferred,
    cajaDefault: pickCajaDefault(rows, preferred),
  };
}

module.exports = {
  OPCION_SERIES,
  OPCION_SERIES_LIST,
  OPCION_SERIES_RULES,
  listSeriesDefault,
  listEmpleadosLookup,
  listTipodocsLookup,
  listCajasLookup,
  listCajasAbiertasConDefault,
  createSeriesDefault,
  updateSeriesDefault,
  deleteSeriesDefault,
  resolveEmpleadoCoddocPreferido,
  pickCoddocDefault,
  pickCajaDefault,
};
