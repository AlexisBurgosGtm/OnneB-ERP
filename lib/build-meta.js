/**
 * Rutas del contador de compilación (writable en .exe empaquetado).
 */
const fs = require('fs');
const path = require('path');
const { getDataRoot, getBundleRoot, isPackaged, publicDir } = require('./app-paths');

function counterPath() {
  return path.join(getDataRoot(), 'build-counter.json');
}

function readMetaFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const n = Number(data.buildCount);
    if (!Number.isFinite(n) || n < 0) return null;
    return data;
  } catch {
    return null;
  }
}

function metaTimestamp(meta) {
  if (!meta) return 0;
  const t = Date.parse(meta.lastBuild || '');
  return Number.isFinite(t) ? t : 0;
}

/** Devuelve 'data' | 'public' | null según cuál meta es más reciente. */
function pickNewerMetaSource(dataMeta, publicMeta) {
  if (!dataMeta && !publicMeta) return null;
  if (!dataMeta) return 'public';
  if (!publicMeta) return 'data';
  const ca = Number(dataMeta.buildCount) || 0;
  const cb = Number(publicMeta.buildCount) || 0;
  if (ca !== cb) return ca > cb ? 'data' : 'public';
  return metaTimestamp(dataMeta) >= metaTimestamp(publicMeta) ? 'data' : 'public';
}

function metaPaths() {
  return {
    data: path.join(getDataRoot(), 'build-meta.json'),
    public: path.join(publicDir(), 'build-meta.json'),
  };
}

/** JSON servido por /api/build-meta (siempre el build más reciente). */
function metaPathForServe() {
  const { data: dataPath, public: publicPath } = metaPaths();
  const pick = pickNewerMetaSource(readMetaFile(dataPath), readMetaFile(publicPath));
  if (pick === 'data') return dataPath;
  if (pick === 'public') return publicPath;
  return isPackaged() ? publicPath : dataPath;
}

/** Objeto mergeado para API (evita servir un build-meta viejo junto al .exe). */
function getBuildMetaForServe() {
  const { data: dataPath, public: publicPath } = metaPaths();
  const dataMeta = readMetaFile(dataPath);
  const publicMeta = readMetaFile(publicPath);
  const pick = pickNewerMetaSource(dataMeta, publicMeta);
  if (pick === 'data') return dataMeta;
  if (pick === 'public') return publicMeta;
  return null;
}

/** Cliente empaquetado: sincroniza build-meta embebido si el .exe trae uno más nuevo. */
function ensureBuildMetaSeeded() {
  if (!isPackaged()) return;
  const { data: dataPath, public: publicPath } = metaPaths();
  const dataMeta = readMetaFile(dataPath);
  const publicMeta = readMetaFile(publicPath);
  const pick = pickNewerMetaSource(dataMeta, publicMeta);
  if (pick !== 'public' || !publicMeta) return;
  const payload = JSON.stringify(publicMeta, null, 2);
  try {
    fs.writeFileSync(dataPath, payload);
    fs.writeFileSync(counterPath(), payload);
  } catch (err) {
    console.warn('[Build] no se pudo sincronizar build-meta.json al directorio del .exe:', err.message);
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
  let best = 0;
  const { data: dataPath, public: publicPath } = metaPaths();
  const candidates = [
    counterPath(),
    dataPath,
    publicPath,
    path.join(getBundleRoot(), 'build-counter.json'),
    path.join(getBundleRoot(), 'build-meta.json'),
  ];
  for (const p of candidates) {
    const meta = readMetaFile(p);
    if (!meta) continue;
    const n = Number(meta.buildCount);
    if (Number.isFinite(n) && n >= best) best = n;
  }
  return best;
}

module.exports = {
  counterPath,
  metaPathForServe,
  getBuildMetaForServe,
  metaWritePaths,
  readPreviousCount,
  ensureBuildMetaSeeded,
};
