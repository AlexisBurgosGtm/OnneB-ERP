/**
 * Incrementa el build counter cuando cambian archivos del proyecto.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const bumpScript = path.join(__dirname, 'bump-build.js');
const DEBOUNCE_MS = 300;

let debounceTimer = null;
let isBumping = false;

const WATCH_DIRS = [
  path.join(root, 'public'),
  path.join(root, 'scripts'),
];
const WATCH_FILES = [path.join(root, 'server.js')];

function shouldIgnore(filename) {
  if (!filename) return false;
  const name = String(filename).replace(/\\/g, '/').toLowerCase();
  return (
    name.includes('build-meta.json') ||
    name.includes('build-counter.json') ||
    name.endsWith('.map') ||
    name.includes('/icons/') ||
    name.endsWith('.png') ||
    name.endsWith('.jpg')
  );
}

function runBump() {
  if (isBumping) return;
  isBumping = true;
  const result = spawnSync(process.execPath, [bumpScript], { cwd: root, encoding: 'utf8' });
  isBumping = false;
  if (result.status !== 0) {
    console.warn('[Watch] Error al actualizar build:', result.stderr || result.stdout);
  }
}

function scheduleBump(filename) {
  if (filename && shouldIgnore(filename)) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runBump, DEBOUNCE_MS);
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
  console.log('[Watch] Build counter: vigía public/, scripts/ y server.js');
}

module.exports = { start, runBump };

if (require.main === module) {
  start();
  runBump();
}
