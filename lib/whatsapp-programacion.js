/**
 * Envíos programados de WhatsApp por empresa (EMPNIT).
 * Tablas: whatsapp_contactos, whatsapp_programacion, whatsapp_programacion_contactos.
 */
const sql = require('mssql');

const DIAL_CODE = '502';
const MONEY_LOCALE = 'es-GT';
const CURRENCY = 'GTQ';

const DIAS_VALIDOS = ['1', '2', '3', '4', '5', '6', '7'];

const REPORTES = [
  {
    codigo: 'CXC_VENCIDOS',
    nombre: 'Reporte de saldos vencidos clientes',
    detalle: 'Clientes con saldo pendiente cuya fecha de vencimiento ya pasó.',
  },
  {
    codigo: 'CXP_VENCIDOS',
    nombre: 'Reporte de saldos vencidos proveedores',
    detalle: 'Proveedores con saldo pendiente cuya fecha de vencimiento ya pasó.',
  },
  {
    codigo: 'FAC_COBRAR_DIA',
    nombre: 'Listado de facturas a cobrar en el día',
    detalle: 'Facturas de clientes con saldo cuyo vencimiento es el día del envío.',
  },
  {
    codigo: 'FAC_PAGAR_DIA',
    nombre: 'Listado de facturas a pagar en el día',
    detalle: 'Facturas de proveedores con saldo cuyo vencimiento es el día del envío.',
  },
  {
    codigo: 'VENTAS_DIA',
    nombre: 'Reporte general de ventas del día',
    detalle:
      'Ventas del día (FAC y FEL que van a reportes) menos notas de crédito y devoluciones. Abajo: pagos de clientes del día y vales de caja del día.',
  },
  {
    codigo: 'TOP50_SIN_SALDO',
    nombre: 'Top 50 productos sin saldo',
    detalle:
      'Hasta 50 productos habilitados (no deshabilitados) que ya no tienen inventario.',
  },
];

const DDL_WHATSAPP_PROGRAMACION = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'whatsapp_contactos' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.whatsapp_contactos (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    NOMBRE NVARCHAR(120) NOT NULL,
    TELEFONO VARCHAR(20) NOT NULL,
    ACTIVO VARCHAR(2) NOT NULL CONSTRAINT DF_whatsapp_contactos_ACTIVO DEFAULT ('SI'),
    FECHA_CREACION DATETIME NOT NULL CONSTRAINT DF_whatsapp_contactos_FC DEFAULT (GETDATE())
  );
  CREATE INDEX IX_whatsapp_contactos_EMPNIT ON dbo.whatsapp_contactos (EMPNIT);
  CREATE UNIQUE INDEX UQ_whatsapp_contactos_EMP_TEL ON dbo.whatsapp_contactos (EMPNIT, TELEFONO);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'whatsapp_programacion' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.whatsapp_programacion (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    REPORTE VARCHAR(40) NOT NULL,
    HORA CHAR(5) NOT NULL,
    DIAS VARCHAR(20) NOT NULL CONSTRAINT DF_whatsapp_programacion_DIAS DEFAULT ('1,2,3,4,5,6,7'),
    ACTIVO VARCHAR(2) NOT NULL CONSTRAINT DF_whatsapp_programacion_ACTIVO DEFAULT ('SI'),
    ULTIMO_ENVIO DATETIME NULL,
    FECHA_CREACION DATETIME NOT NULL CONSTRAINT DF_whatsapp_programacion_FC DEFAULT (GETDATE())
  );
  CREATE INDEX IX_whatsapp_programacion_EMPNIT ON dbo.whatsapp_programacion (EMPNIT, ACTIVO, HORA);
END;

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'whatsapp_programacion_contactos' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.whatsapp_programacion_contactos (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    PROGRAMACION_ID INT NOT NULL,
    CONTACTO_ID INT NOT NULL
  );
  CREATE UNIQUE INDEX UQ_whatsapp_prog_contacto
    ON dbo.whatsapp_programacion_contactos (EMPNIT, PROGRAMACION_ID, CONTACTO_ID);
  CREATE INDEX IX_whatsapp_prog_contacto_EMP
    ON dbo.whatsapp_programacion_contactos (EMPNIT, PROGRAMACION_ID);
