const sql = require('mssql');

const CODTIPO_EMPLEADO_VENDEDOR = 3;

async function findVendedorByClave(pool, empnit, clave) {
  const key = String(clave ?? '').trim();
  if (!key) return null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CLAVE', sql.VarChar, key)
    .input('CODTIPO', sql.Int, CODTIPO_EMPLEADO_VENDEDOR)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CLAVE = @CLAVE
        AND CODTIPOEMPLEADO = @CODTIPO AND ACTIVO = 'SI'
    `);
  return result.recordset[0] || null;
}

module.exports = {
  CODTIPO_EMPLEADO_VENDEDOR,
  findVendedorByClave,
};
