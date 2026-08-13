/**
 * Mini servidor para emitir licencias firmadas de OnneB POS.
 * NO desplegar esta carpeta en instalaciones de clientes.
 *
 * Uso: npm run license:gen
 * Abre http://localhost:6501
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const ROOT = path.join(__dirname, '..');
const KEYS_DIR = path.join(__dirname, 'keys');
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, 'public.pem');
const APP_PUBLIC_KEY_PATH = path.join(ROOT, 'config', 'license-public.pem');

function clearLicenseRequireCache() {
  const targets = [
    path.join(ROOT, 'lib', 'license-modules.js'),
    path.join(ROOT, 'lib', 'roles-usuarios.js'),
    path.join(ROOT, 'lib', 'license.js'),
  ];
  for (const key of Object.keys(require.cache)) {
    const resolved = path.resolve(key);
    if (targets.some((t) => resolved === path.resolve(t))) {
      delete require.cache[key];
    }
  }
}

function loadLicenseLibs() {
  clearLicenseRequireCache();
  return {
    ...require(path.join(ROOT, 'lib', 'license-modules')),
    ...require(path.join(ROOT, 'lib', 'license')),
  };
}

let {
  licenseModulesCatalog,
  modulesFromMenus,
  normalizeLicenseMenus,
  assertLicenseCatalogIntegrity,
  menusAssignedToLicenseGroups,
  CORE_MENUS,
  canonicalPayload,
} = (() => {
  const libs = loadLicenseLibs();
  return {
    licenseModulesCatalog: libs.licenseModulesCatalog,
    modulesFromMenus: libs.modulesFromMenus,
    normalizeLicenseMenus: libs.normalizeLicenseMenus,
    assertLicenseCatalogIntegrity: libs.assertLicenseCatalogIntegrity,
    menusAssignedToLicenseGroups: libs.menusAssignedToLicenseGroups,
    CORE_MENUS: libs.CORE_MENUS,
    canonicalPayload: libs.canonicalPayload,
  };
})();

const PORT = Number(process.env.LICENSE_GEN_PORT || 6501);

function ensureKeys() {
  if (!fs.existsSync(KEYS_DIR)) fs.mkdirSync(KEYS_DIR, { recursive: true });
  if (fs.existsSync(PRIVATE_KEY_PATH) && fs.existsSync(PUBLIC_KEY_PATH)) {
    syncAppPublicKey();
    return;
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey, 'utf8');
  syncAppPublicKey();
  console.log('[Licencias] Par de claves RSA creado en GENERADOR LICENCIAS/keys/');
  console.log('[Licencias] Clave pública copiada a config/license-public.pem');
}

function syncAppPublicKey() {
  const pub = fs.readFileSync(PUBLIC_KEY_PATH, 'utf8');
  const configDir = path.dirname(APP_PUBLIC_KEY_PATH);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(APP_PUBLIC_KEY_PATH, pub, 'utf8');
}

function signPayload(payload) {
  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  const data = Buffer.from(canonicalPayload(payload), 'utf8');
  const signature = crypto.sign('SHA256', data, privateKey).toString('base64');
  return { payload, signature };
}

ensureKeys();
assertLicenseCatalogIntegrity({ log: console.warn });

const app = express();
app.use(express.json({ limit: '1mb' }));
/** Iconos PWA / favicon del proyecto principal (public/icons). */
app.use('/icons', express.static(path.join(ROOT, 'public', 'icons')));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/catalog', (_req, res) => {
  const libs = loadLicenseLibs();
  licenseModulesCatalog = libs.licenseModulesCatalog;
  modulesFromMenus = libs.modulesFromMenus;
  normalizeLicenseMenus = libs.normalizeLicenseMenus;
  assertLicenseCatalogIntegrity = libs.assertLicenseCatalogIntegrity;
  menusAssignedToLicenseGroups = libs.menusAssignedToLicenseGroups;
  CORE_MENUS = libs.CORE_MENUS;
  canonicalPayload = libs.canonicalPayload;
  const integrity = assertLicenseCatalogIntegrity({ log: () => {} });
  const modules = licenseModulesCatalog();
  res.json({
    modules,
    coreMenus: [...new Set(['inicio', ...(CORE_MENUS || [])])],
    source: 'lib/roles-usuarios.js → MENU_GROUPS',
    integrity,
    note: 'Generador completo (tokens + nube + plantillas): Mariandre → Generador de licencias',
    moduleCount: modules.length,
    menuCount: modules.reduce((n, m) => n + (m.menus?.length || 0), 0),
  });
});

