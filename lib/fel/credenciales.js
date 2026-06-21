const sql = require('mssql');

async function loadFelCredenciales(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT TOP 1 *
      FROM dbo.FEL_CREDENCIALES
      WHERE EMPNIT = @EMPNIT
    `);
  const row = result.recordset[0];
  if (!row) {
    const err = new Error('No hay credenciales FEL configuradas para esta empresa');
    err.statusCode = 400;
    throw err;
  }
  if (!row.CERTIFICACION_USUARIO || !row.CERTIFICACION_LLAVE) {
    const err = new Error('Credenciales FEL incompletas (usuario o llave de certificación)');
    err.statusCode = 400;
    throw err;
  }
  if (!row.FIRMA_ALIAS || !row.FIRMA_LLAVE) {
    const err = new Error('Credenciales FEL incompletas (alias o llave de firma)');
    err.statusCode = 400;
    throw err;
  }
  if (!row.EMISOR_NIT) {
    const err = new Error('Credenciales FEL incompletas (NIT emisor)');
    err.statusCode = 400;
    throw err;
  }
  return row;
}

module.exports = { loadFelCredenciales };
