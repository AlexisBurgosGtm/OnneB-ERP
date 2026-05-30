const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const counterPath = path.join(root, 'build-counter.json');
const metaPublic = path.join(root, 'public', 'build-meta.json');

function formatDateDDMMYYYY(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

let count = 0;
if (fs.existsSync(counterPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(counterPath, 'utf8'));
    count = Number(data.buildCount) || 0;
  } catch {
    count = 0;
  }
}

count += 1;
const now = new Date();
const meta = {
  buildCount: count,
  lastBuild: now.toISOString(),
  buildDate: formatDateDDMMYYYY(now),
  project: 'OnneB_pos',
};

fs.writeFileSync(counterPath, JSON.stringify(meta, null, 2));
fs.mkdirSync(path.dirname(metaPublic), { recursive: true });
fs.writeFileSync(metaPublic, JSON.stringify(meta, null, 2));

console.log(`[Build] Compilación #${count}`);