app.post('/api/issue', (req, res) => {
  try {
    const libs = loadLicenseLibs();
    licenseModulesCatalog = libs.licenseModulesCatalog;
    modulesFromMenus = libs.modulesFromMenus;
    normalizeLicenseMenus = libs.normalizeLicenseMenus;
    assertLicenseCatalogIntegrity = libs.assertLicenseCatalogIntegrity;
    menusAssignedToLicenseGroups = libs.menusAssignedToLicenseGroups;
    CORE_MENUS = libs.CORE_MENUS;
    canonicalPayload = libs.canonicalPayload;

    const customer = String(req.body?.customer || '').trim();
    if (!customer) {
      return res.status(400).json({ error: 'Indique el nombre del cliente' });
    }

    const validMenus = menusAssignedToLicenseGroups();
    let menus = Array.isArray(req.body?.menus)
      ? [...new Set(req.body.menus.map((m) => String(m || '').trim()).filter((m) => validMenus.has(m)))]
      : [];

    // Compat: solo módulos → expandir todas sus vistas
    if (!menus.length && Array.isArray(req.body?.modules) && req.body.modules.length) {
      menus = normalizeLicenseMenus({ modules: req.body.modules, menus: [] });
    }

    menus = normalizeLicenseMenus({ modules: [], menus });
    const selectable = menus.filter((m) => !CORE_MENUS.includes(m));
    if (!selectable.length) {
      return res.status(400).json({ error: 'Seleccione al menos una vista' });
    }

    const unknown = (req.body?.menus || []).filter(
      (m) => m && !validMenus.has(String(m).trim()) && !CORE_MENUS.includes(String(m).trim())
    );
    if (unknown.length) {
      return res.status(400).json({ error: `Vistas desconocidas: ${unknown.join(', ')}` });
    }

    const modules = modulesFromMenus(menus);

    let expiresAt = null;
    const expRaw = String(req.body?.expiresAt || '').trim();
    if (expRaw) {
      const d = new Date(expRaw);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Fecha de vencimiento inválida' });
      }
      expiresAt = d.toISOString();
    }

    const payload = {
      v: 2,
      licenseId: crypto.randomUUID(),
      customer,
      issuedAt: new Date().toISOString(),
      expiresAt,
      modules,
      menus,
      notes: String(req.body?.notes || '').trim(),
    };

    const doc = signPayload(payload);
    const filename = `onneb-license-${customer.replace(/[^\w\-]+/g, '_').slice(0, 40)}.json`;

    res.json({
      ok: true,
      filename,
      license: doc,
      menus,
      modules,
      preview: payload,
    });
  } catch (err) {
    console.warn('[Licencias issue]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/public-key', (_req, res) => {
  res.type('text/plain').send(fs.readFileSync(PUBLIC_KEY_PATH, 'utf8'));
});

app.listen(PORT, () => {
  const pidPath = path.join(__dirname, '.licence.pid');
  try {
    fs.writeFileSync(pidPath, String(process.pid), 'utf8');
  } catch (err) {
    console.warn('[Licencias] no se pudo escribir PID:', err.message);
  }
  const clearPid = () => {
    try {
      if (fs.existsSync(pidPath)) fs.unlinkSync(pidPath);
    } catch {
      /* ignore */
    }
  };
  process.once('exit', clearPid);
  process.once('SIGINT', () => {
    clearPid();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    clearPid();
    process.exit(0);
  });

  console.log(`Generador de licencias OnneB en http://localhost:${PORT}`);
  console.log('Carpeta: GENERADOR LICENCIAS (omitir en instalaciones de clientes)');
  console.log('Detener: npm run stop-licence   o   npm stop -- licence');
});
