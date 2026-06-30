const sql = require('mssql');

async function vehiculoTieneMovimientos(pool, empnit, codvehiculo) {
  const cod = parseInt(codvehiculo, 10);
  if (Number.isNaN(cod)) return true;
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODVEHICULO', sql.Int, cod);
  const km = await request.query(`
    SELECT COUNT(*) AS TOTAL
    FROM dbo.VEHICULOS_KILOMETRAJES
    WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
  `);
  if (Number(km.recordset[0]?.TOTAL || 0) > 0) return true;
  const mec = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODVEHICULO', sql.Int, cod)
    .query(`
      SELECT COUNT(*) AS TOTAL
      FROM dbo.VEHICULOS_MECANICA
      WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
    `);
  return Number(mec.recordset[0]?.TOTAL || 0) > 0;
}

async function plataformaTieneMovimientos(pool, empnit, codplataforma) {
  const cod = parseInt(codplataforma, 10);
  if (Number.isNaN(cod)) return true;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODPLATAFORMA', sql.Int, cod)
    .query(`
      SELECT COUNT(*) AS TOTAL
      FROM dbo.VEHICULOS_KILOMETRAJES
      WHERE EMPNIT = @EMPNIT AND CODPLATAFORMA = @CODPLATAFORMA
    `);
  return Number(result.recordset[0]?.TOTAL || 0) > 0;
}

module.exports = {
  vehiculoTieneMovimientos,
  plataformaTieneMovimientos,
};
