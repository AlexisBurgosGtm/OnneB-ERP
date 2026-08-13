const sql = require('mssql');

const DEFAULT_CODBODEGA = 0;

const MISSING_INVSALDO_SQL = `
  FROM dbo.PRODUCTOS p
  WHERE p.EMPNIT = @EMPNIT
    AND NOT EXISTS (
      SELECT 1 FROM dbo.INVSALDO i
      WHERE i.EMPNIT = p.EMPNIT AND i.CODPROD = p.CODPROD
    )
`;

/**
 * Productos sin ningún registro en INVSALDO para la empresa.
 * @param {import('mssql').ConnectionPool|import('mssql').Transaction} db
 */
async function countMissingInvSaldo(db, empnit) {
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`SELECT COUNT(*) AS total ${MISSING_INVSALDO_SQL}`);
  return result.recordset[0]?.total ?? 0;
}

/**
 * Crea fila INVSALDO (bodega 0) si no existe para el producto.
 * @returns {boolean} true si insertó
 */
async function ensureInvSaldoForProduct(db, empnit, codprod, saldo = 0) {
  const exists = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, String(codprod || '').trim())
    .query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.INVSALDO
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(CODPROD)) = LTRIM(RTRIM(@CODPROD))
    `);
  if (exists.recordset.length) return false;

  await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, String(codprod || '').trim())
    .input('CODBODEGA', sql.Int, DEFAULT_CODBODEGA)
    .input('SALDO', sql.Float, Number(saldo) || 0)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO)
      VALUES (@EMPNIT, @CODPROD, @CODBODEGA, @SALDO)
    `);
  return true;
}

/**
 * Inserta INVSALDO (bodega 0, SALDO=0) para productos sin registro.
 * @returns {number} registros creados
 */
async function syncMissingInvSaldoZero(db, empnit) {
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO)
      SELECT p.EMPNIT, p.CODPROD, ${DEFAULT_CODBODEGA}, 0
      ${MISSING_INVSALDO_SQL}
    `);
  return result.rowsAffected[0] ?? 0;
}

/**
 * Elimina INVSALDO de productos que ya no existen en PRODUCTOS.
 * @returns {number} filas eliminadas
 */
async function deleteOrphanInvSaldo(db, empnit) {
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      DELETE i
      FROM dbo.INVSALDO i
      WHERE i.EMPNIT = @EMPNIT
        AND NOT EXISTS (
          SELECT 1
          FROM dbo.PRODUCTOS p
          WHERE p.EMPNIT = i.EMPNIT
            AND LTRIM(RTRIM(p.CODPROD)) = LTRIM(RTRIM(i.CODPROD))
        )
    `);
  return result.rowsAffected[0] ?? 0;
}

/**
 * Inserta INVSALDO para productos existentes sin registro (SALDO = EXISTENCIA del producto).
 * @returns {number} registros creados
 */
async function syncMissingInvSaldo(db, empnit) {
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO)
      SELECT p.EMPNIT, p.CODPROD, ${DEFAULT_CODBODEGA}, ISNULL(p.EXISTENCIA, 0)
      ${MISSING_INVSALDO_SQL}
    `);
  return result.rowsAffected[0] ?? 0;
}

/**
 * Deja un solo registro INVSALDO por producto/empresa (bodega irrelevante).
 * Conserva el registro principal (bodega 0, luego menor ID) y elimina el resto.
 * @returns {{ eliminados: number, bodegasNormalizadas: number }}
 */
async function deduplicateInvSaldo(db, empnit) {
  const empnitTrim = String(empnit || '').trim();
  if (!empnitTrim) throw new Error('EMPNIT requerido');

  const normReq = db.request().input('EMPNIT', sql.VarChar, empnitTrim);
  const norm = await normReq.query(`
    UPDATE dbo.INVSALDO
    SET CODBODEGA = ${DEFAULT_CODBODEGA}
    WHERE EMPNIT = @EMPNIT
      AND ISNULL(CODBODEGA, -1) <> ${DEFAULT_CODBODEGA}
  `);

  const delReq = db.request().input('EMPNIT', sql.VarChar, empnitTrim);
  const del = await delReq.query(`
    ;WITH Ranked AS (
      SELECT
        ID,
        ROW_NUMBER() OVER (
          PARTITION BY EMPNIT, LTRIM(RTRIM(CODPROD))
          ORDER BY CASE WHEN ISNULL(CODBODEGA, 0) = ${DEFAULT_CODBODEGA} THEN 0 ELSE 1 END, ID
        ) AS RN
      FROM dbo.INVSALDO
      WHERE EMPNIT = @EMPNIT
    )
    DELETE i
    FROM dbo.INVSALDO i
    INNER JOIN Ranked r ON r.ID = i.ID
    WHERE r.RN > 1
  `);

  return {
    eliminados: del.rowsAffected[0] ?? 0,
    bodegasNormalizadas: norm.rowsAffected[0] ?? 0,
  };
}

/**
 * Cuenta filas INVSALDO sobrantes (más de una por producto).
 */
async function countDuplicateInvSaldo(db, empnit) {
  const result = await db
    .request()
    .input('EMPNIT', sql.VarChar, String(empnit || '').trim())
    .query(`
      SELECT ISNULL(SUM(cnt - 1), 0) AS duplicados
      FROM (
        SELECT COUNT(*) AS cnt
        FROM dbo.INVSALDO
        WHERE EMPNIT = @EMPNIT
        GROUP BY LTRIM(RTRIM(CODPROD))
        HAVING COUNT(*) > 1
      ) d
    `);
  return result.recordset[0]?.duplicados ?? 0;
}

module.exports = {
  DEFAULT_CODBODEGA,
  countMissingInvSaldo,
  countDuplicateInvSaldo,
  ensureInvSaldoForProduct,
  syncMissingInvSaldo,
  syncMissingInvSaldoZero,
  deleteOrphanInvSaldo,
  deduplicateInvSaldo,
};
