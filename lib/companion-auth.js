/**
 * Autenticación empleado (misma lógica que POST /api/auth/login) para control remoto.
 */
const sql = require('mssql');
const { isSuperUser, buildSuperUserSession } = require('./auth-login');
const { createRegToken, hasPasskey } = require('./webauthn');
const { getSettingSino, ensureSettingDefault, SETTING_OPCION } = require('./settings');
const { assertEmpnitAllowed } = require('./default-empnit');

async function ensurePasskeyColumn(pool) {
  await pool.request().query(`
    IF COL_LENGTH('dbo.Empleados', 'PASSKEY') IS NULL
      ALTER TABLE dbo.Empleados ADD PASSKEY NVARCHAR(MAX) NULL;
  `);
}

async function getPermiteBiometrico(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.PERMITE_BIOMETRICO_EN_LOGIN);
  return getSettingSino(pool, SETTING_OPCION.PERMITE_BIOMETRICO_EN_LOGIN);
}

async function loginWithCredentials(pool, { empnit, usuario, password, skipEmpnitAssert = false }) {
  const emp = String(empnit || '').trim();
  const user = String(usuario || '').trim();
  if (!emp) {
    const err = new Error('Empresa obligatoria');
    err.statusCode = 400;
    throw err;
  }
  if (!skipEmpnitAssert) {
    assertEmpnitAllowed(emp);
  }
  if (!user) {
    const err = new Error('Usuario obligatorio');
    err.statusCode = 400;
    throw err;
  }
  if (password === undefined || password === null || String(password) === '') {
    const err = new Error('Contraseña obligatoria');
    err.statusCode = 400;
    throw err;
  }

  await ensurePasskeyColumn(pool);
  const permiteBiometrico = await getPermiteBiometrico(pool);

  const empCheck = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .query(`
      SELECT TOP 1 EMPNIT FROM dbo.Empresas WHERE EMPNIT = @EMPNIT
    `);
  if (!empCheck.recordset.length) {
    const err = new Error('Empresa no válida');
    err.statusCode = 400;
    throw err;
  }

  if (isSuperUser(user, password)) {
    return {
      ok: true,
      user: buildSuperUserSession(),
      hasPasskey: false,
      permiteBiometrico,
      empnit: emp,
    };
  }

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, emp)
    .input('USUARIO', sql.VarChar(100), user)
    .query(`
      SELECT TOP 1 CODEMPLEADO, NOMEMPLEADO, USUARIO, CLAVE, EMAIL, CODTIPOEMPLEADO, PASSKEY
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
        AND ACTIVO = 'SI'
    `);

  if (!result.recordset.length) {
    const err = new Error('Usuario o contraseña incorrectos');
    err.statusCode = 401;
    throw err;
  }

  const row = result.recordset[0];
  if (String(row.CLAVE ?? '') !== String(password)) {
    const err = new Error('Usuario o contraseña incorrectos');
    err.statusCode = 401;
    throw err;
  }

  const employeeHasPasskey = hasPasskey(row.PASSKEY);
  const biometricOk = permiteBiometrico === 'SI';
  const webauthnRegToken = biometricOk
    ? createRegToken(emp, row.CODEMPLEADO, row.USUARIO)
    : null;

  return {
    ok: true,
    empnit: emp,
    permiteBiometrico,
    hasPasskey: employeeHasPasskey,
    ...(webauthnRegToken ? { webauthnRegToken } : {}),
    user: {
      codempleado: row.CODEMPLEADO,
      usuario: row.USUARIO,
      nomempleado: row.NOMEMPLEADO,
      codtipoempleado: row.CODTIPOEMPLEADO ?? null,
      superUser: false,
      email: row.EMAIL ?? '',
      hasPasskey: employeeHasPasskey,
    },
  };
}

const TIPO_EMPLEADO_ADMIN = 1;

function isAdministratorUser(user) {
  if (!user) return false;
  if (user.superUser) return true;
  return Number(user.codtipoempleado) === TIPO_EMPLEADO_ADMIN;
}

function companionSessionSummary(session) {
  if (!session) return null;
  const user = session.auth?.user;
  return {
    empNit: session.empNit,
    empNombre: session.empNombre,
    username: session.displayName,
    codtipoempleado: user?.codtipoempleado ?? null,
    superUser: Boolean(user?.superUser),
    isAdministrator: isAdministratorUser(user),
  };
}

module.exports = {
  loginWithCredentials,
  ensurePasskeyColumn,
  getPermiteBiometrico,
  isAdministratorUser,
  companionSessionSummary,
  TIPO_EMPLEADO_ADMIN,
};
