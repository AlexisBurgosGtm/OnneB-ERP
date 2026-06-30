const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isVehiculoTipoValid, normalizeVehiculoTipo } = require('../lib/vehiculos-tipos');

const VEHICULO_FIELDS = [
  { name: 'DESCRIPCION', type: 'varchar' },
  { name: 'MARCA', type: 'varchar' },
  { name: 'LINEA', type: 'varchar' },
  { name: 'MODELO', type: 'int' },
  { name: 'PLACA', type: 'varchar', required: true },
  { name: 'CHASIS', type: 'varchar' },
  { name: 'MOTOR', type: 'varchar' },
  { name: 'NIT', type: 'varchar' },
  { name: 'TITULAR', type: 'varchar' },
  { name: 'TIPO', type: 'varchar', required: true },
  { name: 'KILOMETRAJE_INICIAL', type: 'float' },
  { name: 'KILOMETRAJE_ACTUAL', type: 'float' },
  { name: 'F_ACEITE', type: 'varchar' },
  { name: 'F_SERVICIO', type: 'varchar' },
];

const VEHICULO_WRITE_FIELDS = VEHICULO_FIELDS.map((f) => f.name);

function validateTipo(data) {
  if (!isVehiculoTipoValid(data.TIPO)) {
    return 'TIPO debe ser SEDAN, PICKUP, CABEZAL o PLATAFORMA';
  }
  data.TIPO = normalizeVehiculoTipo(data.TIPO);
  return null;
}

function normalizePlaca(placa) {
  return String(placa || '').trim().toUpperCase();
}

async function findPlacaDuplicada(pool, empnit, placa, excludeCodvehiculo = null) {
  const normalized = normalizePlaca(placa);
  if (!normalized) return null;
  const request = pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('PLACA', sql.VarChar, normalized);
  let excludeSql = '';
  if (excludeCodvehiculo != null) {
    request.input('CODVEHICULO', sql.Int, excludeCodvehiculo);
    excludeSql = ' AND CODVEHICULO <> @CODVEHICULO';
  }
  const result = await request.query(`
    SELECT TOP 1 CODVEHICULO, PLACA
    FROM dbo.VEHICULOS
    WHERE EMPNIT = @EMPNIT
      AND UPPER(LTRIM(RTRIM(PLACA))) = @PLACA
      ${excludeSql}
  `);
  return result.recordset[0] || null;
}

async function validatePlacaUnica(pool, empnit, data, excludeCodvehiculo = null) {
  const normalized = normalizePlaca(data.PLACA);
  if (!normalized) return 'PLACA es obligatoria';
  data.PLACA = normalized;
  const dup = await findPlacaDuplicada(pool, empnit, normalized, excludeCodvehiculo);
  if (dup) {
    return `Ya existe un vehículo con la placa ${dup.PLACA} (código ${dup.CODVEHICULO})`;
  }
  return null;
}

async function validateInsertVehiculo(pool, empnit, data) {
  const errTipo = validateTipo(data);
  if (errTipo) return errTipo;
  return validatePlacaUnica(pool, empnit, data);
}

async function validateUpdateVehiculo(pool, empnit, data, _req, codvehiculo) {
  const errTipo = validateTipo(data);
  if (errTipo) return errTipo;
  return validatePlacaUnica(pool, empnit, data, codvehiculo);
}

module.exports = createCatalogoRouter({
  logName: 'vehiculos',
  entityLabel: 'Vehículo',
  table: 'VEHICULOS',
  orderBy: 'PLACA',
  idColumn: 'CODVEHICULO',
  idType: 'int',
  idRouteParam: 'codvehiculo',
  identityColumn: true,
  listColumns: [
    'CODVEHICULO',
    'PLACA',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'TIPO',
    'CHASIS',
    'MOTOR',
    'NIT',
    'TITULAR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
  ],
  fields: VEHICULO_FIELDS,
  insertFields: VEHICULO_WRITE_FIELDS,
  updateFields: VEHICULO_WRITE_FIELDS,
  validateInsert: validateInsertVehiculo,
  validateUpdate: validateUpdateVehiculo,
});
