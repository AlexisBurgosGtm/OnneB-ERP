/**
 * Sube catálogo local al host COMMUNITY_* con bulk insert (SqlBulkCopy).
 * Maestros: Marcas, MEDIDAS, CLASIFICACIONUNO, PROVEEDORES→CLASIFICACIONTRES
 * Ítems: PRODUCTOS, PRECIOS, INVSALDO (saldos en cero).
 */
const sql = require('mssql');

const CLOUD_EMPNIT = 'GENERAL';
const BULK_CHUNK = 1500;
const BULK_TIMEOUT_MS = 10 * 60 * 1000;

/** Orden de subida: maestros primero, luego productos/precios/saldos. */
const TABLE_MAP = [
  { local: 'Marcas', community: 'COMMUNITY_MARCAS', key: 'marcas', zeroInventory: false },
  { local: 'MEDIDAS', community: 'COMMUNITY_MEDIDAS', key: 'medidas', zeroInventory: false },
  {
    local: 'CLASIFICACIONUNO',
    community: 'COMMUNITY_CLASIFICACIONUNO',
    key: 'clasificacionuno',
    zeroInventory: false,
  },
  {
    local: 'PROVEEDORES',
    community: 'COMMUNITY_CLASIFICACIONTRES',
    key: 'proveedores',
    zeroInventory: false,
    /** Local → nube */
    mapRows: mapProveedoresToCommunity,
  },
  { local: 'PRODUCTOS', community: 'COMMUNITY_PRODUCTOS', key: 'productos', zeroInventory: false },
  { local: 'PRECIOS', community: 'COMMUNITY_PRECIOS', key: 'precios', zeroInventory: false },
  { local: 'INVSALDO', community: 'COMMUNITY_INVSALDO', key: 'invsaldo', zeroInventory: true },
];

/** Orden de borrado en nube: hijos / dependientes primero. */
const CLOUD_DELETE_ORDER = [
  { table: 'COMMUNITY_INVSALDO', key: 'invsaldo' },
  { table: 'COMMUNITY_PRECIOS', key: 'precios' },
  { table: 'COMMUNITY_PRODUCTOS', key: 'productos' },
  { table: 'COMMUNITY_CLASIFICACIONTRES', key: 'proveedores' },
  { table: 'COMMUNITY_CLASIFICACIONUNO', key: 'clasificacionuno' },
  { table: 'COMMUNITY_MEDIDAS', key: 'medidas' },
  { table: 'COMMUNITY_MARCAS', key: 'marcas' },
];

const ZERO_INV_COLS = new Set(['SALDO', 'EXISTENCIA', 'FISICO']);

function safeIdent(name) {
  return String(name || '').replace(/[^A-Za-z0-9_]/g, '');
}

function mapSqlType(typeName, maxLength, precision, scale) {
  const t = String(typeName || '').toLowerCase();
  const maxLen = Number(maxLength);
  const prec = Number(precision) || 18;
  const sc = scale == null ? 2 : Number(scale);
  switch (t) {
    case 'int':
      return sql.Int;
    case 'bigint':
      return sql.BigInt;
    case 'smallint':
      return sql.SmallInt;
    case 'tinyint':
      return sql.TinyInt;
    case 'bit':
      return sql.Bit;
    case 'float':
      return sql.Float;
    case 'real':
      return sql.Real;
    case 'decimal':
    case 'numeric':
      return sql.Decimal(prec, sc);
    case 'money':
      return sql.Money;
    case 'smallmoney':
      return sql.SmallMoney;
    case 'date':
      return sql.Date;
    case 'datetime':
    case 'datetime2':
    case 'smalldatetime':
      return sql.DateTime2(7);
    case 'time':
      return sql.Time(7);
    case 'uniqueidentifier':
      return sql.UniqueIdentifier;
    case 'nvarchar':
      return maxLen === -1 ? sql.NVarChar(sql.MAX) : sql.NVarChar(Math.max(1, Math.floor(maxLen / 2)));
    case 'varchar':
      return maxLen === -1 ? sql.VarChar(sql.MAX) : sql.VarChar(Math.max(1, maxLen));
    case 'nchar':
      return sql.NChar(Math.max(1, Math.floor(maxLen / 2)));
    case 'char':
      return sql.Char(Math.max(1, maxLen));
    case 'ntext':
      return sql.NText;
    case 'text':
      return sql.Text;
    case 'varbinary':
      return maxLen === -1 ? sql.VarBinary(sql.MAX) : sql.VarBinary(Math.max(1, maxLen));
    case 'binary':
      return sql.Binary(Math.max(1, maxLen));
    case 'image':
      return sql.Image;
    default:
      return sql.NVarChar(sql.MAX);
  }
}

async function getHostColumns(pool, tableName) {
  const safe = safeIdent(tableName);
  const result = await pool.request().query(`
    SELECT
      c.name AS COLUMN_NAME,
      c.is_identity AS IS_IDENTITY,
      c.is_nullable AS IS_NULLABLE,
      c.max_length AS MAX_LENGTH,
      c.precision AS PRECISION,
      c.scale AS SCALE,
      t.name AS TYPE_NAME
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID(N'dbo.${safe}')
    ORDER BY c.column_id
  `);
  return (result.recordset || []).map((r) => ({
    name: String(r.COLUMN_NAME),
    isIdentity: Boolean(r.IS_IDENTITY),
    nullable: Boolean(r.IS_NULLABLE),
    type: mapSqlType(r.TYPE_NAME, r.MAX_LENGTH, r.PRECISION, r.SCALE),
    typeName: String(r.TYPE_NAME || ''),
  }));
}

