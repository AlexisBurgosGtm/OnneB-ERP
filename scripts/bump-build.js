const fs = require('fs');
const path = require('path');
const {
  counterPath,
  metaWritePaths,
  readPreviousCount,
} = require('../lib/build-meta');
const { ensureDir } = require('../lib/app-paths');

function formatDateDDMMYYYY(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

function runBump() {
  const count = readPreviousCount() + 1;
  const now = new Date();
  const meta = {
    buildCount: count,
    lastBuild: now.toISOString(),
    buildDate: formatDateDDMMYYYY(now),
    project: 'OnneB_pos',
  };

  ensureDir(path.dirname(counterPath()));
  fs.writeFileSync(counterPath(), JSON.stringify(meta, null, 2));

  const payload = JSON.stringify(meta, null, 2);
  for (const dest of metaWritePaths()) {
    try {
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, payload);
    } catch (err) {
      console.warn('[Build] no se pudo escribir', dest, err.message);
    }
  }

  console.log(`[Build] Compilación #${count}`);
  return meta;
}

if (require.main === module) {
  runBump();
}

module.exports = { runBump };
