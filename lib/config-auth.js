const { SETTING_OPCION, verifySettingPass } = require('./settings');

const ADMIN_CONFIG_ID = 2;

async function verifyAdminPass(pool, pass, _configId = ADMIN_CONFIG_ID) {
  return verifySettingPass(pool, pass, SETTING_OPCION.CLAVE_ADMIN);
}

async function assertAdminPass(pool, pass, _configId = ADMIN_CONFIG_ID) {
  const ok = await verifyAdminPass(pool, pass);
  if (!ok) {
    const err = new Error('Clave de administrador incorrecta');
    err.statusCode = 401;
    throw err;
  }
}

module.exports = {
  ADMIN_CONFIG_ID,
  SETTING_OPCION,
  verifyAdminPass,
  assertAdminPass,
};
