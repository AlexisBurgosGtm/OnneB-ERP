const express = require('express');
const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');

const STATUS_OK = ['PENDIENTE', 'COBRADO'];

const ENSURE_TABLE_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'CONTROL_FLETES' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.CONTROL_FLETES (
    ID INT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    EMPNIT VARCHAR(20) NOT NULL,
    MES INT NOT NULL,
    ANIO INT NOT NULL,
    NOPEDIDO VARCHAR(50) NULL,
    FECHA_ING DATE NULL,
    FECHA_VEN DATE NULL,
    UGC DECIMAL(18, 4) NULL,
    TROPICAL DECIMAL(18, 4) NULL,
    COL_5800 DECIMAL(18, 4) NULL,
    HORCALZA DECIMAL(18, 4) NULL,
    M_BCO DECIMAL(18, 4) NULL,
    M_XTRA DECIMAL(18, 4) NULL,
    M_GRIS DECIMAL(18, 4) NULL,
    LEVAN DECIMAL(18, 4) NULL,
    MAX_P DECIMAL(18, 4) NULL,
    PLTA VARCHAR(50) NULL,
    PLACA VARCHAR(30) NULL,
    TR_FLET DECIMAL(18, 4) NULL,
    COSTO DECIMAL(18, 4) NULL,
    ABASTO VARCHAR(200) NULL,
    FLETE DECIMAL(18, 4) NULL,
    SALDO DECIMAL(18, 4) NULL,
    STATUS VARCHAR(15) NOT NULL CONSTRAINT DF_CONTROL_FLETES_STATUS DEFAULT ('PENDIENTE')
  );
  CREATE INDEX IX_CONTROL_FLETES_EMP_PERIODO ON dbo.CONTROL_FLETES (EMPNIT, ANIO, MES);
  CREATE INDEX IX_CONTROL_FLETES_EMP_STATUS ON dbo.CONTROL_FLETES (EMPNIT, STATUS);
END;
`;

let schemaEnsured = false;

function parseIntOrNull(raw, min, max) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  if (min != null && n < min) return null;
  if (max != null && n > max) return null;
  return n;
}

function normalizeStatus(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  return STATUS_OK.includes(s) ? s : null;
}

function validatePayload(data) {
  const mes = parseIntOrNull(data.MES, 1, 12);
  if (mes == null) return 'MES inválido (1–12)';
  data.MES = mes;
  const anio = parseIntOrNull(data.ANIO, 2000, 2100);
  if (anio == null) return 'AÑO inválido';
  data.ANIO = anio;
  const st = normalizeStatus(data.STATUS || 'PENDIENTE');
  if (!st) return 'STATUS inválido (PENDIENTE, COBRADO)';
  data.STATUS = st;
  return null;
}

async function ensureSchema(pool) {
  if (schemaEnsured) return;
  await pool.request().query(ENSURE_TABLE_SQL);
  schemaEnsured = true;
}

const router = express.Router();

router.use(async (req, res, next) => {
  if (!isDbConfigured()) return next();
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureSchema(pool);
  } catch (err) {
    console.warn('[API /control-fletes ensure schema]', err.message);
  }
  next();
});

const FIELD_DEFS = [
  { name: 'MES', type: 'int', required: true },
  { name: 'ANIO', type: 'int', required: true },
  { name: 'NOPEDIDO', type: 'varchar' },
  { name: 'FECHA_ING', type: 'date' },
  { name: 'FECHA_VEN', type: 'date' },
  { name: 'UGC', type: 'decimal' },
  { name: 'TROPICAL', type: 'decimal' },
  { name: 'COL_5800', type: 'decimal' },
  { name: 'HORCALZA', type: 'decimal' },
  { name: 'M_BCO', type: 'decimal' },
  { name: 'M_XTRA', type: 'decimal' },
  { name: 'M_GRIS', type: 'decimal' },
  { name: 'LEVAN', type: 'decimal' },
  { name: 'MAX_P', type: 'decimal' },
  { name: 'PLTA', type: 'varchar' },
  { name: 'PLACA', type: 'varchar' },
  { name: 'TR_FLET', type: 'decimal' },
  { name: 'COSTO', type: 'decimal' },
  { name: 'ABASTO', type: 'varchar' },
  { name: 'FLETE', type: 'decimal' },
  { name: 'SALDO', type: 'decimal' },
  { name: 'STATUS', type: 'varchar', required: true },
];

const INSERT_FIELDS = FIELD_DEFS.map((f) => f.name);

router.use(
  createCatalogoRouter({
    logName: 'control-fletes',
    entityLabel: 'Control de flete',
    table: 'CONTROL_FLETES',
    orderBy: 'FECHA_ING DESC, ID DESC',
    idColumn: 'ID',
    idType: 'int',
    idRouteParam: 'id',
    autoId: false,
    identityColumn: true,
    listColumns: ['ID', ...INSERT_FIELDS],
    fields: FIELD_DEFS,
    insertFields: INSERT_FIELDS,
    updateFields: INSERT_FIELDS,
    buildListFilter(req) {
      const parts = [];
      const binds = [];
      const mes = parseIntOrNull(req.query.mes, 1, 12);
      const anio = parseIntOrNull(req.query.anio, 2000, 2100);
      const status = String(req.query.status || '').trim().toUpperCase();
      if (mes != null) {
        parts.push('AND MES = @FILTRO_MES');
        binds.push((request, sqlTypes) => request.input('FILTRO_MES', sqlTypes.Int, mes));
      }
      if (anio != null) {
        parts.push('AND ANIO = @FILTRO_ANIO');
        binds.push((request, sqlTypes) => request.input('FILTRO_ANIO', sqlTypes.Int, anio));
      }
      if (status && status !== 'TODOS' && STATUS_OK.includes(status)) {
        parts.push('AND STATUS = @FILTRO_STATUS');
        binds.push((request, sqlTypes) => request.input('FILTRO_STATUS', sqlTypes.VarChar, status));
      }
      if (!parts.length) return null;
      return {
        sql: parts.join(' '),
        bind(request, sqlTypes) {
          binds.forEach((fn) => fn(request, sqlTypes));
        },
      };
    },
    async validateInsert(_pool, _empnit, data) {
      return validatePayload(data);
    },
    async validateUpdate(_pool, _empnit, data) {
      return validatePayload(data);
    },
  })
);

module.exports = router;
