/**
 * Copia SheetJS (xlsx) al folder public/vendor para export en el navegador.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.mini.min.js');
const destDir = path.join(ROOT, 'public', 'vendor');
const dest = path.join(destDir, 'xlsx.mini.min.js');

if (!fs.existsSync(src)) {
  console.warn('[sync-vendor-xlsx] Falta node_modules/xlsx — ejecute npm install');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('[sync-vendor-xlsx] OK → public/vendor/xlsx.mini.min.js');
