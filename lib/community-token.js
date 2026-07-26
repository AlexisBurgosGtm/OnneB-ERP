/**
 * Validación de TOKEN en el host UPDATE_* (tabla dbo.TOKENS).
 */
const sql = require('mssql');

const TOKEN_NO_NUBE_MSG = 'Su TOKEN no tiene acceso a la nube';

/**
 * @param {import('mssql').ConnectionPool} hostPool
 * @param {string} token
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string }>}
 */
async function checkTokenActivo(hostPool, token) {
  const tokenVal = String(token || '').trim();
  if (!tokenVal) {
    return { ok: false, error: 'TOKEN no configurado en .env', code: 'TOKEN_MISSING' };
  }
  if (!hostPool) {
    return {
      ok: false,
      error: 'Base de datos de actualizaciones no configurada (UPDATE_* en .env)',
      code: 'UPDATE_DB',
    };
  }
  try {
    const result = await hostPool
      .request()
      .input('TOKEN', sql.VarChar, tokenVal)
      .query(`
        SELECT TOP 1
          UPPER(LTRIM(RTRIM(ISNULL(ACTIVO, 'NO')))) AS ACTIVO
        FROM dbo.TOKENS
        WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
      `);
    const row = result.recordset?.[0];
    if (!row || String(row.ACTIVO || '').trim().toUpperCase() !== 'SI') {
      return { ok: false, error: TOKEN_NO_NUBE_MSG, code: 'TOKEN_INACTIVE' };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Error al verificar TOKEN en el host',
      code: 'TOKEN_CHECK_ERROR',
    };
  }
}

module.exports = { checkTokenActivo, TOKEN_NO_NUBE_MSG };
