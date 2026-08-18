const sql = require('mssql');

function isBlankAcceso(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  if (!s) return true;
  if (/^null$/i.test(s) || /^undefined$/i.test(s)) return true;
  return false;
}

function normalizeUsuario(value) {
  return isBlankAcceso(value) ? '' : String(value).trim();
}

function normalizeClave(value) {
  return isBlankAcceso(value) ? '' : String(value).trim();
}

function tieneAccesoSistema(usuario, clave) {
  return Boolean(normalizeUsuario(usuario) && normalizeClave(clave));
}

/**
 * Busca otro empleado con la misma combinación USUARIO + CLAVE (global, todas las empresas).
 * USUARIO se compara sin distinguir mayúsculas; CLAVE exacta.
 * Sin usuario o sin clave (null/vacío) no hay acceso: no se valida duplicado.
 */
async function findAccesoDuplicado(pool, usuario, clave, exclude = {}) {
  const u = normalizeUsuario(usuario);
  const c = normalizeClave(clave);
  if (!tieneAccesoSistema(u, c)) return null;

  const request = pool
    .request()
    .input('USUARIO', sql.VarChar(100), u)
    .input('CLAVE', sql.VarChar, c);

  let sqlText = `
    SELECT TOP 1 EMPNIT, CODEMPLEADO, NOMEMPLEADO, USUARIO
    FROM dbo.Empleados
    WHERE NULLIF(LTRIM(RTRIM(USUARIO)), '') IS NOT NULL
      AND NULLIF(LTRIM(RTRIM(CAST(CLAVE AS NVARCHAR(400)))), '') IS NOT NULL
      AND UPPER(LTRIM(RTRIM(USUARIO))) <> 'NULL'
      AND UPPER(LTRIM(RTRIM(CAST(CLAVE AS NVARCHAR(400))))) <> 'NULL'
      AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
      AND LTRIM(RTRIM(CAST(CLAVE AS NVARCHAR(400)))) = LTRIM(RTRIM(@CLAVE))
  `;

  const exEmp = String(exclude.empnit ?? exclude.EMPNIT ?? '').trim();
  const exCod = exclude.codempleado ?? exclude.CODEMPLEADO;
  if (exEmp && exCod !== null && exCod !== undefined && exCod !== '') {
    request.input('EX_EMPNIT', sql.VarChar, exEmp);
    request.input('EX_CODEMPLEADO', sql.Int, Number(exCod));
    sqlText += `
      AND NOT (EMPNIT = @EX_EMPNIT AND CODEMPLEADO = @EX_CODEMPLEADO)
    `;
  }

  const result = await request.query(sqlText);
  return result.recordset[0] || null;
}

async function assertAccesoUnico(pool, usuario, clave, exclude) {
  if (!tieneAccesoSistema(usuario, clave)) return;
  const dup = await findAccesoDuplicado(pool, usuario, clave, exclude);
  if (!dup) return;

  const err = new Error(
    'Ya existe un empleado con la misma combinación de usuario y clave (en esta u otra empresa)'
  );
  err.statusCode = 400;
  throw err;
}

module.exports = {
  isBlankAcceso,
  normalizeUsuario,
  normalizeClave,
  tieneAccesoSistema,
  findAccesoDuplicado,
  assertAccesoUnico,
};
