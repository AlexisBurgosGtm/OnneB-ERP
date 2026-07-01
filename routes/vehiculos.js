const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isVehiculoTipoValid, normalizeVehiculoTipo } = require('../lib/vehiculos-tipos');
const { vehiculoTieneMovimientos } = require('../lib/vehiculos-movimientos');

/** ~512 KB binario → ~1 MB hex */
const FOTO_MAX_HEX_LEN = 2_000_000;

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
  { name: 'FOTO', type: 'varcharmax' },
];

const VEHICULO_WRITE_FIELDS = VEHICULO_FIELDS.map((f) => f.name);

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

function requireEmpNit(req, res) {
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    return null;
  }
  return empnit;
}

function parseCodvehiculo(raw) {
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

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

function normalizeFotoField(data) {
  if (data.FOTO === undefined) return null;
  if (data.FOTO === null || data.FOTO === '') {
    data.FOTO = null;
    return null;
  }
  const hex = String(data.FOTO).trim().replace(/^0x/i, '').replace(/\s/g, '');
  if (!hex) {
    data.FOTO = null;
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    return 'FOTO debe ser una cadena hexadecimal válida';
  }
  if (hex.length > FOTO_MAX_HEX_LEN) {
    return 'La foto es demasiado grande (máx. 512 KB)';
  }
  data.FOTO = hex.toUpperCase();
  return null;
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
  const errFoto = normalizeFotoField(data);
  if (errFoto) return errFoto;
  return validatePlacaUnica(pool, empnit, data);
}

async function validateUpdateVehiculo(pool, empnit, data, _req, codvehiculo) {
  const errTipo = validateTipo(data);
  if (errTipo) return errTipo;
  const errFoto = normalizeFotoField(data);
  if (errFoto) return errFoto;
  return validatePlacaUnica(pool, empnit, data, codvehiculo);
}

async function validateDeleteVehiculo(pool, empnit, codvehiculo) {
  if (await vehiculoTieneMovimientos(pool, empnit, codvehiculo)) {
    return 'No se puede eliminar: el vehículo tiene registros de kilometraje o servicio mecánica';
  }
  return null;
}

const router = createCatalogoRouter({
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
  validateDelete: validateDeleteVehiculo,
});

router.get('/:codvehiculo', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { isDbConfigured } = require('../config/database');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codvehiculo = parseCodvehiculo(req.params.codvehiculo);
  if (codvehiculo === null) return res.status(400).json({ error: 'Código de vehículo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, codvehiculo)
      .query(`
        SELECT
          CODVEHICULO, PLACA, DESCRIPCION, MARCA, LINEA, MODELO, TIPO, CHASIS, MOTOR,
          NIT, TITULAR, KILOMETRAJE_INICIAL, KILOMETRAJE_ACTUAL, F_ACEITE, F_SERVICIO, FOTO
        FROM dbo.VEHICULOS
        WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
      `);
    const row = result.recordset[0];
    if (!row) return res.status(404).json({ error: 'Vehículo no encontrado' });
    res.json(row);
  } catch (err) {
    console.warn('[API GET /vehiculos/:codvehiculo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codvehiculo/historial', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { isDbConfigured } = require('../config/database');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = requireEmpNit(req, res);
  if (!empnit) return;
  const codvehiculo = parseCodvehiculo(req.params.codvehiculo);
  if (codvehiculo === null) return res.status(400).json({ error: 'Código de vehículo inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const vehResult = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, codvehiculo)
      .query(`
        SELECT CODVEHICULO, PLACA, DESCRIPCION, MARCA, LINEA, TIPO, KILOMETRAJE_ACTUAL
        FROM dbo.VEHICULOS
        WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
      `);
    const vehiculo = vehResult.recordset[0];
    if (!vehiculo) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const kmResult = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, codvehiculo)
      .query(`
        SELECT
          k.FECHA,
          k.KMS_INICIAL,
          k.KMS_FINAL,
          k.KMS_RECORRIDO,
          k.GALONES_COMBUSTIBLE,
          k.IMPORTE_COMBUSTIBLE,
          k.TIPO_COMBUSTIBLE,
          k.VIATICOS,
          k.OBS,
          e.NOMEMPLEADO,
          p.PLATAFORMA AS PLATAFORMA_NOMBRE,
          p.NOPLACA AS PLATAFORMA_PLACA
        FROM dbo.VEHICULOS_KILOMETRAJES k
        LEFT JOIN dbo.Empleados e
          ON k.EMPNIT = e.EMPNIT AND k.CODEMP = e.CODEMPLEADO
        LEFT JOIN dbo.VEHICULOS_PLATAFORMAS p
          ON k.EMPNIT = p.EMPNIT AND k.CODPLATAFORMA = p.CODPLATAFORMA
        WHERE k.EMPNIT = @EMPNIT AND k.CODVEHICULO = @CODVEHICULO
        ORDER BY k.FECHA ASC, k.ID ASC
      `);

    const mecResult = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODVEHICULO', sql.Int, codvehiculo)
      .query(`
        SELECT FECHA, FALLA_REPORTADA, SERVICIO_REALIZADO, IMPORTE, OBS
        FROM dbo.VEHICULOS_MECANICA
        WHERE EMPNIT = @EMPNIT AND CODVEHICULO = @CODVEHICULO
        ORDER BY FECHA ASC, ID ASC
      `);

    res.json({
      vehiculo,
      kilometrajes: kmResult.recordset,
      mecanica: mecResult.recordset,
      empnit,
    });
  } catch (err) {
    console.warn('[API GET /vehiculos/:codvehiculo/historial]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