END;
`.trim();

let schemaEnsured = false;

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function reporteByCodigo(codigo) {
  const code = String(codigo || '').trim().toUpperCase();
  return REPORTES.find((r) => r.codigo === code) || null;
}

function normalizeActivo(value, fallback = 'SI') {
  const s = String(value ?? fallback).trim().toUpperCase();
  if (s === 'SI' || s === 'S' || s === '1' || s === 'TRUE') return 'SI';
  if (s === 'NO' || s === 'N' || s === '0' || s === 'FALSE') return 'NO';
  return null;
}

function normalizeHora(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function normalizeDias(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value || '');
  const parts = raw
    .split(/[^0-9]+/)
    .map((p) => p.trim())
    .filter((p) => DIAS_VALIDOS.includes(p));
  const unique = [...new Set(parts)].sort();
  return unique.length ? unique.join(',') : null;
}

function normalizeTelefono(value, dialCode = DIAL_CODE) {
  let digits = String(value || '').replace(/\D/g, '');
  const dial = String(dialCode || DIAL_CODE).replace(/\D/g, '') || DIAL_CODE;
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 8) digits = `${dial}${digits}`;
  if (digits.startsWith('0') && digits.length === 9) digits = `${dial}${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

function isDuplicateKey(err) {
  const n = Number(err?.number);
  return n === 2601 || n === 2627;
}

async function ensureWhatsappProgramacionSchema(pool) {
  if (schemaEnsured) return;
  await pool.request().query(DDL_WHATSAPP_PROGRAMACION);
  schemaEnsured = true;
}

async function listAgenda(pool, empnit) {
  await ensureWhatsappProgramacionSchema(pool);
  const contactosRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      SELECT ID, NOMBRE, TELEFONO, ACTIVO
      FROM dbo.whatsapp_contactos
      WHERE EMPNIT = @EMPNIT
      ORDER BY NOMBRE, ID
    `);
  const progRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      SELECT ID, REPORTE, HORA, DIAS, ACTIVO, ULTIMO_ENVIO
      FROM dbo.whatsapp_programacion
      WHERE EMPNIT = @EMPNIT
      ORDER BY HORA, ID
    `);
  const linksRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      SELECT PROGRAMACION_ID, CONTACTO_ID
      FROM dbo.whatsapp_programacion_contactos
      WHERE EMPNIT = @EMPNIT
    `);
  const byProg = new Map();
  for (const row of linksRes.recordset || []) {
    const key = Number(row.PROGRAMACION_ID);
    if (!byProg.has(key)) byProg.set(key, []);
    byProg.get(key).push(Number(row.CONTACTO_ID));
  }
  const programacion = (progRes.recordset || []).map((row) => ({
    ID: row.ID,
    REPORTE: row.REPORTE,
    HORA: String(row.HORA || '').trim(),
    DIAS: String(row.DIAS || '').trim(),
    ACTIVO: row.ACTIVO,
    ULTIMO_ENVIO: row.ULTIMO_ENVIO || null,
    contactos: byProg.get(Number(row.ID)) || [],
  }));
  return {
    dialCode: DIAL_CODE,
    reportes: REPORTES,
    contactos: contactosRes.recordset || [],
    programacion,
  };
}

async function saveContacto(pool, empnit, data, id) {
  await ensureWhatsappProgramacionSchema(pool);
  const nombre = String(data.NOMBRE || data.nombre || '').trim();
  const telefono = normalizeTelefono(data.TELEFONO ?? data.telefono);
  const activo = normalizeActivo(data.ACTIVO ?? data.activo, 'SI');
  if (!nombre) throw httpError('El nombre del contacto es obligatorio');
  if (nombre.length > 120) throw httpError('El nombre es demasiado largo');
  if (!telefono) throw httpError(`Teléfono inválido. Use 8 dígitos o el número con prefijo ${DIAL_CODE}`);
  if (!activo) throw httpError('Estado inválido');

  try {
    if (id) {
      const result = await pool
        .request()
        .input('ID', sql.Int, id)
        .input('EMPNIT', sql.VarChar(20), empnit)
        .input('NOMBRE', sql.NVarChar(120), nombre)
        .input('TELEFONO', sql.VarChar(20), telefono)
        .input('ACTIVO', sql.VarChar(2), activo)
        .query(`
          UPDATE dbo.whatsapp_contactos
          SET NOMBRE = @NOMBRE, TELEFONO = @TELEFONO, ACTIVO = @ACTIVO
          OUTPUT INSERTED.ID, INSERTED.NOMBRE, INSERTED.TELEFONO, INSERTED.ACTIVO
          WHERE ID = @ID AND EMPNIT = @EMPNIT
        `);
      if (!result.recordset.length) throw httpError('Contacto no encontrado', 404);
      return result.recordset[0];
    }
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar(20), empnit)
      .input('NOMBRE', sql.NVarChar(120), nombre)
      .input('TELEFONO', sql.VarChar(20), telefono)
      .input('ACTIVO', sql.VarChar(2), activo)
      .query(`
        INSERT INTO dbo.whatsapp_contactos (EMPNIT, NOMBRE, TELEFONO, ACTIVO)
        OUTPUT INSERTED.ID, INSERTED.NOMBRE, INSERTED.TELEFONO, INSERTED.ACTIVO
        VALUES (@EMPNIT, @NOMBRE, @TELEFONO, @ACTIVO)
      `);
    return result.recordset[0];
  } catch (err) {
    if (isDuplicateKey(err)) throw httpError('Ya existe un contacto con ese teléfono');
    throw err;
  }
}

async function deleteContacto(pool, empnit, id) {
  await ensureWhatsappProgramacionSchema(pool);
  const used = await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      SELECT COUNT(*) AS n
      FROM dbo.whatsapp_programacion_contactos
      WHERE EMPNIT = @EMPNIT AND CONTACTO_ID = @ID
    `);
  if (Number(used.recordset[0]?.n) > 0) {
    throw httpError('Quite el contacto de los envíos programados antes de eliminarlo', 409);
  }
  const result = await pool
    .request()
    .input('ID', sql.Int, id)
    .input('EMPNIT', sql.VarChar(20), empnit)
    .query(`
      DELETE FROM dbo.whatsapp_contactos
      WHERE ID = @ID AND EMPNIT = @EMPNIT
    `);
  if (!result.rowsAffected[0]) throw httpError('Contacto no encontrado', 404);
  return { ok: true };
}

