/**
 * Detiene el generador de licencias (puerto LICENSE_GEN_PORT / 6501).
 * Uso: npm run stop-licence   |   npm stop   |   npm stop -- licence
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PID_PATH = path.join(ROOT, 'GENERADOR LICENCIAS', '.licence.pid');
const PORT = Number(process.env.LICENSE_GEN_PORT || 6501);

function readPidFile() {
  if (!fs.existsSync(PID_PATH)) return null;
  const raw = String(fs.readFileSync(PID_PATH, 'utf8') || '').trim();
  const pid = parseInt(raw, 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

function clearPidFile() {
  try {
    if (fs.existsSync(PID_PATH)) fs.unlinkSync(PID_PATH);
  } catch {
    /* ignore */
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid) {
  if (!pid || !isPidAlive(pid)) return false;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
    }
    return true;
  } catch {
    return false;
  }
}

function pidsOnPort(port) {
  const pids = new Set();
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1], 10);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN || true`, {
        encoding: 'utf8',
        shell: '/bin/bash',
      });
      for (const part of out.split(/\s+/)) {
        const pid = parseInt(part, 10);
        if (Number.isFinite(pid) && pid > 0) pids.add(pid);
      }
    }
  } catch {
    /* none */
  }
  return [...pids];
}

function main() {
  const arg = String(process.argv[2] || '').trim().toLowerCase();
  // npm stop -- licence  |  npm stop-licence  |  npm stop
  if (arg && arg !== 'licence' && arg !== 'license' && arg !== 'licencias') {
    console.error(`Uso: npm run stop-licence   o   npm stop -- licence`);
    process.exit(1);
  }

  let stopped = false;
  const filePid = readPidFile();
  if (filePid) {
    if (killPid(filePid)) {
      console.log(`[Licencias] Detenido PID ${filePid}`);
      stopped = true;
    }
  }

  for (const pid of pidsOnPort(PORT)) {
    if (filePid && pid === filePid) continue;
    if (killPid(pid)) {
      console.log(`[Licencias] Detenido proceso en puerto ${PORT} (PID ${pid})`);
      stopped = true;
    }
  }

  clearPidFile();

  if (!stopped) {
    console.log(`[Licencias] No había servicio activo (puerto ${PORT}).`);
  }
}

main();
