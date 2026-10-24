/**
 * Empaqueta instalación cliente (Windows x64).
 * Uso: npm run dist:client
 *
 * Lee metadatos de package.json → distClient (o defaults).
 * Desarrollo diario (npm start) no se altera.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-client');
const STAGING_PUBLIC = path.join(OUT, '_staging_public');
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const cfg = pkgJson.distClient || {};

const PRODUCT = String(cfg.product || pkgJson.name || 'ERP').trim();
const EXE_NAME = String(cfg.exe || 'ERP-Server.exe').trim();
const SERVICE_ID = String(cfg.serviceId || 'ERP-Service').trim();
const SERVICE_NAME = String(cfg.serviceName || PRODUCT).trim();
const DEFAULT_PORT = String(cfg.port || '6500').trim();

function log(msg) {
  console.log(`[dist:client] ${msg}`);
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(src, dest) {
  ensureDir(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function shouldMinifyJs(filePath) {
  const norm = filePath.replace(/\\/g, '/');
  if (!norm.endsWith('.js')) return false;
  if (norm.includes('/vendor/')) return false;
  return true;
}

async function minifyPublic() {
  const terser = require('terser');
  const srcPublic = path.join(ROOT, 'public');
  rmDir(STAGING_PUBLIC);
  copyDir(srcPublic, STAGING_PUBLIC);

  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (shouldMinifyJs(full)) files.push(full);
    }
  };
  walk(STAGING_PUBLIC);

  let count = 0;
  for (const full of files) {
    const code = fs.readFileSync(full, 'utf8');
    try {
      const result = await terser.minify(code, {
        compress: true,
        mangle: true,
        format: { comments: false },
      });
      if (result.code) {
        fs.writeFileSync(full, result.code, 'utf8');
        count += 1;
      }
    } catch (err) {
      console.warn(`[dist:client] minify skip ${path.relative(STAGING_PUBLIC, full)}: ${err.message}`);
    }
  }
  log(`JS minificados: ${count}`);
}

function writeInstallFiles() {
  ensureDir(path.join(OUT, 'Fotos_productos'));
  ensureDir(path.join(OUT, 'EMPLEADOS'));
  ensureDir(path.join(OUT, 'data'));

  fs.writeFileSync(
    path.join(OUT, 'Fotos_productos', 'LEAME.txt'),
    'Fotos de productos (modo LOCAL).\nConserve esta carpeta al actualizar el .exe.\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(OUT, 'EMPLEADOS', 'LEAME.txt'),
    'Fotos de empleados (modo LOCAL).\nConserve esta carpeta al actualizar el .exe.\n',
    'utf8'
  );

  const envExampleSrc = path.join(ROOT, '.env.example');
  if (fs.existsSync(envExampleSrc)) {
    let envText = fs.readFileSync(envExampleSrc, 'utf8');
    if (!/^PORT=/m.test(envText)) envText = `PORT=${DEFAULT_PORT}\n${envText}`;
    else envText = envText.replace(/^PORT=.*$/m, `PORT=${DEFAULT_PORT}`);
    fs.writeFileSync(path.join(OUT, '.env.example'), envText, 'utf8');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<service>
  <id>${SERVICE_ID}</id>
  <name>${SERVICE_NAME}</name>
  <description>${SERVICE_NAME} — servicio local HTTP</description>
  <executable>%BASE%\\${EXE_NAME}</executable>
  <workingdirectory>%BASE%</workingdirectory>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>4</keepFiles>
  </log>
  <onfailure action="restart" delay="5 sec"/>
</service>
`;
  fs.writeFileSync(path.join(OUT, `${SERVICE_ID}.xml`), xml, 'utf8');

  fs.writeFileSync(
    path.join(OUT, 'install-service.ps1'),
    `# Ejecutar como Administrador en esta carpeta (dist-client).
# 1) Descargar WinSW-x64.exe: https://github.com/winsw/winsw/releases
# 2) Renombrarlo a ${SERVICE_ID}.exe (junto a este script y al XML).
# 3) Tener .env en esta misma carpeta (copiar desde .env.example).

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
if (-not (Test-Path (Join-Path $Root '.env'))) {
  Write-Error 'Falta .env junto al .exe. Copie .env.example a .env y complete DB_*.'
}
$Wrapper = Join-Path $Root '${SERVICE_ID}.exe'
if (-not (Test-Path $Wrapper)) {
  Write-Error "Falta ${SERVICE_ID}.exe (WinSW renombrado) en $Root"
}
& $Wrapper install
& $Wrapper start
Write-Host 'Servicio instalado y arrancado. Abra http://localhost:${DEFAULT_PORT}'
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(OUT, 'uninstall-service.ps1'),
    `$ErrorActionPreference = 'Stop'
$Wrapper = Join-Path $PSScriptRoot '${SERVICE_ID}.exe'
if (Test-Path $Wrapper) { & $Wrapper stop; & $Wrapper uninstall }
Write-Host 'Servicio desinstalado.'
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(OUT, 'open-firewall-port.ps1'),
    `# Permite conexiones entrantes TCP al puerto del ERP (LAN, ZeroTier, etc.).
# Ejecutar como Administrador en esta carpeta (dist-client).

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
$Port = ${DEFAULT_PORT}

$envPath = Join-Path $Root '.env'
if (Test-Path $envPath) {
  $portLine = Get-Content $envPath -Encoding UTF8 | Where-Object { $_ -match '^\\s*PORT\\s*=' } | Select-Object -First 1
  if ($portLine -match 'PORT\\s*=\\s*(\\d+)') {
    $Port = [int]$Matches[1]
  }
}

if ($Port -lt 1 -or $Port -gt 65535) {
  Write-Error "Puerto invalido: $Port (revise PORT en .env)"
}

$RuleName = '${SERVICE_NAME} — TCP ' + $Port
$existing = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "Ya existe la regla: $RuleName"
} else {
  New-NetFirewallRule \`
    -DisplayName $RuleName \`
    -Direction Inbound \`
    -Protocol TCP \`
    -LocalPort $Port \`
    -Action Allow \`
    -Profile Domain, Private, Public | Out-Null
  Write-Host "Regla creada: TCP entrante puerto $Port (Domain, Private, Public)"
}

Write-Host "Pruebe en esta PC: http://localhost:$Port"
Write-Host "Desde otra PC (VPN/LAN): http://<IP-de-esta-maquina>:$Port"
`,
    'utf8'
  );

  fs.writeFileSync(
    path.join(OUT, 'README-INSTALACION.txt'),
    `${PRODUCT} — instalación local
===============================

DÓNDE VA EL ARCHIVO .env
------------------------
En la MISMA carpeta que ${EXE_NAME} (esta carpeta de instalación).

  ...\\${PRODUCT}\\
    ${EXE_NAME}
    .env                  ← AQUÍ (copie desde .env.example)
    ${SERVICE_ID}.xml
    ${SERVICE_ID}.exe     ← WinSW renombrado (opcional, para servicio)
    open-firewall-port.ps1 ← liberar puerto TCP en Windows (acceso remoto)
    Fotos_productos\\      ← fotos productos (no borrar al actualizar)
    EMPLEADOS\\            ← fotos empleados (no borrar)
    data\\                 ← license.json aquí

Pasos
-----
1. Copiar .env.example → .env y editar DB_*, TOKEN, PORT=${DEFAULT_PORT}
2. (Opcional) data\\license.json de Mariandre
3. Probar: ejecutar ${EXE_NAME} → http://localhost:${DEFAULT_PORT}
4. Servicio Windows: install-service.ps1 como Administrador

Acceso remoto (ZeroTier, otra sucursal, etc.)
------------------------------------------------
Si desde otra PC hace ping a la IP pero NO abre http://IP:PUERTO, casi siempre
falta una regla en el Firewall de Windows de ESTA máquina.

1. Confirme que aquí funciona: http://localhost:PUERTO (mismo PORT del .env)
2. Ejecute como Administrador (clic derecho → Ejecutar con PowerShell):

     .\\open-firewall-port.ps1

   El script lee PORT del .env (si no hay .env, usa ${DEFAULT_PORT}) y crea la
   regla entrante TCP. Vuelva a probar desde la otra PC: http://IP:PUERTO

3. Compruebe el puerto en escucha (PowerShell):

     Get-NetTCPConnection -LocalPort PUERTO -State Listen

Actualizar
----------
Reemplazar solo ${EXE_NAME}. Conservar .env, Fotos_productos, EMPLEADOS y data.

Compilar (npm run dist:client)
-------------------------------
Advertencias típicas de pkg en Windows (xdg-open, sharp, bytecode): no impiden usar el .exe.
Si el .exe no arranca, revise .env y el log del servicio (WinSW) o ejecute ${EXE_NAME} en consola.
`,
    'utf8'
  );
}

function swapPublicForPkg() {
  const live = path.join(ROOT, 'public');
  const backup = path.join(OUT, '_public_backup');
  rmDir(backup);
  fs.renameSync(live, backup);
  fs.renameSync(STAGING_PUBLIC, live);
  return () => {
    rmDir(live);
    fs.renameSync(backup, live);
  };
}

function runPkg() {
  const exeOut = path.join(OUT, EXE_NAME);
  const args = [
    'server.js',
    '--targets',
    'node22-win-x64',
    '--output',
    exeOut,
    '--compress',
    'GZip',
    '--fallback-to-source',
  ];
  log(`pkg → ${exeOut}`);

  const pkgCli = path.join(ROOT, 'node_modules', '@yao-pkg', 'pkg', 'lib-es5', 'bin.js');
  const pkgCliAlt = path.join(ROOT, 'node_modules', '@yao-pkg', 'pkg', 'lib', 'bin.js');
  const cli = fs.existsSync(pkgCli) ? pkgCli : pkgCliAlt;

  let r;
  if (fs.existsSync(cli)) {
    r = spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' });
  } else {
    r = spawnSync(process.execPath, [require.resolve('@yao-pkg/pkg/lib-es5/bin.js'), ...args], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
  if (!r || r.status !== 0) throw new Error(`pkg falló (${r && r.status})`);
  log(
    'Si pkg mostró advertencias (xdg-open, sharp, bytecode open/brotli): en Windows cliente suelen ser inofensivas.'
  );
}

async function main() {
  log(`Producto: ${PRODUCT}`);
  try {
    require('./bump-build').runBump();
  } catch (err) {
    console.warn('[dist:client] build counter:', err.message);
  }
  ensureDir(OUT);
  for (const name of fs.readdirSync(OUT)) {
    if (name === '_public_backup') continue;
    const p = path.join(OUT, name);
    try {
      fs.rmSync(p, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  await minifyPublic();
  writeInstallFiles();
  const restore = swapPublicForPkg();
  try {
    runPkg();
  } finally {
    restore();
    rmDir(STAGING_PUBLIC);
  }

  const buildMetaSrc = path.join(ROOT, 'public', 'build-meta.json');
  if (fs.existsSync(buildMetaSrc)) {
    fs.copyFileSync(buildMetaSrc, path.join(OUT, 'build-meta.json'));
    log('build-meta.json copiado junto al .exe');
  }

  log(`Listo: ${OUT}`);
  log(`Cliente: copie .env junto a ${EXE_NAME}`);
}

main().catch((err) => {
  console.error('[dist:client]', err);
  process.exit(1);
});
