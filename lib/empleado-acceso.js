const sql = require('mssql');

function normalizeUsuario(value) {
  return String(value ?? '').trim();
}

function normalizeClave(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function tieneAccesoSistema(usuario, clave) {
  return Boolean(normalizeUsuario(usuario) && normalizeClave(clave));
}

/**
 * Busca otro empleado con la misma combinación USUARIO + CLAVE (global, todas las empresas).
 * USUARIO se compara sin distinguir mayúsculas; CLAVE exacta.
 * Sin usuario o sin clave no hay acceso: no se valida duplicado.
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
    WHERE UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
      AND CLAVE = @CLAVE
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
  const dup = await findAccesoDuplicado(pool, usuario, clave, exclude);
  if (!dup) return;

  const err = new Error(
    'Ya existe un empleado con la misma combinación de usuario y clave (en esta u otra empresa)'
  );
  err.statusCode = 400;
  throw err;
}

module.exports = {
  normalizeUsuario,
  normalizeClave,
  tieneAccesoSistema,
  findAccesoDuplicado,
  assertAccesoUnico,
};
