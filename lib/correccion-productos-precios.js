const sql = require('mssql');
const { deduplicateInvSaldo } = require('./invsaldo');

const INDEX_PRODUCTOS = 'UQ_PRODUCTOS_EMPNIT_CODPROD';
const INDEX_INVSALDO = 'UQ_INVSALDO_EMPNIT_CODPROD';
const INDEX_PRECIOS = 'UQ_PRECIOS_EMPNIT_CODPROD_CODMEDIDA';

/**
 * Elimina duplicados EMPNIT+CODPROD en PRODUCTOS (deja 1).
 * @param {string|null} empnit si es null, aplica a todas las empresas
 */
async function deduplicateProductos(db, empnit) {
  const empnitTrim = empnit == null ? null : String(empnit || '').trim();
  const hasId = await tableHasColumn(db, 'PRODUCTOS', 'ID');
  const req = db.request();
  const where = empnitTrim ? 'WHERE EMPNIT = @EMPNIT' : '';
  if (empnitTrim) req.input('EMPNIT', sql.VarChar, empnitTrim);

  if (hasId) {
    const del = await req.query(`
      ;WITH Ranked AS (
        SELECT
          ID,
          ROW_NUMBER() OVER (
            PARTITION BY EMPNIT, LTRIM(RTRIM(CODPROD))
            ORDER BY ID
          ) AS RN
        FROM dbo.PRODUCTOS
        ${where}
      )
      DELETE p
      FROM dbo.PRODUCTOS p
      INNER JOIN Ranked r ON r.ID = p.ID
      WHERE r.RN > 1
    `);
    return del.rowsAffected[0] ?? 0;
  }

  const del = await req.query(`
    ;WITH Ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY EMPNIT, LTRIM(RTRIM(CODPROD))
          ORDER BY (SELECT NULL)
        ) AS RN
      FROM dbo.PRODUCTOS
      ${where}
    )
    DELETE FROM Ranked WHERE RN > 1
  `);
  return del.rowsAffected[0] ?? 0;
}

/**
 * Elimina duplicados EMPNIT+CODPROD+CODMEDIDA en PRECIOS (deja 1 por medida).
 * @param {string|null} empnit si es null, aplica a todas las empresas
 */
async function deduplicatePrecios(db, empnit) {
  const empnitTrim = empnit == null ? null : String(empnit || '').trim();
  const hasId = await tableHasColumn(db, 'PRECIOS', 'ID');
  const req = db.request();
  const where = empnitTrim ? 'WHERE EMPNIT = @EMPNIT' : '';
  if (empnitTrim) req.input('EMPNIT', sql.VarChar, empnitTrim);

  if (hasId) {
    const del = await req.query(`
      ;WITH Ranked AS (
        SELECT
          ID,
          ROW_NUMBER() OVER (
            PARTITION BY EMPNIT, LTRIM(RTRIM(CODPROD)), LTRIM(RTRIM(CODMEDIDA))
            ORDER BY ID
          ) AS RN
        FROM dbo.PRECIOS
        ${where}
      )
      DELETE p
      FROM dbo.PRECIOS p
      INNER JOIN Ranked r ON r.ID = p.ID
      WHERE r.RN > 1
    `);
    return del.rowsAffected[0] ?? 0;
  }

  const del = await req.query(`
    ;WITH Ranked AS (
      SELECT
        *,
        ROW_NUMBER() OVER (
          PARTITION BY EMPNIT, LTRIM(RTRIM(CODPROD)), LTRIM(RTRIM(CODMEDIDA))
          ORDER BY (SELECT NULL)
        ) AS RN
      FROM dbo.PRECIOS
      ${where}
    )
    DELETE FROM Ranked WHERE RN > 1
  `);
  return del.rowsAffected[0] ?? 0;
}

async function tableHasColumn(db, tableName, columnName) {
  const r = await db
    .request()
    .input('TABLE_NAME', sql.NVarChar, tableName)
    .input('COLUMN_NAME', sql.NVarChar, columnName)
    .query(`
      SELECT 1 AS ok
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = @TABLE_NAME
        AND COLUMN_NAME = @COLUMN_NAME
    `);
  return r.recordset.length > 0;
}

