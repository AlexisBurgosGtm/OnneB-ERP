/**
 * Sesión WhatsApp vía @whiskeysockets/baileys (multi-device / QR).
 * Auth en disco: data/whatsapp-auth (writableDataDir).
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { writableDataDir, ensureDir } = require('./app-paths');

const LIBRARY = '@whiskeysockets/baileys';

const silentLogger = {
  level: 'silent',
  child() {
    return silentLogger;
  },
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  fatal() {},
};

function logConectado() {
  console.log('[WhatsApp] conectado');
}

function logErrorConectar() {
  console.warn('[WhatsApp] error al conectar');
}

let ioRef = null;
let sock = null;
let saveCredsFn = null;
let starting = false;
let status = {
  state: 'idle', // idle | connecting | qr | ready | logged_out | error
  qrDataUrl: null,
  phone: null,
  name: null,
  error: null,
  library: LIBRARY,
  updatedAt: null,
};

function authDir() {
  return ensureDir(path.join(writableDataDir(), 'whatsapp-auth'));
}

function setWhatsappIo(io) {
  ioRef = io || null;
}

function touch() {
  status.updatedAt = new Date().toISOString();
}

function broadcast() {
  touch();
  if (ioRef) {
    try {
      ioRef.emit('whatsapp:status', getStatus());
    } catch {
      /* no volcar el estado en consola */
    }
  }
}

function getStatus() {
  return {
    ...status,
    connected: status.state === 'ready',
    hasSavedAuth: hasSavedAuth(),
    library: LIBRARY,
  };
}

/** Credenciales Baileys previas (sesión ya vinculada al teléfono). */
function hasSavedAuth() {
  try {
    const credsPath = path.join(authDir(), 'creds.json');
    if (!fs.existsSync(credsPath)) return false;
    const raw = fs.readFileSync(credsPath, 'utf8');
    if (!raw.trim()) return false;
    const creds = JSON.parse(raw);
    return Boolean(creds?.me?.id || creds?.registered);
  } catch {
    return false;
  }
}

/**
 * Restaura WhatsApp si hay sesión guardada. No genera QR nuevo si no hay auth.
 * @returns {Promise<object>} status
 */
async function tryAutoConnect() {
  if (status.state === 'ready' && sock) return getStatus();
  if (status.state === 'connecting' || status.state === 'qr' || starting) return getStatus();
  if (!hasSavedAuth()) {
    return {
      ...getStatus(),
      skipped: true,
      reason: 'no_saved_auth',
    };
  }
  try {
    return await startSession({ forceNewQr: false });
  } catch {
    return getStatus();
  }
}

function setState(partial) {
  status = { ...status, ...partial, library: LIBRARY };
  broadcast();
}

function clearAuthFiles() {
  const dir = authDir();
  try {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

async function endSocketQuietly() {
  const s = sock;
  sock = null;
  saveCredsFn = null;
  if (!s) return;
  try {
    s.ev.removeAllListeners('connection.update');
    s.ev.removeAllListeners('creds.update');
  } catch {
    /* ignore */
  }
  try {
    s.end(undefined);
  } catch {
    /* ignore */
  }
}

function jidToPhone(jid) {
  const raw = String(jid || '').split('@')[0] || '';
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

async function startSession({ forceNewQr = false } = {}) {
  if (starting) return getStatus();
  if (status.state === 'ready' && sock && !forceNewQr) return getStatus();

  starting = true;
  try {
    await endSocketQuietly();
    if (forceNewQr) clearAuthFiles();

    setState({
      state: 'connecting',
      qrDataUrl: null,
      error: null,
      phone: null,
      name: null,
    });

    const { state, saveCreds } = await useMultiFileAuthState(authDir());
    saveCredsFn = saveCreds;

    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch {
      version = undefined;
    }

    const socket = makeWASocket({
      auth: state,
      version,
      logger: silentLogger,
      printQRInTerminal: false,
      browser: Browsers.ubuntu('Chrome'),
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });
    sock = socket;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update || {};

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            errorCorrectionLevel: 'M',
            margin: 2,
            width: 280,
          });
          setState({ state: 'qr', qrDataUrl, error: null });
        } catch (err) {
          logErrorConectar();
          setState({ state: 'error', error: err.message || 'No se pudo generar QR', qrDataUrl: null });
        }
      }

      if (connection === 'open') {
        const me = socket.user?.id || socket.authState?.creds?.me?.id;
        const name = socket.user?.name || socket.authState?.creds?.me?.name || null;
        logConectado();
        setState({
          state: 'ready',
          qrDataUrl: null,
          phone: jidToPhone(me),
          name: name ? String(name) : null,
          error: null,
        });
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const restartRequired = code === DisconnectReason.restartRequired;

        await endSocketQuietly();

        if (loggedOut) {
          clearAuthFiles();
          logErrorConectar();
          setState({
            state: 'logged_out',
            qrDataUrl: null,
            phone: null,
            name: null,
            error: 'Sesión cerrada en el teléfono. Conecte de nuevo y escanee el QR.',
          });
          return;
        }

        if (restartRequired || code === DisconnectReason.connectionClosed || code === DisconnectReason.connectionLost) {
          setState({ state: 'connecting', qrDataUrl: null, error: null });
          starting = false;
          startSession({ forceNewQr: false }).catch((err) => {
            setState({ state: 'error', error: err.message || 'Error al reconectar' });
          });
          return;
        }

        logErrorConectar();
        setState({
          state: 'error',
          qrDataUrl: null,
          phone: null,
          name: null,
          error: lastDisconnect?.error?.message || `Conexión cerrada (${code ?? '?'})`,
        });
      }
    });

    return getStatus();
  } catch (err) {
    logErrorConectar();
    setState({
      state: 'error',
      error: err.message || 'No se pudo iniciar WhatsApp',
      qrDataUrl: null,
    });
    throw err;
  } finally {
    starting = false;
  }
}

