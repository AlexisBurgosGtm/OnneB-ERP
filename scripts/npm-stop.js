/**
 * npm stop [licence]
 * - sin args → detiene el POS (puerto 6500)
 * - licence|license → detiene el generador de licencias
 */
const { spawnSync } = require('child_process');
const path = require('path');

const arg = String(process.argv[2] || '').trim().toLowerCase();
const script =
  arg === 'licence' || arg === 'license' || arg === 'licencias'
    ? path.join(__dirname, 'stop-licence.js')
    : path.join(__dirname, 'stop-server.js');

const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
process.exit(result.status == null ? 1 : result.status);
