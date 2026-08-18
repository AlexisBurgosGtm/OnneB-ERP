const express = require('express');
const sql = require('mssql');
const { isDbConfigured } = require('../config/database');
const { isSuperUser, buildSuperUserSession } = require('../lib/auth-login');
const {
  createRegToken,
  hasPasskey,
  beginRegistration,
  finishRegistration,
  beginAuthentication,
  finishAuthentication,
} = require('../lib/webauthn');
const { getSettingSino, ensureSettingDefault, SETTING_OPCION } = require('../lib/settings');
const { assertEmpnitAllowed } = require('../lib/default-empnit');

const router = express.Router();

let passkeyColumnEnsured = false;

async function ensurePasskeyColumn(pool) {
  if (passkeyColumnEnsured) return;
  await pool.request().query(`
    IF COL_LENGTH('dbo.Empleados', 'PASSKEY') IS NULL
      ALTER TABLE dbo.Empleados ADD PASSKEY NVARCHAR(MAX) NULL;
  `);
  passkeyColumnEnsured = true;
}

async function getPermiteBiometrico(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.PERMITE_BIOMETRICO_EN_LOGIN);
  return getSettingSino(pool, SETTING_OPCION.PERMITE_BIOMETRICO_EN_LOGIN);
}

async function assertBiometricoPermitido(pool) {
  const permite = await getPermiteBiometrico(pool);
  if (permite !== 'SI') {
    const err = new Error('El acceso biométrico / passkey está deshabilitado en la configuración');
    err.statusCode = 403;
    throw err;
  }
  return permite;
}

/** Público: indica si el login debe ofrecer huella / passkey. */
router.get('/biometric-config', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.json({ permiteBiometrico: 'NO' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const permiteBiometrico = await getPermiteBiometrico(pool);
    res.json({ permiteBiometrico });
  } catch (err) {
    console.warn('[API GET /auth/biometric-config]', err.message);
    res.json({ permiteBiometrico: 'NO' });
  }
});

router.post('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }

  const empnit = String(req.body?.empnit || req.body?.EMPNIT || '').trim();
  const usuario = String(req.body?.usuario || '').trim();
  const password = req.body?.password;

  if (!empnit) {
    return res.status(400).json({ error: 'Empresa obligatoria' });
  }
  try {
    assertEmpnitAllowed(empnit);
  } catch (err) {
    return res.status(err.statusCode || 403).json({ error: err.message });
  }
  if (!usuario) {
    return res.status(400).json({ error: 'Usuario obligatorio' });
  }
  if (password === undefined || password === null || String(password) === '') {
    return res.status(400).json({ error: 'Contraseña obligatoria' });
  }

  try {
    const pool = await req.app.locals.getDbPool();
    await ensurePasskeyColumn(pool);
    const permiteBiometrico = await getPermiteBiometrico(pool);

    const empCheck = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        SELECT TOP 1 EMPNIT
        FROM dbo.Empresas
        WHERE EMPNIT = @EMPNIT
      `);
    if (!empCheck.recordset.length) {
      return res.status(400).json({ error: 'Empresa no válida' });
    }

    if (isSuperUser(usuario, password)) {
      return res.json({
        ok: true,
        user: buildSuperUserSession(),
        hasPasskey: false,
        permiteBiometrico,
      });
    }

    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('USUARIO', sql.VarChar(100), usuario)
      .query(`
        SELECT TOP 1 CODEMPLEADO, NOMEMPLEADO, USUARIO, CLAVE, EMAIL, CODTIPOEMPLEADO, PASSKEY
        FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT
          AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
          AND ACTIVO = 'SI'
      `);

    if (!result.recordset.length) {
      const inactivo = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('USUARIO', sql.VarChar(100), usuario)
        .input('CLAVE', sql.VarChar, String(password))
        .query(`
          SELECT TOP 1 CODEMPLEADO
          FROM dbo.Empleados
          WHERE EMPNIT = @EMPNIT
            AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
            AND CLAVE = @CLAVE
            AND ISNULL(ACTIVO, 'NO') <> 'SI'
        `);
      if (inactivo.recordset.length) {
        return res.status(403).json({ error: 'El empleado no está activo. Contacte al administrador.' });
      }
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const row = result.recordset[0];
    const stored = String(row.CLAVE ?? '');
    if (stored !== String(password)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const employeeHasPasskey = hasPasskey(row.PASSKEY);
    const biometricOk = permiteBiometrico === 'SI';
    const webauthnRegToken = biometricOk
      ? createRegToken(empnit, row.CODEMPLEADO, row.USUARIO)
      : null;

    res.json({
      ok: true,
      empnit,
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
    });
  } catch (err) {
    console.warn('[API POST /auth/login]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/webauthn/register-options', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = String(req.body?.empnit || '').trim();
  const usuario = String(req.body?.usuario || '').trim();
  const codempleado = parseInt(req.body?.codempleado, 10);
  const regToken = String(req.body?.regToken || '').trim();
  if (!empnit || !usuario || !Number.isFinite(codempleado) || !regToken) {
    return res.status(400).json({ error: 'Datos de registro incompletos' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    await assertBiometricoPermitido(pool);
    await ensurePasskeyColumn(pool);
    const result = await beginRegistration(pool, req, {
      empnit,
      codempleado,
      usuario,
      regToken,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /auth/webauthn/register-options]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/webauthn/register-verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    await assertBiometricoPermitido(pool);
    await ensurePasskeyColumn(pool);
    const result = await finishRegistration(pool, req, {
      challengeId: req.body?.challengeId,
      regToken: req.body?.regToken,
      response: req.body?.response,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /auth/webauthn/register-verify]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/webauthn/login-options', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = String(req.body?.empnit || '').trim();
  const usuario = String(req.body?.usuario || '').trim();
  if (!empnit) {
    return res.status(400).json({ error: 'Empresa es obligatoria' });
  }
  try {
    assertEmpnitAllowed(empnit);
    const pool = await req.app.locals.getDbPool();
    await assertBiometricoPermitido(pool);
    await ensurePasskeyColumn(pool);
    const result = await beginAuthentication(pool, req, { empnit, usuario });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /auth/webauthn/login-options]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/webauthn/login-verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  try {
    const pool = await req.app.locals.getDbPool();
    await assertBiometricoPermitido(pool);
    await ensurePasskeyColumn(pool);
    const result = await finishAuthentication(pool, req, {
      challengeId: req.body?.challengeId,
      response: req.body?.response,
    });
    res.json(result);
  } catch (err) {
    console.warn('[API POST /auth/webauthn/login-verify]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
