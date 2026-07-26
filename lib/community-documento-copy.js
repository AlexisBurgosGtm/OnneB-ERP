/**
 * Copia DOCUMENTOS / DOCPRODUCTOS locales hacia
 * COMMUNITY_DOCUMENTOS / COMMUNITY_DOCPRODUCTOS en el host UPDATE_*.
 * Trunca textos al tamaño de cada columna destino para evitar truncation.
 */
const sql = require('mssql');

const SKIP_TYPES = new Set([
  'image',
  'varbinary',
  'binary',
  'timestamp',
  'rowversion',
  'geography',
  'geometry',
  'hierarchyid',
  'xml',
  'sql_variant',
]);

function safeIdent(name) {
  return String(name || '').replace(/[^A-Za-z0-9_]/g, '');
}

/**
 * @returns {Promise<Array<{ name: string, maxChars: number|null, isChar: boolean, typeName: string }>>}
 */
async function getInsertableColumns(pool, tableName) {
  const safe = safeIdent(tableName);
  const result = await pool.request().query(`
    SELECT
      c.name AS COLUMN_NAME,
      c.is_identity AS IS_IDENTITY,
      c.max_length AS MAX_LENGTH,
      TYPE_NAME(c.system_type_id) AS TYPE_NAME
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID(N'dbo.${safe}')
    ORDER BY c.column_id
  `);
  return (result.recordset || [])
    .filter((r) => !r.IS_IDENTITY)
    .map((r) => {
      const typeName = String(r.TYPE_NAME || '').toLowerCase();
      const maxLen = Number(r.MAX_LENGTH);
      const isChar = ['varchar', 'nvarchar', 'char', 'nchar', 'text', 'ntext', 'sysname'].includes(
        typeName
      );
      let maxChars = null;
      if (isChar && maxLen === -1) {
        maxChars = null;
      } else if (isChar && maxLen > 0) {
        maxChars =
          typeName === 'nvarchar' || typeName === 'nchar' || typeName === 'sysname' || typeName === 'ntext'
            ? Math.floor(maxLen / 2)
            : maxLen;
      }
      return {
        name: String(r.COLUMN_NAME),
        maxChars,
        isChar,
        typeName,
        skip: SKIP_TYPES.has(typeName),
      };
    })
    .filter((c) => !c.skip);
}

function toInsertValue(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Buffer.isBuffer(value)) return null;
  if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
    // Evitar objetos mssql raros / JSON
    if (typeof value.toISOString === 'function') return value;
    return null;
  }
  return value;
}

function truncateForColumn(value, colMeta) {
  const v = toInsertValue(value);
  if (v == null) return null;
  if (!colMeta?.isChar || colMeta.maxChars == null || colMeta.maxChars <= 0) return v;
  const s = String(v);
  return s.length <= colMeta.maxChars ? s : s.slice(0, colMeta.maxChars);
}

function pickRowValues(row, columnsMeta, extras = {}) {
  const out = {};
  const upperMap = {};
  for (const key of Object.keys(row || {})) {
    upperMap[String(key).toUpperCase()] = row[key];
  }

  for (const col of columnsMeta) {
    const u = String(col.name).toUpperCase();
    let raw;
    if (Object.prototype.hasOwnProperty.call(extras, u)) {
      raw = extras[u];
    } else if (Object.prototype.hasOwnProperty.call(upperMap, u)) {
      raw = upperMap[u];
    } else {
      continue;
    }
    out[col.name] = truncateForColumn(raw, col);
  }
  return out;
}

async function insertRow(poolOrTx, tableName, values) {
  const cols = Object.keys(values);
  if (!cols.length) {
    throw new Error(`Sin columnas para insertar en ${tableName}`);
  }
  const req = poolOrTx.request();
  const params = [];
  cols.forEach((col, i) => {
    const p = `p${i}`;
    params.push(`@${p}`);
    const val = values[col] === undefined ? null : values[col];
    if (typeof val === 'string') {
      req.input(p, sql.NVarChar(sql.MAX), val);
    } else if (val instanceof Date) {
      req.input(p, sql.DateTime2(7), val);
    } else if (typeof val === 'number' && Number.isInteger(val)) {
      req.input(p, sql.BigInt, val);
    } else if (typeof val === 'number') {
      req.input(p, sql.Float, val);
    } else if (typeof val === 'boolean') {
      req.input(p, sql.Bit, val);
    } else {
      req.input(p, val);
    }
  });
  const safeTable = safeIdent(tableName);
  const colSql = cols.map((c) => `[${String(c).replace(/]/g, '')}]`).join(', ');
  await req.query(`INSERT INTO dbo.[${safeTable}] (${colSql}) VALUES (${params.join(', ')})`);
}

