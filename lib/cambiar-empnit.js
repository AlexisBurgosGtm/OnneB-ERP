const sql = require('mssql');

/**
 * Lista tablas base (no vistas) que tienen columna EMPNIT.
 * Se consulta dinámicamente para incluir tablas nuevas automáticamente.
 */
async function listEmpnitTables(pool) {
  const result = await pool.request().query(`
    SELECT
      c.TABLE_SCHEMA AS tableSchema,
      c.TABLE_NAME AS tableName
    FROM INFORMATION_SCHEMA.COLUMNS c
    INNER JOIN INFORMATION_SCHEMA.TABLES t
      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
     AND t.TABLE_NAME = c.TABLE_NAME
    WHERE UPPER(c.COLUMN_NAME) = 'EMPNIT'
      AND t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY
      CASE WHEN c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME = 'Empresas' THEN 0 ELSE 1 END,
      c.TABLE_SCHEMA,
      c.TABLE_NAME
  `);
  return (result.recordset || []).map((r) => ({
    schema: String(r.tableSchema || '').trim(),
    name: String(r.tableName || '').trim(),
  })).filter((t) => t.schema && t.name);
}

async function setEmpnitForeignKeys(pool, enabled) {
  const action = enabled ? 'WITH CHECK CHECK CONSTRAINT' : 'NOCHECK CONSTRAINT';
  const result = await pool.request().query(`
    SELECT DISTINCT
      OBJECT_SCHEMA_NAME(fk.parent_object_id) AS schemaName,
      OBJECT_NAME(fk.parent_object_id) AS tableName,
      fk.name AS fkName
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns pc
      ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    INNER JOIN sys.columns rc
      ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE UPPER(pc.name) = 'EMPNIT' OR UPPER(rc.name) = 'EMPNIT'
    ORDER BY schemaName, tableName, fkName
  `);

  for (const row of result.recordset || []) {
    const schema = String(row.schemaName || '').trim();
    const tableName = String(row.tableName || '').trim();
    const fkName = String(row.fkName || '').trim();
    if (!schema || !tableName || !fkName) continue;
    const ddl = `ALTER TABLE ${quotename(schema)}.${quotename(tableName)} ${action} ${quotename(fkName)}`;
    try {
      await pool.request().query(ddl);
    } catch (err) {
      console.warn(
        `[cambiar-empnit] FK ${enabled ? 'enable' : 'disable'} ${schema}.${tableName}.${fkName}:`,
        err.message
      );
    }
  }
}

function quotename(ident) {
  return `[${String(ident).replace(/]/g, ']]')}]`;
}

async function assertEmpnitChangeAllowed(pool, fromEmpnit, toEmpnit) {
  const from = String(fromEmpnit ?? '').trim();
  const to = String(toEmpnit ?? '').trim();
  if (!from) {
    const err = new Error('EMPNIT actual es obligatorio');
    err.statusCode = 400;
    throw err;
  }
  if (!to) {
    const err = new Error('EMPNIT nuevo es obligatorio');
    err.statusCode = 400;
    throw err;
  }
  if (from.toUpperCase() === to.toUpperCase()) {
    const err = new Error('El EMPNIT nuevo debe ser distinto al actual');
    err.statusCode = 400;
    throw err;
  }

  const existsFrom = await pool
    .request()
    .input('EMPNIT', sql.VarChar, from)
    .query(`SELECT TOP 1 1 AS ok FROM dbo.Empresas WHERE EMPNIT = @EMPNIT`);
  if (!existsFrom.recordset.length) {
    const err = new Error(`Empresa no encontrada: ${from}`);
    err.statusCode = 404;
    throw err;
  }

  const existsTo = await pool
    .request()
    .input('EMPNIT', sql.VarChar, to)
    .query(`SELECT TOP 1 1 AS ok FROM dbo.Empresas WHERE EMPNIT = @EMPNIT`);
  if (existsTo.recordset.length) {
    const err = new Error(`Ya existe una empresa con EMPNIT ${to}`);
    err.statusCode = 409;
    throw err;
  }

  return { from, to };
}

/**
 * Actualiza EMPNIT en una tabla. Retorna filas afectadas.
 */
async function updateEmpnitInTable(pool, schema, tableName, fromEmpnit, toEmpnit) {
  const sqlText = `
    UPDATE ${quotename(schema)}.${quotename(tableName)}
    SET EMPNIT = @EMPNIT_NUEVO
    WHERE EMPNIT = @EMPNIT_ACTUAL
  `;
  const result = await pool
    .request()
    .input('EMPNIT_ACTUAL', sql.VarChar, fromEmpnit)
    .input('EMPNIT_NUEVO', sql.VarChar, toEmpnit)
    .query(sqlText);
  const affected = Array.isArray(result.rowsAffected)
    ? result.rowsAffected.reduce((a, b) => a + Number(b || 0), 0)
    : Number(result.rowsAffected || 0);
  return affected;
}

/**
 * Recorre todas las tablas con EMPNIT y aplica el cambio.
 * @param {(evt: object) => void} [onProgress]
 */
async function cambiarEmpnitEnTodasLasTablas(pool, fromEmpnit, toEmpnit, onProgress) {
  const { from, to } = await assertEmpnitChangeAllowed(pool, fromEmpnit, toEmpnit);
  const tables = await listEmpnitTables(pool);
  if (!tables.length) {
    const err = new Error('No se encontraron tablas con columna EMPNIT');
    err.statusCode = 500;
    throw err;
  }

  const emit = (evt) => {
    if (typeof onProgress === 'function') onProgress(evt);
  };

  emit({ type: 'start', total: tables.length, from, to });
  emit({ type: 'status', message: 'Deshabilitando restricciones de integridad…' });
  await setEmpnitForeignKeys(pool, false);

  const results = [];
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
        const rowsAffected = await updateEmpnitInTable(pool, table.schema, table.name, from, to);
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
    from,
    to,
    total: tables.length,
    okCount,
    failCount,
    results,
  };
  emit(summary);
  return summary;
}

module.exports = {
  listEmpnitTables,
  assertEmpnitChangeAllowed,
  updateEmpnitInTable,
  cambiarEmpnitEnTodasLasTablas,
  setEmpnitForeignKeys,
};