function rowValueMap(row) {
  const map = {};
  for (const key of Object.keys(row || {})) {
    map[String(key).toUpperCase()] = row[key];
  }
  return map;
}

/** PROVEEDORES → COMMUNITY_CLASIFICACIONTRES */
function mapProveedoresToCommunity(rows) {
  return (rows || []).map((row) => {
    const u = rowValueMap(row);
    return {
      CODCLATRES: u.CODPROV,
      DESCLATRES: u.EMPRESA,
    };
  });
}

/** COMMUNITY_CLASIFICACIONTRES → PROVEEDORES */
function mapCommunityToProveedores(rows) {
  return (rows || []).map((row) => {
    const u = rowValueMap(row);
    return {
      CODPROV: u.CODCLATRES,
      EMPRESA: u.DESCLATRES,
    };
  });
}

function resolveCell(colName, upperRow, extras, zeroInventory) {
  const u = String(colName).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(extras, u)) return extras[u];
  if (zeroInventory && ZERO_INV_COLS.has(u)) return 0;
  if (Object.prototype.hasOwnProperty.call(upperRow, u)) {
    const v = upperRow[u];
    return v === undefined ? null : v;
  }
  return null;
}

async function bulkInsertRows(hostPool, tableName, columns, rows, extras, zeroInventory) {
  if (!rows.length) return 0;

  const sourceKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row || {})) sourceKeys.add(String(key).toUpperCase());
  }
  sourceKeys.add('TOKEN');
  sourceKeys.add('EMPNIT');
  if (zeroInventory) {
    for (const z of ZERO_INV_COLS) sourceKeys.add(z);
  }

  const insertCols = columns.filter(
    (c) => !c.isIdentity && sourceKeys.has(String(c.name).toUpperCase())
  );
  if (!insertCols.length) {
    throw new Error(`Sin columnas insertables en ${tableName}`);
  }
  if (!insertCols.some((c) => c.name.toUpperCase() === 'TOKEN')) {
    throw new Error(`${tableName} no tiene columna TOKEN`);
  }
  if (!insertCols.some((c) => c.name.toUpperCase() === 'EMPNIT')) {
    throw new Error(`${tableName} no tiene columna EMPNIT`);
  }

  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += BULK_CHUNK) {
    const chunk = rows.slice(offset, offset + BULK_CHUNK);
    const table = new sql.Table(`dbo.${safeIdent(tableName)}`);
    table.create = false;
    for (const col of insertCols) {
      table.columns.add(col.name, col.type, { nullable: col.nullable, primary: false });
    }
    for (const row of chunk) {
      const upper = rowValueMap(row);
      const values = insertCols.map((col) =>
        resolveCell(col.name, upper, extras, zeroInventory)
      );
      table.rows.add(...values);
    }
    const request = hostPool.request();
    request.timeout = BULK_TIMEOUT_MS;
    await request.bulk(table);
    inserted += chunk.length;
  }
  return inserted;
}

/**
 * Antes de subir: elimina el catálogo cloud previo de este TOKEN con EMPNIT = GENERAL.
 */
async function deleteCommunityCatalog(hostPool, token) {
  const tokenVal = String(token || '').trim();
  const deleted = {};

  for (const spec of CLOUD_DELETE_ORDER) {
    const request = hostPool.request();
    request.timeout = BULK_TIMEOUT_MS;
    const result = await request
      .input('TOKEN', sql.VarChar, tokenVal)
      .input('EMPNIT', sql.VarChar, CLOUD_EMPNIT)
      .query(`
        DELETE FROM dbo.[${safeIdent(spec.table)}]
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
          AND UPPER(LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50))))) = UPPER(LTRIM(RTRIM(@EMPNIT)))
      `);
    deleted[spec.key] = Number(result.rowsAffected?.[0] || 0);
  }

  return deleted;
}

/**
 * @param {object} opts
 * @param {import('mssql').ConnectionPool} opts.localPool
 * @param {import('mssql').ConnectionPool} opts.hostPool
 * @param {string} opts.token
 * @param {string} opts.empnit
 */
async function uploadCatalogToCommunity({ localPool, hostPool, token, empnit }) {
  const tokenVal = String(token || '').trim();
  const empnitVal = String(empnit || '').trim();
  if (!tokenVal) throw new Error('TOKEN no configurado');
  if (!empnitVal) throw new Error('EMPNIT requerido');

  const extras = {
    TOKEN: tokenVal,
    EMPNIT: CLOUD_EMPNIT,
  };

  const counts = {};
  for (const spec of TABLE_MAP) counts[spec.key] = 0;

  const eliminados = await deleteCommunityCatalog(hostPool, tokenVal);

  for (const spec of TABLE_MAP) {
    const hostCols = await getHostColumns(hostPool, spec.community);
    if (!hostCols.length) {
      throw new Error(`Tabla ${spec.community} no encontrada en el host`);
    }

    const localRes = await localPool
      .request()
      .input('EMPNIT', sql.VarChar, empnitVal)
      .query(`SELECT * FROM dbo.[${safeIdent(spec.local)}] WHERE EMPNIT = @EMPNIT`);
    let rows = localRes.recordset || [];
    if (typeof spec.mapRows === 'function') {
      rows = spec.mapRows(rows);
    }

    counts[spec.key] = await bulkInsertRows(
      hostPool,
      spec.community,
      hostCols,
      rows,
      extras,
      spec.zeroInventory
    );
  }

  return {
    ok: true,
    empnitCloud: CLOUD_EMPNIT,
    eliminados,
    ...counts,
  };
}

module.exports = {
  uploadCatalogToCommunity,
  CLOUD_EMPNIT,
  mapProveedoresToCommunity,
  mapCommunityToProveedores,
  TABLE_MAP,
};
