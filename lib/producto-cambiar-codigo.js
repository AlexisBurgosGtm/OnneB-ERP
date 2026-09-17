/**
 * Renombra CODPROD en la sucursal (EMPNIT) en todas las tablas que lo guardan.
 */
const sql = require('mssql');

const CORE_TABLES = ['PRECIOS', 'INVSALDO', 'DOCPRODUCTOS', 'PRODUCTOS'];
const OPTIONAL_TABLES = [
  'DOCUMENTOS_SUSCRIPCIONES',
  'COMMUNITY_PRODUCTOS',
  'COMMUNITY_PRECIOS',
  'COMMUNITY_DOCPRODUCTOS',
];

async function tableExists(transaction, tableName) {
  const result = await new sql.Request(transaction)
    .input('name', sql.NVarChar, `dbo.${tableName}`)
    .query(`SELECT OBJECT_ID(@name, N'U') AS oid`);
  return result.recordset[0]?.oid != null;
}

async function updateCodprod(transaction, tableName, empnit, oldCode, newCode) {
  const result = await new sql.Request(transaction)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('OLD', sql.VarChar, oldCode)
    .input('NEW', sql.VarChar, newCode)
    .query(`
      UPDATE dbo.[${tableName}]
      SET CODPROD = @NEW
      WHERE EMPNIT = @EMPNIT
        AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@OLD))
    `);
  return Number(result.rowsAffected?.[0]) || 0;
}

/**
 * @returns {Promise<{ ok: true, codprodAnterior: string, codprodNuevo: string, updates: object }>}
 */
async function cambiarCodigoProducto(pool, empnit, codprodActual, codprodNuevo) {
  const oldCode = String(codprodActual || '').trim();
  const newCode = String(codprodNuevo || '').trim();
  if (!oldCode) {
    const err = new Error('Código actual inválido');
    err.statusCode = 400;
    throw err;
  }
  if (!newCode) {
    const err = new Error('Ingrese el nuevo código de producto');
    err.statusCode = 400;
    throw err;
  }
  if (newCode.length > 50) {
    const err = new Error('El nuevo código no puede superar 50 caracteres');
    err.statusCode = 400;
    throw err;
  }
  if (oldCode.toUpperCase() === newCode.toUpperCase()) {
    const err = new Error('El nuevo código es igual al actual');
    err.statusCode = 400;
    throw err;
  }

  const existsOld = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, oldCode)
    .query(`
      SELECT TOP 1 CODPROD
      FROM dbo.PRODUCTOS
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);
  if (!existsOld.recordset.length) {
    const err = new Error('Producto no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const existsNew = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, newCode)
    .query(`
      SELECT TOP 1 CODPROD
      FROM dbo.PRODUCTOS
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);
  if (existsNew.recordset.length) {
    const err = new Error(`Ya existe un producto con el código ${newCode}`);
    err.statusCode = 409;
    err.code = 'CODPROD_EXISTS';
    throw err;
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const updates = {};
  try {
    // Hijos primero, PRODUCTOS al final.
    for (const table of ['PRECIOS', 'INVSALDO', 'DOCPRODUCTOS']) {
      updates[table] = await updateCodprod(transaction, table, empnit, oldCode, newCode);
    }
    for (const table of OPTIONAL_TABLES) {
      if (await tableExists(transaction, table)) {
        updates[table] = await updateCodprod(transaction, table, empnit, oldCode, newCode);
      } else {
        updates[table] = 0;
      }
    }
    updates.PRODUCTOS = await updateCodprod(transaction, 'PRODUCTOS', empnit, oldCode, newCode);
    if (!updates.PRODUCTOS) {
      throw Object.assign(new Error('Producto no encontrado'), { statusCode: 404 });
    }
    await transaction.commit();
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (_) {
      /* ignore */
    }
    throw err;
  }

  return {
    ok: true,
    codprodAnterior: oldCode,
    codprodNuevo: newCode,
    updates,
    tables: [...CORE_TABLES, ...OPTIONAL_TABLES],
  };
}

module.exports = {
  cambiarCodigoProducto,
  CORE_TABLES,
  OPTIONAL_TABLES,
};
