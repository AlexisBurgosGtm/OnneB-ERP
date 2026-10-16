const crypto = require('crypto');

const PAIRING_TTL_MS = 15 * 60 * 1000;

/** @type {Map<string, object>} pairingId -> state */
const byId = new Map();
/** @type {Map<string, string>} token -> pairingId */
const byToken = new Map();

function roomName(pairingId) {
  return `companion:${pairingId}`;
}

function purgeExpired() {
  const now = Date.now();
  for (const [id, p] of byId.entries()) {
    if (p.expiresAt <= now) {
      byId.delete(id);
      if (p.token) byToken.delete(p.token);
    }
  }
}

setInterval(purgeExpired, 60 * 1000).unref?.();

function createPairing() {
  purgeExpired();
  const pairingId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString('base64url');
  const now = Date.now();
  const state = {
    pairingId,
    token,
    createdAt: now,
    expiresAt: now + PAIRING_TTL_MS,
    hostSocketId: null,
    controllerSocketId: null,
    favorites: [],
    session: null,
  };
  byId.set(pairingId, state);
  byToken.set(token, pairingId);
  return state;
}

function getByToken(token) {
  purgeExpired();
  const key = String(token || '').trim();
  if (!key) return null;
  const id = byToken.get(key);
  if (!id) return null;
  const p = byId.get(id);
  if (!p || p.token !== key) return null;
  if (p.expiresAt <= Date.now()) {
    byId.delete(id);
    byToken.delete(key);
    return null;
  }
  return p;
}

function getById(pairingId) {
  purgeExpired();
  return byId.get(String(pairingId || '').trim()) || null;
}

function setHostSocket(pairingId, socketId) {
  const p = getById(pairingId);
  if (!p) return null;
  p.hostSocketId = socketId || null;
  return p;
}

function setControllerSocket(pairingId, socketId) {
  const p = getById(pairingId);
  if (!p) return null;
  p.controllerSocketId = socketId || null;
  return p;
}

function setSession(pairingId, session) {
  const p = getById(pairingId);
  if (!p) return null;
  p.session = session;
  return p;
}

function setFavorites(pairingId, items) {
  const p = getById(pairingId);
  if (!p) return null;
  p.favorites = Array.isArray(items) ? items : [];
  return p;
}

function clearSocket(socketId) {
  if (!socketId) return;
  for (const p of byId.values()) {
    if (p.hostSocketId === socketId) p.hostSocketId = null;
    if (p.controllerSocketId === socketId) p.controllerSocketId = null;
  }
}

module.exports = {
  PAIRING_TTL_MS,
  roomName,
  createPairing,
  getByToken,
  getById,
  setHostSocket,
  setControllerSocket,
  setSession,
  setFavorites,
  clearSocket,
};
