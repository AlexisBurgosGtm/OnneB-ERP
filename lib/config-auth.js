const sql = require('mssql');

const ADMIN_CONFIG_ID = 2;

async function verifyAdminPass(pool, pass, configId = ADMIN_CONFIG_ID) {
  const result = await pool
    .request()
    .input('ID', sql.Int, configId)
    .query('SELECT PASS FROM Config WHERE ID = @ID');
  if (!result.recordset.length) return false;
  return String(pass ?? '') === String(result.recordset[0].PASS ?? '');
}

async function assertAdminPass(pool, pass, configId = ADMIN_CONFIG_ID) {
  const ok = await verifyAdminPass(pool, pass, configId);
  if (!ok) {
    const err = new Error('Clave de administrador incorrecta');
    err.statusCode = 401;
    throw err;
  }
}

module.exports = {
  ADMIN_CONFIG_ID,
  verifyAdminPass,
  assertAdminPass,
};
