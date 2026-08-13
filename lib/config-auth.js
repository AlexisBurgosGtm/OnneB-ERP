const { SETTING_OPCION, verifySettingPass, getSettingSino } = require('./settings');

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

/**
 * Gate de eliminación de registros/documentos clave.
 * Si SOLICITA AUTORIZACIONES = SI, no exige clave (la UI ya esperó autorización).
 * Si = NO, exige clave admin.
 */
async function assertEliminacionRegistro(pool, pass) {
  const solicita = await getSettingSino(pool, SETTING_OPCION.SOLICITA_AUTORIZACIONES);
  if (String(solicita || 'NO').trim().toUpperCase() === 'SI') {
    return;
  }
  await assertAdminPass(pool, pass);
}

module.exports = {
  ADMIN_CONFIG_ID,
  SETTING_OPCION,
  verifyAdminPass,
  assertAdminPass,
  assertEliminacionRegistro,
};