async function indexExists(db, indexName) {
  const r = await db
    .request()
    .input('INDEX_NAME', sql.NVarChar, indexName)
    .query(`
      SELECT 1 AS ok
      FROM sys.indexes
      WHERE name = @INDEX_NAME AND object_id IN (
        OBJECT_ID('dbo.PRODUCTOS'),
        OBJECT_ID('dbo.INVSALDO'),
        OBJECT_ID('dbo.PRECIOS')
      )
    `);
  return r.recordset.length > 0;
}

/**
 * Crea índices únicos para evitar duplicados futuros.
 * @returns {{ created: string[], skipped: string[], errors: string[] }}
 */
async function ensureUniqueIndexes(db) {
  const created = [];
  const skipped = [];
  const errors = [];

  const specs = [
    {
      name: INDEX_PRODUCTOS,
      ddl: `CREATE UNIQUE NONCLUSTERED INDEX [${INDEX_PRODUCTOS}] ON dbo.PRODUCTOS (EMPNIT, CODPROD)`,
    },
    {
      name: INDEX_INVSALDO,
      ddl: `CREATE UNIQUE NONCLUSTERED INDEX [${INDEX_INVSALDO}] ON dbo.INVSALDO (EMPNIT, CODPROD)`,
    },
    {
      name: INDEX_PRECIOS,
      ddl: `CREATE UNIQUE NONCLUSTERED INDEX [${INDEX_PRECIOS}] ON dbo.PRECIOS (EMPNIT, CODPROD, CODMEDIDA)`,
    },
  ];

  for (const spec of specs) {
    try {
      if (await indexExists(db, spec.name)) {
        skipped.push(spec.name);
        continue;
      }
      await db.request().query(spec.ddl);
      created.push(spec.name);
    } catch (err) {
      errors.push(`${spec.name}: ${err.message || String(err)}`);
    }
  }

  return { created, skipped, errors };
}

/**
 * Corrección completa: deduplica PRODUCTOS, INVSALDO y PRECIOS; luego índices únicos.
 */
async function corregirProductosYPrecios(pool, empnit) {
  const empnitTrim = String(empnit || '').trim();
  if (!empnitTrim) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }

  const productosEliminados = await deduplicateProductos(pool, empnitTrim);
  const inv = await deduplicateInvSaldo(pool, empnitTrim);
  const preciosEliminados = await deduplicatePrecios(pool, empnitTrim);

  // Limpieza global para poder crear índices únicos a nivel tabla
  await deduplicateProductos(pool, null);
  await deduplicatePrecios(pool, null);
  const empRows = await pool.request().query(`
    SELECT DISTINCT LTRIM(RTRIM(EMPNIT)) AS EMPNIT
    FROM dbo.INVSALDO
    WHERE EMPNIT IS NOT NULL AND LTRIM(RTRIM(EMPNIT)) <> ''
  `);
  for (const row of empRows.recordset || []) {
    const e = String(row.EMPNIT || '').trim();
    if (!e || e === empnitTrim) continue;
    try {
      await deduplicateInvSaldo(pool, e);
    } catch (err) {
      console.warn('[correccion-productos] invsaldo', e, err.message);
    }
  }

  const indexes = await ensureUniqueIndexes(pool);

  return {
    ok: true,
    empnit: empnitTrim,
    productos: { eliminados: productosEliminados },
    invsaldo: {
      eliminados: inv.eliminados ?? 0,
      bodegasNormalizadas: inv.bodegasNormalizadas ?? 0,
    },
    precios: { eliminados: preciosEliminados },
    indexes,
  };
}

module.exports = {
  INDEX_PRODUCTOS,
  INDEX_INVSALDO,
  INDEX_PRECIOS,
  deduplicateProductos,
  deduplicatePrecios,
  ensureUniqueIndexes,
  corregirProductosYPrecios,
};