function parseProgramacionPayload(data) {
  const reporte = reporteByCodigo(data.REPORTE ?? data.reporte);
  if (!reporte) throw httpError('Seleccione un reporte válido');
  const hora = normalizeHora(data.HORA ?? data.hora);
  if (!hora) throw httpError('Indique una hora válida');
  const dias = normalizeDias(data.DIAS ?? data.dias);
  if (!dias) throw httpError('Seleccione al menos un día');
  const activo = normalizeActivo(data.ACTIVO ?? data.activo, 'SI');
  if (!activo) throw httpError('Estado inválido');
  const contactos = (Array.isArray(data.contactos) ? data.contactos : [])
    .map((id) => parseInt(id, 10))
    .filter((id) => Number.isFinite(id) && id > 0);
  const unique = [...new Set(contactos)];
  if (!unique.length) throw httpError('Seleccione al menos un contacto');
  return { reporte: reporte.codigo, hora, dias, activo, contactos: unique };
}

async function assertContactosEmpresa(transaction, empnit, ids) {
  const request = new sql.Request(transaction).input('EMPNIT', sql.VarChar(20), empnit);
  ids.forEach((id, i) => request.input(`C${i}`, sql.Int, id));
  const inList = ids.map((_, i) => `@C${i}`).join(', ');
  const result = await request.query(`
    SELECT ID
    FROM dbo.whatsapp_contactos
    WHERE EMPNIT = @EMPNIT AND ID IN (${inList})
  `);
  const found = new Set((result.recordset || []).map((r) => Number(r.ID)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) throw httpError('Hay contactos que no pertenecen a esta empresa');
}

async function replaceProgramacionContactos(transaction, empnit, programacionId, contactoIds) {
  await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar(20), empnit)
    .input('PROGRAMACION_ID', sql.Int, programacionId)
    .query(`
      DELETE FROM dbo.whatsapp_programacion_contactos
      WHERE EMPNIT = @EMPNIT AND PROGRAMACION_ID = @PROGRAMACION_ID
    `);
  for (const contactoId of contactoIds) {
    await new sql.Request(transaction)
      .input('EMPNIT', sql.VarChar(20), empnit)
      .input('PROGRAMACION_ID', sql.Int, programacionId)
      .input('CONTACTO_ID', sql.Int, contactoId)
      .query(`
        INSERT INTO dbo.whatsapp_programacion_contactos (EMPNIT, PROGRAMACION_ID, CONTACTO_ID)
        VALUES (@EMPNIT, @PROGRAMACION_ID, @CONTACTO_ID)
      `);
  }
}

