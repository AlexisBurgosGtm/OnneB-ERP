const crypto = require('crypto');
const sql = require('mssql');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

/** @type {Map<string, { type: string, challenge: string, empnit: string, codempleado: number, usuario: string, exp: number }>} */
const pendingChallenges = new Map();
/** @type {Map<string, { empnit: string, codempleado: number, usuario: string, exp: number }>} */
const regTokens = new Map();

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const REG_TOKEN_TTL_MS = 10 * 60 * 1000;

function cleanupMaps() {
  const now = Date.now();
  for (const [k, v] of pendingChallenges) {
    if (v.exp < now) pendingChallenges.delete(k);
  }
  for (const [k, v] of regTokens) {
    if (v.exp < now) regTokens.delete(k);
  }
}

function createRegToken(empnit, codempleado, usuario) {
  cleanupMaps();
  const token = crypto.randomBytes(24).toString('hex');
  regTokens.set(token, {
    empnit: String(empnit),
    codempleado: Number(codempleado),
    usuario: String(usuario),
    exp: Date.now() + REG_TOKEN_TTL_MS,
  });
  return token;
}

function consumeRegToken(token) {
  cleanupMaps();
  const key = String(token || '');
  const row = regTokens.get(key);
  if (!row) return null;
  regTokens.delete(key);
  return row;
}

function peekRegToken(token) {
  cleanupMaps();
  return regTokens.get(String(token || '')) || null;
}

function rpFromRequest(req) {
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostname = host.replace(/:\d+$/, '');
  const protoHeader = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto =
    protoHeader ||
    (req.secure || hostname === 'localhost' || hostname === '127.0.0.1' ? 'https' : 'http');
  // WebAuthn requiere HTTPS excepto localhost
  const origin = `${hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : proto}://${host}`;
  return {
    rpID: hostname === '127.0.0.1' ? 'localhost' : hostname,
    rpName: 'OnneB POS',
    origin,
  };
}

function parsePasskeyJson(raw) {
  if (!raw) return { credentials: [] };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed?.credentials)) return { credentials: parsed.credentials };
    if (parsed?.id && parsed?.publicKey) return { credentials: [parsed] };
    return { credentials: [] };
  } catch {
    return { credentials: [] };
  }
}

function hasPasskey(raw) {
  return parsePasskeyJson(raw).credentials.length > 0;
}

async function loadEmpleadoPasskey(pool, empnit, codempleado) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, codempleado)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO, USUARIO, EMAIL, CODTIPOEMPLEADO, PASSKEY
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO AND ACTIVO = 'SI'
    `);
  return result.recordset[0] || null;
}

async function loadEmpleadoByUsuario(pool, empnit, usuario) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('USUARIO', sql.VarChar(100), usuario)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO, USUARIO, EMAIL, CODTIPOEMPLEADO, PASSKEY
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(USUARIO))) = UPPER(LTRIM(RTRIM(@USUARIO)))
        AND ACTIVO = 'SI'
    `);
  return result.recordset[0] || null;
}

async function findEmpleadoByCredentialId(pool, empnit, credentialId) {
  const credId = String(credentialId || '').trim();
  if (!credId) return null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CRED', sql.NVarChar(512), credId)
    .query(`
      SELECT CODEMPLEADO, NOMEMPLEADO, USUARIO, EMAIL, CODTIPOEMPLEADO, PASSKEY
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT
        AND ACTIVO = 'SI'
        AND PASSKEY IS NOT NULL
        AND PASSKEY LIKE '%' + @CRED + '%'
    `);
  for (const row of result.recordset || []) {
    const creds = parsePasskeyJson(row.PASSKEY).credentials;
    if (creds.some((c) => c.id === credId)) return row;
  }
  return null;
}

async function saveEmpleadoPasskey(pool, empnit, codempleado, passkeyObj) {
  const json = JSON.stringify(passkeyObj);
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, codempleado)
    .input('PASSKEY', sql.NVarChar(sql.MAX), json)
    .query(`
      UPDATE dbo.Empleados
      SET PASSKEY = @PASSKEY
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
    `);
}

function toAuthSessionUser(row) {
  return {
    codempleado: row.CODEMPLEADO,
    usuario: row.USUARIO,
    nomempleado: row.NOMEMPLEADO,
    codtipoempleado: row.CODTIPOEMPLEADO ?? null,
    superUser: false,
    email: row.EMAIL ?? '',
    hasPasskey: hasPasskey(row.PASSKEY),
  };
}

async function beginRegistration(pool, req, { empnit, codempleado, usuario, regToken }) {
  const tokenData = peekRegToken(regToken);
  if (
    !tokenData ||
    tokenData.empnit !== String(empnit) ||
    Number(tokenData.codempleado) !== Number(codempleado)
  ) {
    const err = new Error('Token de registro passkey inválido o expirado. Vuelva a iniciar sesión.');
    err.statusCode = 401;
    throw err;
  }

  const emp = await loadEmpleadoPasskey(pool, empnit, codempleado);
  if (!emp) {
    const err = new Error('Empleado no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const { rpID, rpName } = rpFromRequest(req);
  const existing = parsePasskeyJson(emp.PASSKEY).credentials;
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: String(emp.USUARIO || usuario),
    userDisplayName: String(emp.NOMEMPLEADO || emp.USUARIO || usuario),
    userID: new TextEncoder().encode(`${empnit}:${codempleado}`),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports,
    })),
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'preferred',
    },
  });

  const challengeId = crypto.randomBytes(16).toString('hex');
  pendingChallenges.set(challengeId, {
    type: 'registration',
    challenge: options.challenge,
    empnit: String(empnit),
    codempleado: Number(codempleado),
    usuario: String(emp.USUARIO || usuario),
    exp: Date.now() + CHALLENGE_TTL_MS,
  });

  return { challengeId, options };
}

