const express = require('express');
const QRCode = require('qrcode');
const { isDbConfigured } = require('../config/database');
const { isRemoteDbContext } = require('../lib/db-context');
const { getRemoteDbPool } = require('../lib/remote-db-pool');
const store = require('../lib/remote-companion-store');
const {
  loginWithCredentials,
  ensurePasskeyColumn,
  getPermiteBiometrico,
  isAdministratorUser,
  companionSessionSummary,
} = require('../lib/companion-auth');
const {
  normalizeReportCode,
  resolveReportMensaje,
} = require('../lib/consultas-externas');
const sql = require('mssql');
const {
  beginAuthentication,
  finishAuthentication,
} = require('../lib/webauthn');
const { assertEmpnitAllowed } = require('../lib/default-empnit');
const {
  emitHostApplySession,
  emitSessionActive,
} = require('../lib/remote-companion-socket');

const router = express.Router();

function resolveOrigin(req) {
  const fromBody = String(req.body?.origin || req.query?.origin || '').trim();
  if (fromBody && /^https?:\/\//i.test(fromBody)) {
    return fromBody.replace(/\/+$/, '');
  }
  const host = req.get('host');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  return 'http://localhost:6500';
}

function requirePairing(tokenRaw) {
  const pairing = store.getByToken(tokenRaw);
  if (!pairing) {
    const err = new Error('Emparejamiento inválido o expirado');
    err.statusCode = 400;
    throw err;
  }
  return pairing;
}

function buildSessionPayload(auth, { empNit, empNombre, codTipoEmpresa, dbMode }) {
  const authUser = auth.user;
  const displayName = authUser?.nomempleado || authUser?.usuario || '';
  return {
    auth,
    empNit,
    empNombre,
    codTipoEmpresa: codTipoEmpresa || '',
    dbMode: dbMode === 'remote' ? 'remote' : 'local',
    displayName,
  };
}

function publishSession(req, pairing, sessionPayload) {
  store.setSession(pairing.pairingId, sessionPayload);
  const io = req.app.get('io');
  emitHostApplySession(io, pairing.pairingId, sessionPayload);
  emitSessionActive(io, pairing.pairingId, companionSessionSummary(sessionPayload));
}

router.post('/pairing', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const pairing = store.createPairing();
  const origin = resolveOrigin(req);
  const remoteUrl = `${origin}/remote.html?t=${encodeURIComponent(pairing.token)}`;
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(remoteUrl, { margin: 1, width: 280 });
  } catch (err) {
    console.warn('[remote-companion] QR:', err.message);
  }
  res.json({
    pairingId: pairing.pairingId,
    token: pairing.token,
    expiresAt: new Date(pairing.expiresAt).toISOString(),
    remoteUrl,
    qrDataUrl,
  });
});

router.get('/pairing/status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const pairing = requirePairing(req.query.t || req.query.token);
    res.json({
      pairingId: pairing.pairingId,
      hostConnected: Boolean(pairing.hostSocketId),
      controllerConnected: Boolean(pairing.controllerSocketId),
      hasSession: Boolean(pairing.session),
      favorites: pairing.favorites || [],
      expiresAt: new Date(pairing.expiresAt).toISOString(),
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const token = String(req.body?.token || '').trim();
  const isRemote = String(req.body?.dbMode || 'local').toLowerCase() === 'remote' || isRemoteDbContext();
  if (!isRemote && !isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pairing = requirePairing(token);
    const empnit = String(req.body?.empnit || '').trim();
    const usuario = String(req.body?.usuario || '').trim();
    const password = req.body?.password;
    const empNombre = String(req.body?.empNombre || empnit).trim();
    const codTipoEmpresa = String(req.body?.codTipoEmpresa || '').trim();

    let pool;
    if (isRemote) {
      pool = await getRemoteDbPool(empnit);
    } else {
      pool = await req.app.locals.getDbPool();
    }

    const auth = await loginWithCredentials(pool, {
      empnit,
      usuario,
      password,
      skipEmpnitAssert: isRemote,
    });

    const sessionPayload = buildSessionPayload(auth, {
      empNit: empnit,
      empNombre,
      codTipoEmpresa,
      dbMode: isRemote ? 'remote' : 'local',
    });
    publishSession(req, pairing, sessionPayload);

    res.json({
      ok: true,
      user: auth.user,
      hasPasskey: auth.hasPasskey,
      permiteBiometrico: auth.permiteBiometrico,
      webauthnRegToken: auth.webauthnRegToken,
      empnit,
      empNombre,
    });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[remote-companion/login]', err.message);
    res.status(status).json({ error: err.message });
  }
});

router.post('/webauthn/login-options', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const token = String(req.body?.token || '').trim();
  const empnit = String(req.body?.empnit || '').trim();
  const usuario = String(req.body?.usuario || '').trim();
  try {
    requirePairing(token);
    assertEmpnitAllowed(empnit);
    const pool = await req.app.locals.getDbPool();
    await ensurePasskeyColumn(pool);
    const permite = await getPermiteBiometrico(pool);
    if (permite !== 'SI') {
      return res.status(403).json({ error: 'Biométrico deshabilitado en configuración' });
    }
    const result = await beginAuthentication(pool, req, { empnit, usuario });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.get('/report-mensaje', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const token = String(req.query.t || req.query.token || '').trim();
  const codigo = normalizeReportCode(req.query.ventadia || req.query.codigo);
  if (!token || !codigo) {
    return res.status(400).json({ error: 'Token y código de reporte requeridos' });
  }
  try {
    const pairing = requirePairing(token);
    const session = pairing.session;
    const user = session?.auth?.user;
    if (!session?.empNit || !user) {
      return res.status(403).json({ error: 'Inicie sesión en el control remoto primero' });
    }
    if (!isAdministratorUser(user)) {
      return res.status(403).json({ error: 'Reportes de voz solo para administrador' });
    }
    const pool = await req.app.locals.getDbPool();
    const data = await resolveReportMensaje(pool, sql, session.empNit, codigo, {});
    res.json({ mensaje: data.mensaje, fecha: data.fecha || null, codigo: data.codigo });
  } catch (err) {
    const status = err.statusCode || 500;
    if (status >= 500) console.warn('[remote-companion/report-mensaje]', err.message);
    res.status(status).json({ error: err.message });
  }
});

router.post('/webauthn/login-verify', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const token = String(req.body?.token || '').trim();
  const empNombre = String(req.body?.empNombre || '').trim();
  const codTipoEmpresa = String(req.body?.codTipoEmpresa || '').trim();
  try {
    const pairing = requirePairing(token);
    const pool = await req.app.locals.getDbPool();
    await ensurePasskeyColumn(pool);
    const empnit = String(req.body?.empnit || '').trim();
    if (!empnit) {
      return res.status(400).json({ error: 'Empresa obligatoria' });
    }
    assertEmpnitAllowed(empnit);
    const auth = await finishAuthentication(pool, req, {
      challengeId: req.body?.challengeId,
      response: req.body?.response,
    });
    const sessionPayload = buildSessionPayload(auth, {
      empNit: empnit,
      empNombre: empNombre || empnit,
      codTipoEmpresa,
      dbMode: 'local',
    });
    const permiteBiometrico = await getPermiteBiometrico(pool);
    publishSession(req, pairing, sessionPayload);
    res.json({
      ok: true,
      ...auth,
      permiteBiometrico,
      empNombre: empNombre || empnit,
    });
  } catch (err) {
    console.warn('[remote-companion/webauthn/login-verify]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
