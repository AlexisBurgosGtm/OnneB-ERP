/**
 * Prueba de conexión remota (diagnóstico). Uso: node scripts/test-remote-connection.js
 * No imprime contraseñas.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const sql = require('mssql');
const { instanceLookup } = require('tedious/lib/instance-lookup');
const { getUpdateDbPool } = require('../lib/update-db-pool');
const { buildRemoteDbConfig } = require('../lib/remote-db-pool');

async function tryConnect(label, config) {
  const pool = new sql.ConnectionPool(config);
  try {
    await pool.connect();
    const r = await pool.request().query('SELECT @@SERVERNAME AS srv, DB_NAME() AS db');
    await pool.close();
    return { ok: true, label, row: r.recordset[0] };
  } catch (err) {
    try {
      await pool.close();
    } catch {
      /* ignore */
    }
    return { ok: false, label, error: err.message, code: err.code };
  }
}

async function main() {
  const token = String(process.env.TOKEN || '').replace(/'/g, '').trim();
  const hostPool = await getUpdateDbPool();
  const full = await hostPool.request().input('TOKEN', sql.VarChar(100), token).query(`
    SELECT TOP 1 EMPNIT, EMPNOMBRE, SERVER_IP, SERVER_DB, SERVER_USER, SERVER_PASS
    FROM dbo.COMMUNITY_EMPRESAS_SYNC
    WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
      AND SERVER_IP LIKE '%172.25.250.76%'
  `);
  const row = full.recordset[0];
  if (!row) {
    console.error('No hay fila COMMUNITY con 172.25.250.76');
    process.exit(1);
  }

  console.log('SERVER_IP:', JSON.stringify(row.SERVER_IP));
  console.log('DB:', row.SERVER_DB, 'User:', row.SERVER_USER);

  let browserPort = null;
  try {
    browserPort = await instanceLookup({
      server: '172.25.250.76',
      instanceName: 'SQLEXPRESS',
      timeout: 5000,
      retries: 3,
      signal: AbortSignal.timeout(20000),
    });
    console.log('SQL Browser puerto TCP:', browserPort);
  } catch (err) {
    console.log('SQL Browser falló:', err.message);
  }

  const remoteCfg = buildRemoteDbConfig(row);
  const tests = [];
  tests.push(await tryConnect('buildRemoteDbConfig', remoteCfg));

  if (browserPort) {
    const cfgPort = {
      ...remoteCfg,
      server: '172.25.250.76',
      port: browserPort,
      options: { ...remoteCfg.options },
    };
    delete cfgPort.options.instanceName;
    tests.push(await tryConnect(`TCP directo puerto ${browserPort}`, cfgPort));

    const cfgPortEnc = {
      ...cfgPort,
      options: { ...cfgPort.options, encrypt: true, trustServerCertificate: true },
    };
    tests.push(await tryConnect(`TCP ${browserPort} encrypt=true`, cfgPortEnc));
  }

  const csVariants = [
    `Server=172.25.250.76\\SQLEXPRESS;Database=${row.SERVER_DB};User Id=${row.SERVER_USER};Password=${row.SERVER_PASS};Encrypt=false;TrustServerCertificate=true;Connect Timeout=30`,
    `Server=tcp:172.25.250.76\\SQLEXPRESS;Database=${row.SERVER_DB};User Id=${row.SERVER_USER};Password=${row.SERVER_PASS};Encrypt=false;TrustServerCertificate=true;Connect Timeout=30`,
    `Server=172.25.250.76\\SQLEXPRESS;Database=${row.SERVER_DB};User Id=${row.SERVER_USER};Password=${row.SERVER_PASS};Encrypt=true;TrustServerCertificate=true;Connect Timeout=30`,
  ];
  for (const cs of csVariants) {
    const label = cs.includes('tcp:') ? 'parseConnectionString tcp:' : cs.includes('Encrypt=true') ? 'parseConnectionString encrypt' : 'parseConnectionString';
    try {
      const cfg = sql.ConnectionPool.parseConnectionString(cs);
      tests.push(await tryConnect(label, cfg));
    } catch (err) {
      tests.push({ ok: false, label: `${label} (parse)`, error: err.message });
    }
  }

  console.log('\nResults:');
  for (const t of tests) {
    console.log(JSON.stringify(t));
  }
  process.exit(tests.some((t) => t.ok) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
