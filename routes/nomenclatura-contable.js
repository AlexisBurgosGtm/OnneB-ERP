const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const sql = require('mssql');

const ESTFIN_VALUES = ['ACTIVO', 'PASIVO', 'CAPITAL', 'INGRESOS', 'GASTOS', 'COSTOS'];
const TIPOEF_VALUES = ['BG', 'ER'];
const DA_VALUES = ['D', 'A'];
const PD_VALUES = ['P', 'D'];
const ACTIVO_VALUES = ['SI', 'NO'];

function normUpper(value, allowed, fallback = null) {
  const s = String(value ?? '').trim().toUpperCase();
  if (!s) return fallback;
  return allowed.includes(s) ? s : null;
}

async function codcuentaExists(pool, empnit, codcuenta, excludeId = null) {
  const cod = String(codcuenta ?? '').trim();
  if (!cod) return false;
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCUENTA', sql.VarChar, cod);
  let excludeSql = '';
  if (excludeId != null) {
    request.input('ID', sql.Int, excludeId);
    excludeSql = ' AND ID <> @ID';
  }
  const result = await request.query(`
    SELECT COUNT(*) AS cnt
    FROM dbo.CONTA_CUENTAS
    WHERE EMPNIT = @EMPNIT
      AND UPPER(LTRIM(RTRIM(CODCUENTA))) = UPPER(LTRIM(RTRIM(@CODCUENTA)))
      ${excludeSql}
  `);
  return Number(result.recordset[0]?.cnt) > 0;
}

async function codcuentaEnFormatos(pool, empnit, codcuenta) {
  const cod = String(codcuenta ?? '').trim();
  if (!cod) return 0;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCUENTA', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.CONTA_FORMATOS_PARTIDAS
      WHERE EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(CODCUENTA))) = UPPER(LTRIM(RTRIM(@CODCUENTA)))
    `);
  return Number(result.recordset[0]?.cnt) || 0;
}

function validateContaCuentaFields(data, { requireCodcuenta = true } = {}) {
  if (requireCodcuenta) {
    const codcuenta = String(data.CODCUENTA ?? '').trim();
    if (!codcuenta) return 'CODCUENTA es obligatorio';
  }
  if (!String(data.DESCRIPCION ?? '').trim()) return 'DESCRIPCION es obligatoria';

  const nivel = Number(data.NIVEL);
  if (Number.isNaN(nivel) || nivel < 1 || nivel > 9) {
    return 'NIVEL debe ser un entero entre 1 y 9';
  }
  data.NIVEL = nivel;

  const da = normUpper(data.DA, DA_VALUES);
  if (!da) return 'DA debe ser D (Deudora) o A (Acreedora)';
  data.DA = da;

  const pd = normUpper(data.PD, PD_VALUES);
  if (!pd) return 'PD debe ser P (Padre) o D (Detalle)';
  data.PD = pd;

  const estfin = normUpper(data.ESTFIN, ESTFIN_VALUES);
  if (!estfin) return `ESTFIN inválido (${ESTFIN_VALUES.join(', ')})`;
  data.ESTFIN = estfin;

  const tipoef = normUpper(data.TIPOEF, TIPOEF_VALUES);
  if (!tipoef) return 'TIPOEF debe ser BG (Balance General) o ER (Estado de Resultados)';
  data.TIPOEF = tipoef;

  const activo = normUpper(data.ACTIVO, ACTIVO_VALUES, 'SI');
  if (!activo) return 'ACTIVO debe ser SI o NO';
  data.ACTIVO = activo;

  return null;
}

async function validateInsertContaCuenta(pool, empnit, data) {
  const err = validateContaCuentaFields(data);
  if (err) return err;
  if (await codcuentaExists(pool, empnit, data.CODCUENTA)) {
    return `Ya existe la cuenta "${data.CODCUENTA}"`;
  }
  return null;
}

async function validateUpdateContaCuenta(pool, empnit, data, _req, idValue) {
  const err = validateContaCuentaFields(data, { requireCodcuenta: false });
  if (err) return err;
  if (data.CODCUENTA && (await codcuentaExists(pool, empnit, data.CODCUENTA, idValue))) {
    return `Ya existe otra cuenta con el código "${data.CODCUENTA}"`;
  }
  return null;
}

async function validateDeleteContaCuenta(pool, empnit, idValue) {
  const row = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, idValue)
    .query(`
      SELECT CODCUENTA FROM dbo.CONTA_CUENTAS
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  if (!row.recordset.length) return 'Cuenta no encontrada';
  const codcuenta = row.recordset[0].CODCUENTA;
  const used = await codcuentaEnFormatos(pool, empnit, codcuenta);
  if (used > 0) {
    return `No se puede eliminar: la cuenta está en ${used} partida(s) de formatos contables`;
  }
  return null;
}

module.exports = createCatalogoRouter({
  logName: 'nomenclatura-contable',
  entityLabel: 'Cuenta contable',
  table: 'CONTA_CUENTAS',
  orderBy: 'NIVEL, CODCUENTA',
  idColumn: 'ID',
  idType: 'int',
  idRouteParam: 'id',
  identityColumn: true,
  listColumns: [
    'ID',
    'CODCUENTA',
    'DESCRIPCION',
    'NIVEL',
    'DA',
    'PD',
    'ESTFIN',
    'TIPOEF',
    'ACTIVO',
  ],
  fields: [
    { name: 'CODCUENTA', type: 'varchar', required: true },
    { name: 'DESCRIPCION', type: 'varchar', required: true },
    { name: 'NIVEL', type: 'int', required: true },
    { name: 'DA', type: 'varchar', required: true },
    { name: 'PD', type: 'varchar', required: true },
    { name: 'ESTFIN', type: 'varchar', required: true },
    { name: 'TIPOEF', type: 'varchar', required: true },
    { name: 'ACTIVO', type: 'varchar', required: true },
  ],
  insertFields: ['CODCUENTA', 'DESCRIPCION', 'NIVEL', 'DA', 'PD', 'ESTFIN', 'TIPOEF', 'ACTIVO'],
  updateFields: ['DESCRIPCION', 'NIVEL', 'DA', 'PD', 'ESTFIN', 'TIPOEF', 'ACTIVO'],
  validateInsert: validateInsertContaCuenta,
  validateUpdate: validateUpdateContaCuenta,
  validateDelete: validateDeleteContaCuenta,
  requireAdminPassOnDelete: true,
});
