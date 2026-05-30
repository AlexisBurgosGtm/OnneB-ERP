/**
 * Configuración MS SQL Server desde variables de entorno (.env)
 */
function getDbConfig() {
  const server = process.env.DB_SERVER;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!server || !database || !user || password === undefined) {
    return null;
  }

  return {
    server,
    port: parseInt(process.env.DB_PORT || '1433', 10),
    database,
    user,
    password,
    options: {
      encrypt: (process.env.DB_ENCRYPT || 'true').toLowerCase() === 'true',
      trustServerCertificate:
        (process.env.DB_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
    },
  };
}

function isDbConfigured() {
  return getDbConfig() !== null;
}

module.exports = { getDbConfig, isDbConfigured };
