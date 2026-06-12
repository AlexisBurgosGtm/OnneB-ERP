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
    .input('CODPROD', sql.VarChar, codprod)
    .query(`
      SELECT TOP 1 1 AS ok
      FROM dbo.INVSALDO
      WHERE EMPNIT = @EMPNIT AND CODPROD = @CODPROD
    `);
  if (exists.recordset.length) return false;

  await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPROD', sql.VarChar, codprod)
    .input('CODBODEGA', sql.Int, DEFAULT_CODBODEGA)
    .input('SALDO', sql.Float, Number(saldo) || 0)
    .query(`
      INSERT INTO dbo.INVSALDO (EMPNIT, CODPROD, CODBODEGA, SALDO)
      VALUES (@EMPNIT, @CODPROD, @CODBODEGA, @SALDO)
    `);
  return true;
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

module.exports = {
  DEFAULT_CODBODEGA,
  countMissingInvSaldo,
  ensureInvSaldoForProduct,
  syncMissingInvSaldo,
};
