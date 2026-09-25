/**
 * Configuración MS SQL Server desde variables de entorno (.env)
 */
function parseServer(raw) {
  let server = String(raw || '').trim();
  if (!server) return { server: '', instanceName: null };
  // Normaliza host\\INSTANCE → host\INSTANCE
  server = server.replace(/\\\\/g, '\\');
  const m = server.match(/^([^\\/]+)[\\/]+(.+)$/);
  if (m) {
    return {
      server: m[1].trim(),
      instanceName: String(m[2] || '')
        .replace(/^\\+/, '')
        .trim() || null,
    };
  }
  return { server, instanceName: null };
}

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function envInt(name, fallback) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * host\INSTANCIA | host,puerto | host\INSTANCIA,puerto
 * Igual que .env / SSMS / ODBC. Una barra en COMMUNITY es válida.
 */
function parseServerEndpoint(raw) {
  let s = String(raw || '').trim().replace(/^tcp:/i, '');
  if (!s) return { server: '', instanceName: null, port: undefined };

  const instPort = s.match(/^(.+?)\\([^,\\]+)\s*,\s*(\d+)\s*$/i);
  if (instPort) {
    return {
      server: instPort[1].trim(),
      instanceName: null,
      port: parseInt(instPort[3], 10),
    };
  }

  const hostPort = s.match(/^([^,\s\\]+)\s*,\s*(\d+)\s*$/);
  if (hostPort) {
    return {
      server: hostPort[1].trim(),
      instanceName: null,
      port: parseInt(hostPort[2], 10),
    };
  }

  s = s.replace(/\\\\/g, '\\');
  const { server, instanceName } = parseServer(s);
  return { server, instanceName, port: undefined };
}

/**
 * Misma configuración mssql para .env local y conexiones remotas (COMMUNITY_EMPRESAS_SYNC).
 */
function buildDbConfig(params) {
  const rawServer = params.rawServer ?? params.server;
  const database = String(params.database ?? '').trim();
  const user = String(params.user ?? '').trim();
  const password = params.password;

  if (!rawServer || !database || !user || password === undefined) {
    return null;
  }

  const endpoint = parseServerEndpoint(rawServer);
  const { server, instanceName } = endpoint;
  let port = endpoint.port;

  if (port == null) {
    const portRaw = params.port ?? process.env.DB_PORT;
    const hasExplicitPort = String(portRaw || '').trim() !== '';
    const forcePort =
      params.forcePort !== undefined ? Boolean(params.forcePort) : envBool('DB_FORCE_PORT', false);
    port =
      instanceName && !forcePort
        ? undefined
        : hasExplicitPort
          ? parseInt(String(portRaw), 10) || 1433
          : instanceName
            ? undefined
            : 1433;
  }

  const config = {
    server,
    database,
    user,
    password,
    connectionTimeout:
      params.connectionTimeout ?? envInt('DB_CONNECTION_TIMEOUT', 15000),
    requestTimeout: params.requestTimeout ?? envInt('DB_REQUEST_TIMEOUT', 60000),
    pool: {
      max: params.poolMax ?? envInt('DB_POOL_MAX', 20),
      min: params.poolMin ?? envInt('DB_POOL_MIN', 1),
      idleTimeoutMillis: params.poolIdle ?? envInt('DB_POOL_IDLE', 60000),
    },
    options: {
      encrypt:
        params.encrypt !== undefined ? Boolean(params.encrypt) : envBool('DB_ENCRYPT', false),
      trustServerCertificate:
        params.trustServerCertificate !== undefined
          ? Boolean(params.trustServerCertificate)
          : envBool('DB_TRUST_SERVER_CERTIFICATE', true),
      enableArithAbort: true,
      connectTimeout:
        params.connectTimeout ?? envInt('DB_CONNECTION_TIMEOUT', 15000),
    },
  };

  // Puerto TCP explícito: conexión directa (evita SQL Browser / UDP 1434, común en VPN).
  if (port != null && Number.isFinite(port)) {
    config.port = port;
  } else if (instanceName) {
    config.options.instanceName = instanceName;
  }

  return config;
}

function getDbConfig() {
  return buildDbConfig({
    rawServer: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
}

function isDbConfigured() {
  return getDbConfig() !== null;
}

module.exports = {
  getDbConfig,
  buildDbConfig,
  isDbConfigured,
  parseServer,
  parseServerEndpoint,
};
