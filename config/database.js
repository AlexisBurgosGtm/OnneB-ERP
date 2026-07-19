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

function getDbConfig() {
  const rawServer = process.env.DB_SERVER;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!rawServer || !database || !user || password === undefined) {
    return null;
  }

  const { server, instanceName } = parseServer(rawServer);
  const hasExplicitPort = String(process.env.DB_PORT || '').trim() !== '';
  // Instancia con nombre: no forzar 1433 (usa SQL Browser / puerto dinámico).
  // Solo aplicar puerto si el usuario lo definió y NO hay instanceName, o si
  // DB_FORCE_PORT=true.
  const forcePort = envBool('DB_FORCE_PORT', false);
  const port =
    instanceName && !forcePort
      ? undefined
      : hasExplicitPort
        ? envInt('DB_PORT', 1433)
        : instanceName
          ? undefined
          : 1433;

  const config = {
    server,
    database,
    user,
    password,
    connectionTimeout: envInt('DB_CONNECTION_TIMEOUT', 15000),
    requestTimeout: envInt('DB_REQUEST_TIMEOUT', 60000),
    pool: {
      max: envInt('DB_POOL_MAX', 20),
      min: envInt('DB_POOL_MIN', 1),
      idleTimeoutMillis: envInt('DB_POOL_IDLE', 60000),
    },
    options: {
      encrypt: envBool('DB_ENCRYPT', false),
      trustServerCertificate: envBool('DB_TRUST_SERVER_CERTIFICATE', true),
      enableArithAbort: true,
      connectTimeout: envInt('DB_CONNECTION_TIMEOUT', 15000),
    },
  };

  if (port != null) {
    config.port = port;
  }
  if (instanceName) {
    config.options.instanceName = instanceName;
  }

  return config;
}

function isDbConfigured() {
  return getDbConfig() !== null;
}

module.exports = { getDbConfig, isDbConfigured, parseServer };
