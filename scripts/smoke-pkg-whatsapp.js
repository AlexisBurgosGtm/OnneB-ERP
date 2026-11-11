/**
 * Prueba rápida: .exe empaquetado carga Baileys y responde /api/whatsapp/connect.
 * Uso: node scripts/smoke-pkg-whatsapp.js
 */
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const EXE = path.join(ROOT, 'dist-client', 'OnneB-Server.exe');
const PORT = 16500;

function fetchJson(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(raw || '{}') });
          } catch (e) {
            reject(new Error(`JSON ${res.statusCode}: ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  const fs = require('fs');
  if (!fs.existsSync(EXE)) {
    console.error('Falta', EXE, '— ejecute npm run dist:client');
    process.exit(1);
  }

  const child = spawn(EXE, [], {
    cwd: path.join(ROOT, 'dist-client'),
    env: {
      ...process.env,
      PORT: String(PORT),
      LICENSE_OPEN: '1',
      DEBUG_WHATSAPP: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let bootLog = '';
  child.stdout.on('data', (d) => {
    bootLog += d.toString();
    process.stdout.write(d);
  });
  child.stderr.on('data', (d) => {
    bootLog += d.toString();
    process.stderr.write(d);
  });

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const st = await fetchJson('GET', '/api/whatsapp/status');
      if (st.status === 200 && st.json.library) {
        console.log('\n[smoke] status OK', st.json.state, st.json.error || '');
        const conn = await fetchJson('POST', '/api/whatsapp/connect', {});
        console.log('[smoke] connect', conn.status, conn.json.state, conn.json.error || '');
        if (conn.json.state === 'error' && conn.json.error) {
          console.error('[smoke] FAIL:', conn.json.error);
          child.kill();
          process.exit(2);
        }
        if (['connecting', 'qr', 'ready'].includes(conn.json.state)) {
          console.log('[smoke] OK — Baileys arrancó en .exe');
          child.kill();
          process.exit(0);
        }
      }
    } catch {
      /* server not up */
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  console.error('[smoke] timeout. Log:\n', bootLog.slice(-4000));
  child.kill();
  process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