async function logout() {
  try {
    if (sock) {
      try {
        await sock.logout();
      } catch {
        /* ignore */
      }
    }
  } finally {
    await endSocketQuietly();
    clearAuthFiles();
    setState({
      state: 'logged_out',
      qrDataUrl: null,
      phone: null,
      name: null,
      error: null,
    });
  }
  return getStatus();
}

function normalizePhone(to) {
  let digits = String(to || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

async function sendText(to, text) {
  if (!sock || status.state !== 'ready') {
    const err = new Error('WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.');
    err.statusCode = 409;
    throw err;
  }
  const phone = normalizePhone(to);
  const body = String(text || '').trim();
  if (!phone) {
    const err = new Error('Número de destino inválido');
    err.statusCode = 400;
    throw err;
  }
  if (!body) {
    const err = new Error('Mensaje vacío');
    err.statusCode = 400;
    throw err;
  }
  const jid = `${phone}@s.whatsapp.net`;
  const result = await sock.sendMessage(jid, { text: body });
  return { ok: true, jid, id: result?.key?.id || null };
}

/**
 * Envía un archivo (p. ej. PDF) por WhatsApp.
 * @param {string} to
 * @param {{ filePath: string, fileName?: string, mimetype?: string, caption?: string }} opts
 */
async function sendDocument(to, opts = {}) {
  if (!sock || status.state !== 'ready') {
    const err = new Error('WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.');
    err.statusCode = 409;
    throw err;
  }
  const phone = normalizePhone(to);
  if (!phone) {
    const err = new Error('Número de destino inválido');
    err.statusCode = 400;
    throw err;
  }
  const filePath = String(opts.filePath || '').trim();
  if (!filePath || !fs.existsSync(filePath)) {
    const err = new Error('Archivo no encontrado para enviar');
    err.statusCode = 400;
    throw err;
  }
  const fileName = String(opts.fileName || path.basename(filePath)).trim() || 'documento.pdf';
  const mimetype = String(opts.mimetype || 'application/pdf').trim();
  const caption = String(opts.caption || '').trim();
  const buffer = fs.readFileSync(filePath);
  const jid = `${phone}@s.whatsapp.net`;
  const payload = {
    document: buffer,
    mimetype,
    fileName,
  };
  if (caption) payload.caption = caption;
  const result = await sock.sendMessage(jid, payload);
  return { ok: true, jid, id: result?.key?.id || null, fileName };
}

/**
 * Envía una imagen por WhatsApp.
 * @param {string} to
 * @param {{ filePath?: string, buffer?: Buffer, fileName?: string, mimetype?: string, caption?: string }} opts
 */
async function sendImage(to, opts = {}) {
  if (!sock || status.state !== 'ready') {
    const err = new Error('WhatsApp no está conectado. Active la sesión en Configuraciones → WhatsApp.');
    err.statusCode = 409;
    throw err;
  }
  const phone = normalizePhone(to);
  if (!phone) {
    const err = new Error('Número de destino inválido');
    err.statusCode = 400;
    throw err;
  }
  let buffer = opts.buffer;
  if (!buffer) {
    const filePath = String(opts.filePath || '').trim();
    if (!filePath || !fs.existsSync(filePath)) {
      const err = new Error('Imagen no encontrada para enviar');
      err.statusCode = 400;
      throw err;
    }
    buffer = fs.readFileSync(filePath);
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const err = new Error('Imagen vacía o inválida');
    err.statusCode = 400;
    throw err;
  }
  const mimetype = String(opts.mimetype || 'image/jpeg').trim();
  const caption = String(opts.caption || '').trim();
  const fileName = String(opts.fileName || 'imagen.jpg').trim() || 'imagen.jpg';
  const jid = `${phone}@s.whatsapp.net`;
  const payload = {
    image: buffer,
    mimetype,
  };
  if (caption) payload.caption = caption;
  const result = await sock.sendMessage(jid, payload);
  return { ok: true, jid, id: result?.key?.id || null, fileName };
}

module.exports = {
  LIBRARY,
  setWhatsappIo,
  getStatus,
  hasSavedAuth,
  tryAutoConnect,
  startSession,
  logout,
  sendText,
  sendDocument,
  sendImage,
  authDir,
};
