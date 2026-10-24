/**
 * Incrementa el build counter cuando cambian archivos del proyecto.
 * Desactivado por defecto al arrancar el servidor. Opt-in: BUILD_COUNTER_WATCH=true o npm run watch:build
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const { runBump } = require('./bump-build');
const DEBOUNCE_MS = 300;

let debounceTimer = null;
let isBumping = false;

const WATCH_DIRS = [
  path.join(root, 'public'),
  path.join(root, 'lib'),
  path.join(root, 'routes'),
  path.join(root, 'config'),
  path.join(root, 'scripts'),
];
const WATCH_FILES = [path.join(root, 'server.js')];

function shouldIgnore(filename) {
  if (!filename) return false;
  const name = String(filename).replace(/\\/g, '/').toLowerCase();
  return (
    name.includes('build-meta.json') ||
    name.includes('build-counter.json') ||
    name.endsWith('bump-build.js') ||
    name.endsWith('watch-build.js') ||
    name.endsWith('.map') ||
    name.includes('/icons/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg')
  );
}

function runBumpSafe() {
  if (isBumping) return;
  isBumping = true;
  try {
    runBump();
  } catch (err) {
    console.warn('[Watch] Error al actualizar build:', err.message);
  }
  isBumping = false;
}

function scheduleBump(filename) {
  if (filename && shouldIgnore(filename)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runBumpSafe, DEBOUNCE_MS);
}

function watchPath(targetPath) {
  if (!fs.existsSync(targetPath)) return;

  const stat = fs.statSync(targetPath);
  const opts = stat.isDirectory() ? { recursive: true } : undefined;

  try {
    fs.watch(targetPath, opts, (_event, filename) => {
      scheduleBump(filename);
    });
  } catch (err) {
    console.warn('[Watch] No se pudo vigilar:', targetPath, err.message);
  }
}

function start() {
  WATCH_DIRS.forEach(watchPath);
  WATCH_FILES.forEach(watchPath);
  console.log('[Watch] Build counter: vigía public/, lib/, routes/, config/, scripts/ y server.js');
}

module.exports = { start, runBump: runBumpSafe };

if (require.main === module) {
  start();
}
