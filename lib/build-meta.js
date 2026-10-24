/**
 * Rutas del contador de compilación (writable en .exe empaquetado).
 */
const fs = require('fs');
const path = require('path');
const { getDataRoot, getBundleRoot, isPackaged, publicDir } = require('./app-paths');

function counterPath() {
  return path.join(getDataRoot(), 'build-counter.json');
}

/** JSON servido por /api/build-meta */
function metaPathForServe() {
  const dataMeta = path.join(getDataRoot(), 'build-meta.json');
  const publicMeta = path.join(publicDir(), 'build-meta.json');
  if (fs.existsSync(dataMeta)) return dataMeta;
  if (fs.existsSync(publicMeta)) return publicMeta;
  return isPackaged() ? publicMeta : dataMeta;
}

/** Cliente empaquetado: copia build-meta embebido junto al .exe si aún no existe. */
function ensureBuildMetaSeeded() {
  if (!isPackaged()) return;
  const dataMeta = path.join(getDataRoot(), 'build-meta.json');
  if (fs.existsSync(dataMeta)) return;
  const publicMeta = path.join(publicDir(), 'build-meta.json');
  if (!fs.existsSync(publicMeta)) return;
  try {
    fs.copyFileSync(publicMeta, dataMeta);
  } catch (err) {
    console.warn('[Build] no se pudo copiar build-meta.json al directorio del .exe:', err.message);
  }
}

/** Destinos donde runBump escribe build-meta.json */
function metaWritePaths() {
  const paths = [path.join(getDataRoot(), 'build-meta.json')];
  if (!isPackaged()) {
    paths.push(path.join(publicDir(), 'build-meta.json'));
  }
  return paths;
}

/** Lee contador previo (data root, luego raíz repo legado). */
function readPreviousCount() {
  const candidates = [counterPath(), path.join(getBundleRoot(), 'build-counter.json')];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      const n = Number(data.buildCount);
      if (Number.isFinite(n) && n >= 0) return n;
    } catch {
      /* try next */
    }
  }
  return 0;
}

module.exports = {
  counterPath,
  metaPathForServe,
  metaWritePaths,
  readPreviousCount,
  ensureBuildMetaSeeded,
};