async function finishRegistration(pool, req, { challengeId, regToken, response }) {
  const pending = pendingChallenges.get(String(challengeId || ''));
  pendingChallenges.delete(String(challengeId || ''));
  if (!pending || pending.type !== 'registration') {
    const err = new Error('Desafío de registro expirado. Intente de nuevo.');
    err.statusCode = 400;
    throw err;
  }

  const tokenData = consumeRegToken(regToken);
  if (
    !tokenData ||
    tokenData.empnit !== pending.empnit ||
    Number(tokenData.codempleado) !== Number(pending.codempleado)
  ) {
    const err = new Error('Token de registro passkey inválido o expirado.');
    err.statusCode = 401;
    throw err;
  }

  const { rpID, origin } = rpFromRequest(req);
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
  });

  if (!verification.verified || !verification.registrationInfo) {
    const err = new Error('No se pudo verificar el passkey');
    err.statusCode = 400;
    throw err;
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const emp = await loadEmpleadoPasskey(pool, pending.empnit, pending.codempleado);
  if (!emp) {
    const err = new Error('Empleado no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const store = parsePasskeyJson(emp.PASSKEY);
  const nextCred = {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports || response?.response?.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: new Date().toISOString(),
  };
  store.credentials = store.credentials.filter((c) => c.id !== nextCred.id);
  store.credentials.push(nextCred);
  await saveEmpleadoPasskey(pool, pending.empnit, pending.codempleado, store);
  return { ok: true, hasPasskey: true };
}

async function beginAuthentication(pool, req, { empnit, usuario }) {
  const { rpID } = rpFromRequest(req);
  const usuarioTrim = String(usuario || '').trim();

  // Con usuario: limita a sus credenciales. Sin usuario: discoverable (el dispositivo elige).
  let allowCredentials;
  let empHint = null;
  if (usuarioTrim) {
    empHint = await loadEmpleadoByUsuario(pool, empnit, usuarioTrim);
    if (!empHint) {
      const err = new Error('Usuario no encontrado o inactivo');
      err.statusCode = 401;
      throw err;
    }
    const creds = parsePasskeyJson(empHint.PASSKEY).credentials;
    if (!creds.length) {
      const err = new Error('Este usuario no tiene passkey registrado');
      err.statusCode = 400;
      throw err;
    }
    allowCredentials = creds.map((c) => ({
      id: c.id,
      transports: c.transports,
    }));
  }

  const options = await generateAuthenticationOptions({
    rpID,
    ...(allowCredentials ? { allowCredentials } : {}),
    userVerification: 'preferred',
  });

  const challengeId = crypto.randomBytes(16).toString('hex');
  pendingChallenges.set(challengeId, {
    type: 'authentication',
    challenge: options.challenge,
    empnit: String(empnit),
    codempleado: empHint ? Number(empHint.CODEMPLEADO) : null,
    usuario: empHint ? String(empHint.USUARIO) : null,
    discoverable: !allowCredentials,
    exp: Date.now() + CHALLENGE_TTL_MS,
  });

  return { challengeId, options };
}

async function finishAuthentication(pool, req, { challengeId, response }) {
  const pending = pendingChallenges.get(String(challengeId || ''));
  pendingChallenges.delete(String(challengeId || ''));
  if (!pending || pending.type !== 'authentication') {
    const err = new Error('Desafío de autenticación expirado. Intente de nuevo.');
    err.statusCode = 400;
    throw err;
  }

  const credId = String(response?.id || '');
  let emp = null;
  if (pending.codempleado) {
    emp = await loadEmpleadoPasskey(pool, pending.empnit, pending.codempleado);
  }
  if (!emp) {
    emp = await findEmpleadoByCredentialId(pool, pending.empnit, credId);
  }
  if (!emp) {
    const err = new Error('Passkey no reconocido para esta empresa');
    err.statusCode = 401;
    throw err;
  }

  const creds = parsePasskeyJson(emp.PASSKEY).credentials;
  const stored = creds.find((c) => c.id === credId);
  if (!stored) {
    const err = new Error('Passkey no reconocido');
    err.statusCode = 401;
    throw err;
  }

  const { rpID, origin } = rpFromRequest(req);
  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: pending.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: {
      id: stored.id,
      publicKey: Buffer.from(stored.publicKey, 'base64url'),
      counter: Number(stored.counter) || 0,
      transports: stored.transports,
    },
  });

  if (!verification.verified) {
    const err = new Error('No se pudo verificar el passkey');
    err.statusCode = 401;
    throw err;
  }

  const newCounter = verification.authenticationInfo?.newCounter;
  if (Number.isFinite(newCounter)) {
    stored.counter = newCounter;
    await saveEmpleadoPasskey(pool, pending.empnit, emp.CODEMPLEADO, { credentials: creds });
  }

  const regToken = createRegToken(pending.empnit, emp.CODEMPLEADO, emp.USUARIO);
  return {
    ok: true,
    user: toAuthSessionUser(emp),
    webauthnRegToken: regToken,
    hasPasskey: true,
  };
}

module.exports = {
  createRegToken,
  hasPasskey,
  parsePasskeyJson,
  beginRegistration,
  finishRegistration,
  beginAuthentication,
  finishAuthentication,
  loadEmpleadoByUsuario,
};
