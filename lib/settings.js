const sql = require('mssql');

/** Nombres en dbo.SETTINGS.OPCION (coinciden con la base de datos). */
const SETTING_OPCION = {
  CLAVE_ADMIN: 'CLAVE ADMIN',
  CLAVE_OPERADOR: 'CLAVE OPERADOR',
  INVENTARIO_NEGATIVO: 'INVENTARIO NEGATIVO',
  SOLICITA_CLAVE_VENDEDOR: 'SOLICITA CLAVE VENDEDOR',
  IMPRIME_TICKET: 'IMPRIME TICKET AL GUARDAR VENTA',
  COBRO_PREDETERMINADO: 'COBRO PREDETERMINADO',
  URL_FEL: 'URL FEL',
};

/** Respaldo temporal: Config.ID → PASS o SINO si SETTINGS.VALOR aún está vacío. */
const LEGACY_CONFIG_PASS = {
  [SETTING_OPCION.CLAVE_ADMIN]: 2,
  [SETTING_OPCION.CLAVE_OPERADOR]: 21,
};

const LEGACY_CONFIG_SINO = {
  [SETTING_OPCION.INVENTARIO_NEGATIVO]: 3,
  [SETTING_OPCION.SOLICITA_CLAVE_VENDEDOR]: 17,
  [SETTING_OPCION.IMPRIME_TICKET]: 11,
  [SETTING_OPCION.COBRO_PREDETERMINADO]: 15,
};

function normalizeOpcion(raw) {
  return String(raw ?? '').trim();
}

function isEmptyValor(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function normalizeSino(value) {
  const sino = String(value ?? '')
    .trim()
    .toUpperCase();
  return sino === 'SI' ? 'SI' : 'NO';
}

async function readLegacyConfigValue(pool, opcion) {
  const passId = LEGACY_CONFIG_PASS[opcion];
  if (passId) {
    const result = await pool
      .request()
      .input('ID', sql.Int, passId)
      .query('SELECT PASS FROM Config WHERE ID = @ID');
    if (result.recordset.length) {
      return String(result.recordset[0].PASS ?? '');
    }
  }
  const sinoId = LEGACY_CONFIG_SINO[opcion];
  if (sinoId) {
    const result = await pool
      .request()
      .input('ID', sql.Int, sinoId)
      .query('SELECT SINO FROM Config WHERE ID = @ID');
    if (result.recordset.length) {
      return normalizeSino(result.recordset[0].SINO);
    }
  }
  return null;
}

async function getSettingRow(pool, opcion) {
  const key = normalizeOpcion(opcion);
  if (!key) return null;
  const result = await pool
    .request()
    .input('OPCION', sql.VarChar, key)
    .query('SELECT OPCION, VALOR FROM dbo.SETTINGS WHERE OPCION = @OPCION');
  return result.recordset[0] || null;
}

async function getSettingValue(pool, opcion, { migrateLegacy = true } = {}) {
  const key = normalizeOpcion(opcion);
  if (!key) return null;

  const row = await getSettingRow(pool, key);
  if (!row) return null;

  let valor = row.VALOR;
  if (isEmptyValor(valor) && migrateLegacy) {
    const legacy = await readLegacyConfigValue(pool, key);
    if (!isEmptyValor(legacy)) {
      valor = legacy;
      await setSettingValue(pool, key, legacy, { skipExistsCheck: true });
    }
  }

  if (isEmptyValor(valor)) return null;
  return String(valor);
}

async function setSettingValue(pool, opcion, valor, { skipExistsCheck = false } = {}) {
  const key = normalizeOpcion(opcion);
  if (!key) {
    const err = new Error('OPCION requerida');
    err.statusCode = 400;
    throw err;
  }

  const existing = await getSettingRow(pool, key);
  const valueToStore = valor === null || valor === undefined ? null : String(valor);

  if (existing) {
    const result = await pool
      .request()
      .input('OPCION', sql.VarChar, key)
      .input('VALOR', sql.NVarChar(sql.MAX), valueToStore)
      .query('UPDATE dbo.SETTINGS SET VALOR = @VALOR WHERE OPCION = @OPCION');
    if (result.rowsAffected[0] > 0) return valueToStore;
  }

  if (!existing && !skipExistsCheck) {
    await pool
      .request()
      .input('OPCION', sql.VarChar, key)
      .input('VALOR', sql.NVarChar(sql.MAX), valueToStore)
      .query('INSERT INTO dbo.SETTINGS (OPCION, VALOR) VALUES (@OPCION, @VALOR)');
    return valueToStore;
  }

  if (skipExistsCheck) {
    const result = await pool
      .request()
      .input('OPCION', sql.VarChar, key)
      .input('VALOR', sql.NVarChar(sql.MAX), valueToStore)
      .query('UPDATE dbo.SETTINGS SET VALOR = @VALOR WHERE OPCION = @OPCION');
    if (result.rowsAffected[0] === 0) {
      const err = new Error(`Configuración no encontrada: ${key}`);
      err.statusCode = 404;
      throw err;
    }
    return valueToStore;
  }

  const err = new Error(`Configuración no encontrada: ${key}`);
  err.statusCode = 404;
  throw err;
}

async function getSettingSino(pool, opcion, options) {
  const raw = await getSettingValue(pool, opcion, options);
  return normalizeSino(raw ?? 'NO');
}

async function verifySettingPass(pool, pass, opcion = SETTING_OPCION.CLAVE_ADMIN) {
  const stored = await getSettingValue(pool, opcion);
  if (stored === null) return false;
  return String(pass ?? '') === stored;
}

module.exports = {
  SETTING_OPCION,
  normalizeOpcion,
  normalizeSino,
  getSettingValue,
  getSettingSino,
  setSettingValue,
  verifySettingPass,
};
