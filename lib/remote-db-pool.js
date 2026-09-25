const sql = require('mssql');
const { buildDbConfig } = require('../config/database');
const { isUpdateDbConfigured } = require('../config/update-database');
const { getUpdateDbPool } = require('./update-db-pool');
const { getAppToken } = require('./app-token');
const { instanceLookup } = require('tedious/lib/instance-lookup');

const remotePools = new Map();
const remoteConnecting = new Map();

function isPoolAlive(pool) {
  return Boolean(pool && pool.connected && !pool.connecting);
}

async function closePoolQuietly(pool) {
  if (!pool) return;
  try {
    await pool.close();
  } catch {
    /* ignore */
  }
}

function buildRemoteDbConfig(row, overrides = {}) {
  const config = buildDbConfig({
    rawServer: row.SERVER_IP,
    database: row.SERVER_DB,
    user: row.SERVER_USER,
    password: row.SERVER_PASS == null ? '' : String(row.SERVER_PASS),
    connectionTimeout: 60000,
    connectTimeout: 60000,
    ...overrides,
  });
  if (!config) {
    throw new Error('Datos de conexión remota incompletos en COMMUNITY_EMPRESAS_SYNC');
  }
  return config;
}

async function resolveInstanceTcpPort(server, instanceName) {
  return instanceLookup({
    server,
    instanceName,
    timeout: 5000,
    retries: 4,
    signal: AbortSignal.timeout(25000),
  });
}

async function fetchRemoteSyncRow(empnit) {
  const nit = String(empnit || '').trim();
  if (!nit) throw new Error('EMPNIT requerido para conexión remota');

  const token = getAppToken();
  if (!token) throw new Error('TOKEN de instalación no configurado');

  if (!isUpdateDbConfigured()) {
    throw new Error('Base de datos de actualizaciones no configurada (UPDATE_* en .env)');
  }

  const hostPool = await getUpdateDbPool();
  const result = await hostPool
    .request()
    .input('TOKEN', sql.VarChar(100), token)
    .input('EMPNIT', sql.VarChar(50), nit)
    .query(`
      SELECT TOP 1
        LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50)))) AS EMPNIT,
        LTRIM(RTRIM(ISNULL(EMPNOMBRE, ''))) AS EMPNOMBRE,
        LTRIM(RTRIM(ISNULL(SERVER_IP, ''))) AS SERVER_IP,
        LTRIM(RTRIM(ISNULL(SERVER_DB, ''))) AS SERVER_DB,
        LTRIM(RTRIM(ISNULL(SERVER_USER, ''))) AS SERVER_USER,
        SERVER_PASS
      FROM dbo.COMMUNITY_EMPRESAS_SYNC
      WHERE LTRIM(RTRIM(CAST(TOKEN AS VARCHAR(100)))) = LTRIM(RTRIM(@TOKEN))
        AND UPPER(LTRIM(RTRIM(CAST(EMPNIT AS VARCHAR(50))))) = UPPER(LTRIM(RTRIM(@EMPNIT)))
        AND NULLIF(LTRIM(RTRIM(SERVER_IP)), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(SERVER_DB)), '') IS NOT NULL
        AND NULLIF(LTRIM(RTRIM(SERVER_USER)), '') IS NOT NULL
    `);

  const row = result.recordset?.[0];
  if (!row) {
    throw new Error('No hay datos de conexión remota para esta empresa en COMMUNITY_EMPRESAS_SYNC');
  }
  return row;
}

function formatRemoteConnectTarget(config) {
  const host = config?.server || '?';
  const port = config?.port ? `:${config.port}` : '';
  const inst = config?.options?.instanceName ? `\\${config.options.instanceName}` : '';
  const db = config?.database || '?';
  return `${host}${port}${inst} / ${db}`;
}

async function tryConnectPool(config, empnit) {
  const pool = new sql.ConnectionPool(config);
  pool.on('error', (err) => {
    console.warn('[DB remota] pool error:', err?.message || err);
    const key = String(empnit || '').trim().toUpperCase();
    if (remotePools.get(key) === pool) remotePools.delete(key);
  });
  await pool.connect();
  return pool;
}

async function createRemoteDbPool(empnit) {
  const row = await fetchRemoteSyncRow(empnit);
  let dbConfig = buildRemoteDbConfig(row);
  const target = formatRemoteConnectTarget(dbConfig);
  const errors = [];

  // Instancia nombrada sin puerto: intentar SQL Browser → TCP directo (mejor en VPN).
  if (dbConfig.options?.instanceName && !dbConfig.port) {
    const host = dbConfig.server;
    const inst = dbConfig.options.instanceName;
    try {
      const tcpPort = await resolveInstanceTcpPort(host, inst);
      console.info(`[DB remota] SQL Browser ${host}\\${inst} → TCP ${tcpPort}`);
      dbConfig = buildRemoteDbConfig(row, { port: tcpPort, forcePort: true });
      delete dbConfig.options.instanceName;
    } catch (browserErr) {
      console.warn('[DB remota] SQL Browser:', browserErr?.message || browserErr);
      errors.push(`SQL Browser: ${browserErr?.message || browserErr}`);
    }
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const pool = await tryConnectPool(dbConfig, empnit);
      if (attempt > 1) {
        console.warn(`[DB remota] reconectado en intento ${attempt} (${formatRemoteConnectTarget(dbConfig)})`);
      }
      return pool;
    } catch (err) {
      errors.push(err?.message || String(err));
      console.warn(
        `[DB remota] conexión fallida (${formatRemoteConnectTarget(dbConfig)}) intento ${attempt}/3:`,
        err?.message || err
      );
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
      }
    }
  }

  const needsPortHint =
    dbConfig.options?.instanceName ||
    /Locating Server\/Instance|SQL Browser|EINSTLOOKUP/i.test(errors.join(' '));
  const portHint = needsPortHint
    ? ' En SSMS (conectado), ejecute: SELECT local_tcp_port FROM sys.dm_exec_connections WHERE session_id=@@SPID; ' +
      'Luego ponga SERVER_IP como 172.25.250.76,PUERTO o 172.25.250.76\\SQLEXPRESS,PUERTO en COMMUNITY_EMPRESAS_SYNC.'
    : '';

  throw new Error(
    `No se pudo conectar al servidor remoto (${formatRemoteConnectTarget(dbConfig)}). ${errors.join(' | ')}.${portHint}`
  );
}

async function getRemoteDbPool(empnit) {
  const nit = String(empnit || '').trim();
  const key = nit.toUpperCase();
  if (!key) throw new Error('EMPNIT requerido para conexión remota');

  const existing = remotePools.get(key);
  if (isPoolAlive(existing)) return existing;

  if (remoteConnecting.has(key)) return remoteConnecting.get(key);

  const promise = (async () => {
    await closePoolQuietly(existing);
    remotePools.delete(key);
    const pool = await createRemoteDbPool(nit);
    remotePools.set(key, pool);
    return pool;
  })();

  remoteConnecting.set(key, promise);
  try {
    return await promise;
  } finally {
    remoteConnecting.delete(key);
  }
}

async function closeRemoteDbPool(empnit) {
  const key = String(empnit || '').trim().toUpperCase();
  const pool = remotePools.get(key);
  remotePools.delete(key);
  await closePoolQuietly(pool);
}

module.exports = {
  fetchRemoteSyncRow,
  getRemoteDbPool,
  closeRemoteDbPool,
  buildRemoteDbConfig,
};
