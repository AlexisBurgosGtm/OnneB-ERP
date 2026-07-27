const sql = require('mssql');
const { listEmpnitTables, setEmpnitForeignKeys } = require('./cambiar-empnit');

function quotename(ident) {
  return `[${String(ident).replace(/]/g, ']]')}]`;
}

function normalizeEmpnit(empnit) {
  return String(empnit ?? '').trim();
}

function sortTablesForDelete(tables) {
  return [...tables].sort((a, b) => {
    const aEmp = a.schema === 'dbo' && a.name === 'Empresas';
    const bEmp = b.schema === 'dbo' && b.name === 'Empresas';
    if (aEmp && !bEmp) return 1;
    if (!aEmp && bEmp) return -1;
    const ak = `${a.schema}.${a.name}`;
    const bk = `${b.schema}.${b.name}`;
    return ak.localeCompare(bk);
  });
}

async function assertEmpresaExists(pool, empnit) {
  const key = normalizeEmpnit(empnit);
  if (!key) {
    const err = new Error('EMPNIT es obligatorio');
    err.statusCode = 400;
    throw err;
  }
  const exists = await pool
    .request()
    .input('EMPNIT', sql.VarChar, key)
    .query(`SELECT TOP 1 1 AS ok FROM dbo.Empresas WHERE EMPNIT = @EMPNIT`);
  if (!exists.recordset.length) {
    const err = new Error(`Empresa no encontrada: ${key}`);
    err.statusCode = 404;
    throw err;
  }
  return key;
}

async function countEmpnitInTable(pool, schema, tableName, empnit) {
  const sqlText = `
    SELECT COUNT_BIG(1) AS cnt
    FROM ${quotename(schema)}.${quotename(tableName)}
    WHERE EMPNIT = @EMPNIT
  `;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(sqlText);
  const raw = result.recordset?.[0]?.cnt;
  return Number(raw || 0);
}

async function deleteEmpnitFromTable(pool, schema, tableName, empnit) {
  const sqlText = `
    DELETE FROM ${quotename(schema)}.${quotename(tableName)}
    WHERE EMPNIT = @EMPNIT
  `;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(sqlText);
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((a, b) => a + Number(b || 0), 0)
    : Number(result.rowsAffected || 0);
  return affected;
}

/**
 * Cuenta registros por tabla con columna EMPNIT (stream de progreso).
 * @param {(evt: object) => void} [onProgress]
 */
async function scanEmpnitDataSummary(pool, empnit, onProgress) {
  const key = normalizeEmpnit(empnit);
  if (!key) {
    const err = new Error('EMPNIT es obligatorio');
    err.statusCode = 400;
    throw err;
  }

  const tables = await listEmpnitTables(pool);
  if (!tables.length) {
    const err = new Error('No se encontraron tablas con columna EMPNIT');
    err.statusCode = 500;
    throw err;
  }

  const emit = (evt) => {
    if (typeof onProgress === 'function') onProgress(evt);
  };

  emit({ type: 'start', empnit: key, total: tables.length });
  const items = [];
  let totalRecords = 0;

  for (let i = 0; i < tables.length; i += 1) {
    const table = tables[i];
    const fullName = `${table.schema}.${table.name}`;
    emit({
      type: 'table-start',
      index: i + 1,
      total: tables.length,
      table: fullName,
      schema: table.schema,
      name: table.name,
    });
    try {
      const count = await countEmpnitInTable(pool, table.schema, table.name, key);
      totalRecords += count;
      const item = {
        schema: table.schema,
        name: table.name,
        table: fullName,
        count,
        ok: true,
      };
      items.push(item);
      emit({ type: 'table-count', index: i + 1, total: tables.length, ...item });
    } catch (err) {
      const item = {
        schema: table.schema,
        name: table.name,
        table: fullName,
        count: 0,
        ok: false,
        error: err.message || String(err),
      };
      items.push(item);
      emit({ type: 'table-count', index: i + 1, total: tables.length, ...item });
    }
  }

  const summary = {
    type: 'done',
    empnit: key,
    total: tables.length,
    totalRecords,
    tables: items,
  };
  emit(summary);
  return summary;
}

/**
 * Elimina registros de una tabla o de todas (Empresas al final).
 * @param {{ all?: boolean, schema?: string, name?: string }} options
 * @param {(evt: object) => void} [onProgress]
 */
async function deleteEmpnitData(pool, empnit, options = {}, onProgress) {
  const key = normalizeEmpnit(empnit);
  if (!key) {
    const err = new Error('EMPNIT es obligatorio');
    err.statusCode = 400;
    throw err;
  }

  const all = Boolean(options.all);
  const targetSchema = String(options.schema || '').trim();
  const targetName = String(options.name || '').trim();

  if (!all && (!targetSchema || !targetName)) {
    const err = new Error('Indique tabla o elimine todo');
    err.statusCode = 400;
    throw err;
  }

  let tables = await listEmpnitTables(pool);
  if (!tables.length) {
    const err = new Error('No se encontraron tablas con columna EMPNIT');
    err.statusCode = 500;
    throw err;
  }

  if (!all) {
    tables = tables.filter((t) => t.schema === targetSchema && t.name === targetName);
    if (!tables.length) {
      const err = new Error(`Tabla no encontrada: ${targetSchema}.${targetName}`);
      err.statusCode = 404;
      throw err;
    }
  } else {
    tables = sortTablesForDelete(tables);
  }

  const emit = (evt) => {
    if (typeof onProgress === 'function') onProgress(evt);
  };

  emit({ type: 'start', empnit: key, total: tables.length, all });
  emit({ type: 'status', message: 'Deshabilitando restricciones de integridad…' });
  await setEmpnitForeignKeys(pool, false);

  const results = [];
  let empresaEliminada = false;

  try {
    for (let i = 0; i < tables.length; i += 1) {
      const table = tables[i];
      const fullName = `${table.schema}.${table.name}`;
      emit({
        type: 'table-start',
        index: i + 1,
        total: tables.length,
        table: fullName,
        schema: table.schema,
        name: table.name,
      });
      try {
        const rowsAffected = await deleteEmpnitFromTable(pool, table.schema, table.name, key);
        if (table.schema === 'dbo' && table.name === 'Empresas' && rowsAffected > 0) {
          empresaEliminada = true;
        }
        const item = {
          schema: table.schema,
          name: table.name,
          table: fullName,
          rowsAffected,
          ok: true,
        };
        results.push(item);
        emit({ type: 'table-done', index: i + 1, total: tables.length, ...item });
      } catch (err) {
        const item = {
          schema: table.schema,
          name: table.name,
          table: fullName,
          rowsAffected: 0,
          ok: false,
          error: err.message || String(err),
        };
        results.push(item);
        emit({ type: 'table-done', index: i + 1, total: tables.length, ...item });
      }
    }
  } finally {
    emit({ type: 'status', message: 'Restaurando restricciones de integridad…' });
    await setEmpnitForeignKeys(pool, true);
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  const summary = {
    type: 'done',
    empnit: key,
    all,
    total: tables.length,
    okCount,
    failCount,
    empresaEliminada,
    results,
  };
  emit(summary);
  return summary;
}

module.exports = {
  scanEmpnitDataSummary,
  deleteEmpnitData,
  countEmpnitInTable,
  deleteEmpnitFromTable,
  assertEmpresaExists,
};