/**
 * Longitud útil de DOCUMENTOS.MARCA (para guardar ENVIADO sin truncar de más).
 */
async function getDocumentosMarcaMaxChars(pool) {
  const result = await pool.request().query(`
    SELECT
      c.max_length AS MAX_LENGTH,
      TYPE_NAME(c.system_type_id) AS TYPE_NAME
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID(N'dbo.DOCUMENTOS')
      AND c.name = N'MARCA'
  `);
  const row = result.recordset?.[0];
  if (!row) return 7;
  const typeName = String(row.TYPE_NAME || '').toLowerCase();
  const maxLen = Number(row.MAX_LENGTH);
  if (maxLen === -1) return 50;
  if (typeName === 'nvarchar' || typeName === 'nchar') return Math.max(1, Math.floor(maxLen / 2));
  if (typeName === 'varchar' || typeName === 'char') return Math.max(1, maxLen);
  return 7;
}

/** Valor a guardar en MARCA (preferente ENVIADO, recortado al tamaño de columna). */
function marcaEnviadoValue(maxChars) {
  const full = 'ENVIADO';
  const n = Number(maxChars) || full.length;
  return full.slice(0, Math.max(1, n));
}

/**
 * @param {object} opts
 */
async function copyDocumentoToCommunity({ localPool, hostPool, token, empnit, coddoc, correlativo }) {
  const tokenVal = String(token || '').trim();
  if (!tokenVal) throw new Error('TOKEN no configurado');

  const headerRes = await localPool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT *
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const header = headerRes.recordset?.[0];
  if (!header) throw new Error('Documento no encontrado');

  const linesRes = await localPool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT *
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY Id
    `);
  const lines = linesRes.recordset || [];

  const docCols = await getInsertableColumns(hostPool, 'COMMUNITY_DOCUMENTOS');
  const lineCols = await getInsertableColumns(hostPool, 'COMMUNITY_DOCPRODUCTOS');
  if (!docCols.length) throw new Error('Tabla COMMUNITY_DOCUMENTOS no encontrada o sin columnas');
  if (!lineCols.length) throw new Error('Tabla COMMUNITY_DOCPRODUCTOS no encontrada o sin columnas');

  const extras = { TOKEN: tokenVal, TIPOVENTA: 'T', MARCA: 'SN' };
  const headerValues = pickRowValues(header, docCols, extras);
  if (!Object.keys(headerValues).some((k) => String(k).toUpperCase() === 'TOKEN')) {
    throw new Error('COMMUNITY_DOCUMENTOS no tiene columna TOKEN');
  }
  const tipCol = docCols.find((c) => String(c.name).toUpperCase() === 'TIPOVENTA');
  if (tipCol) {
    headerValues[tipCol.name] = truncateForColumn('T', tipCol);
  }
  const marcaCol = docCols.find((c) => String(c.name).toUpperCase() === 'MARCA');
  if (marcaCol) {
    headerValues[marcaCol.name] = truncateForColumn('SN', marcaCol);
  }

  const transaction = new sql.Transaction(hostPool);
  await transaction.begin();
  try {
    await transaction
      .request()
      .input('TOKEN', sql.VarChar, tokenVal)
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        DELETE FROM dbo.COMMUNITY_DOCPRODUCTOS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
          AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
          AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
          AND CORRELATIVO = @CORRELATIVO;

        DELETE FROM dbo.COMMUNITY_DOCUMENTOS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
          AND LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) = LTRIM(RTRIM(@EMPNIT))
          AND LTRIM(RTRIM(CAST(CODDOC AS VARCHAR(50)))) = LTRIM(RTRIM(@CODDOC))
          AND CORRELATIVO = @CORRELATIVO;
      `);

    try {
      await insertRow(transaction, 'COMMUNITY_DOCUMENTOS', headerValues);
    } catch (err) {
      const detail = Object.entries(headerValues)
        .filter(([, v]) => typeof v === 'string')
        .map(([k, v]) => `${k}(${String(v).length})`)
        .slice(0, 12)
        .join(', ');
      throw new Error(`${err.message || 'Error al insertar COMMUNITY_DOCUMENTOS'} [${detail}]`);
    }

    for (let i = 0; i < lines.length; i += 1) {
      const lineValues = pickRowValues(lines[i], lineCols, extras);
      try {
        await insertRow(transaction, 'COMMUNITY_DOCPRODUCTOS', lineValues);
      } catch (err) {
        throw new Error(
          `${err.message || 'Error al insertar COMMUNITY_DOCPRODUCTOS'} (línea ${i + 1})`
        );
      }
    }

    await transaction.commit();
    return { ok: true, lineas: lines.length };
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
  copyDocumentoToCommunity,
  getDocumentosMarcaMaxChars,
  marcaEnviadoValue,
};
