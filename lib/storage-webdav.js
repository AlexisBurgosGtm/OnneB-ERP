const { createClient } = require('webdav');

function storageConfig() {
  const server = String(process.env.STORAGE_SERVER || '').trim();
  const username = String(process.env.STORAGE_USER || '').trim();
  const password = String(process.env.STORAGE_PASS ?? '');
  return { server, username, password };
}

function isWebDavConfigured() {
  const { server, username } = storageConfig();
  return Boolean(server && username);
}

function normalizeWebDavUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, '');
}

function createWebDavClient() {
  const { server, username, password } = storageConfig();
  if (!server || !username) {
    const err = new Error('WebDAV no configurado (STORAGE_SERVER / STORAGE_USER)');
    err.statusCode = 503;
    throw err;
  }
  return createClient(normalizeWebDavUrl(server), {
    username,
    password,
  });
}

async function ensureWebDavDir(client, dirPath) {
  const parts = String(dirPath || '')
    .split('/')
    .filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    try {
      const stat = await client.stat(current);
      if (stat?.type && stat.type !== 'directory') {
        const err = new Error(`Ruta WebDAV no es carpeta: ${current}`);
        err.statusCode = 500;
        throw err;
      }
    } catch (err) {
      if (err?.status === 404 || err?.statusCode === 404 || /404|not found/i.test(String(err?.message || ''))) {
        await client.createDirectory(current);
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  storageConfig,
  isWebDavConfigured,
  normalizeWebDavUrl,
  createWebDavClient,
  ensureWebDavDir,
};
