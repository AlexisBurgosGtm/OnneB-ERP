const sql = require('mssql');
const {
  SETTING_OPCION,
  getSettingSino,
  getSettingConcre,
} = require('./settings');

const CODTIPO_EMPLEADO_ADMIN = 1;

function isSuperUserReq(req) {
  return String(req.query.superUser || req.headers['x-super-user'] || '').trim() === '1';
}

async function resolveReqIsAdmin(pool, empnit, req) {
  if (isSuperUserReq(req)) return true;
  const cod = parseInt(
    req.query.codempleado || req.body?.codempleado || req.headers['x-cod-empleado'],
    10
  );
  if (!Number.isFinite(cod) || cod <= 0) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, cod)
    .query(`
      SELECT TOP 1 CODTIPOEMPLEADO
      FROM dbo.Empleados
      WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
    `);
  return Number(result.recordset[0]?.CODTIPOEMPLEADO) === CODTIPO_EMPLEADO_ADMIN;
}

/** true si el usuario no admin debe usar solo el cobro predeterminado. */
async function isConcreLockedForReq(pool, empnit, req) {
  const bloquea = await getSettingSino(pool, SETTING_OPCION.BLOQUEA_CONTADO_CREDITO_EN_VENTAS);
  if (bloquea !== 'SI') return false;
  const isAdmin = await resolveReqIsAdmin(pool, empnit, req);
  return !isAdmin;
}

async function getDefaultConcreVentas(pool) {
  return getSettingConcre(pool, SETTING_OPCION.COBRO_PREDETERMINADO);
}

function normalizeConcreInput(value) {
  const v = String(value || 'CON').trim().toUpperCase();
  return v === 'CRE' ? 'CRE' : 'CON';
}

/**
 * Si la política aplica, fuerza CONCRE al predeterminado o rechaza con error.
 * @returns {Promise<string>} CON | CRE
 */
async function enforceConcreVentasPolicy(pool, empnit, req, concreInput) {
  const normalized = normalizeConcreInput(concreInput);
  const locked = await isConcreLockedForReq(pool, empnit, req);
  if (!locked) return normalized;
  const expected = await getDefaultConcreVentas(pool);
  if (normalized !== expected) {
    const err = new Error(
      'No tiene permiso para cambiar contado/crédito. Use el tipo de cobro predeterminado.'
    );
    err.statusCode = 403;
    throw err;
  }
  return expected;
}

module.exports = {
  CODTIPO_EMPLEADO_ADMIN,
  resolveReqIsAdmin,
  isConcreLockedForReq,
  getDefaultConcreVentas,
  normalizeConcreInput,
  enforceConcreVentasPolicy,
};