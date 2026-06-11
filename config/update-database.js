/**
 * Base de datos externa de actualizaciones (variables UPDATE_* en .env)
 */
function getUpdateDbConfig() {
  const server = process.env.UPDATE_SERVER;
  const database = process.env.UPDATE_DB;
  const user = process.env.UPDATE_USER;
  const password = process.env.UPDATE_PASSWORD;

  if (!server || !database || !user || password === undefined) {
    return null;
  }

  return {
    server,
    port: parseInt(process.env.UPDATE_PORT || '1433', 10),
    database,
    user,
    password,
    options: {
      encrypt: (process.env.UPDATE_ENCRYPT || 'true').toLowerCase() === 'true',
      trustServerCertificate:
        (process.env.UPDATE_TRUST_SERVER_CERTIFICATE || 'true').toLowerCase() === 'true',
    },
  };
}

function isUpdateDbConfigured() {
  return getUpdateDbConfig() !== null;
}

module.exports = { getUpdateDbConfig, isUpdateDbConfigured };