async function saveProgramacion(pool, empnit, data, id) {
  await ensureWhatsappProgramacionSchema(pool);
  const payload = parseProgramacionPayload(data);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await assertContactosEmpresa(transaction, empnit, payload.contactos);
    let programacionId = id || null;
    if (programacionId) {
      const upd = await new sql.Request(transaction)
        .input('ID', sql.Int, programacionId)
        .input('EMPNIT', sql.VarChar(20), empnit)
        .input('REPORTE', sql.VarChar(40), payload.reporte)
        .input('HORA', sql.Char(5), payload.hora)
        .input('DIAS', sql.VarChar(20), payload.dias)
        .input('ACTIVO', sql.VarChar(2), payload.activo)
        .query(`
          UPDATE dbo.whatsapp_programacion
          SET REPORTE = @REPORTE, HORA = @HORA, DIAS = @DIAS, ACTIVO = @ACTIVO
          WHERE ID = @ID AND EMPNIT = @EMPNIT
        `);
      if (!upd.rowsAffected[0]) throw httpError('Programación no encontrada', 404);
    } else {
      const ins = await new sql.Request(transaction)
        .input('EMPNIT', sql.VarChar(20), empnit)
        .input('REPORTE', sql.VarChar(40), payload.reporte)
        .input('HORA', sql.Char(5), payload.hora)
        .input('DIAS', sql.VarChar(20), payload.dias)
        .input('ACTIVO', sql.VarChar(2), payload.activo)
        .query(`
          INSERT INTO dbo.whatsapp_programacion (EMPNIT, REPORTE, HORA, DIAS, ACTIVO)
          OUTPUT INSERTED.ID
          VALUES (@EMPNIT, @REPORTE, @HORA, @DIAS, @ACTIVO)
        `);
      programacionId = ins.recordset[0].ID;
    }
    await replaceProgramacionContactos(transaction, empnit, programacionId, payload.contactos);
    await transaction.commit();
    return { ID: programacionId, ...payload };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

async function deleteProgramacion(pool, empnit, id) {
  await ensureWhatsappProgramacionSchema(pool);
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await new sql.Request(transaction)
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar(20), empnit)
      .query(`
        DELETE FROM dbo.whatsapp_programacion_contactos
        WHERE EMPNIT = @EMPNIT AND PROGRAMACION_ID = @ID
      `);
    const del = await new sql.Request(transaction)
      .input('ID', sql.Int, id)
      .input('EMPNIT', sql.VarChar(20), empnit)
      .query(`
        DELETE FROM dbo.whatsapp_programacion
        WHERE ID = @ID AND EMPNIT = @EMPNIT
      `);
    if (!del.rowsAffected[0]) throw httpError('Programación no encontrada', 404);
    await transaction.commit();
    return { ok: true };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

module.exports = {
  DIAL_CODE,
  MONEY_LOCALE,
  CURRENCY,
  REPORTES,
  DDL_WHATSAPP_PROGRAMACION,
  ensureWhatsappProgramacionSchema,
  listAgenda,
  saveContacto,
  deleteContacto,
  saveProgramacion,
  deleteProgramacion,
  reporteByCodigo,
};
