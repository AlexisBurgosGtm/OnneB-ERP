const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');
const sql = require('mssql');

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

async function tipoDocCoddocExists(pool, empnit, coddoc) {
  const cod = String(coddoc ?? '').trim();
  if (!cod) return false;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND UPPER(LTRIM(RTRIM(CODDOC))) = UPPER(LTRIM(RTRIM(@CODDOC)))
    `);
  return Number(result.recordset[0]?.cnt) > 0;
}

async function tipoDocTieneMovimientos(pool, empnit, coddoc) {
  const cod = String(coddoc ?? '').trim();
  if (!cod) return 0;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, cod)
    .query(`
      SELECT COUNT(*) AS cnt
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND UPPER(LTRIM(RTRIM(CODDOC))) = UPPER(LTRIM(RTRIM(@CODDOC)))
    `);
  return Number(result.recordset[0]?.cnt) || 0;
}

async function validateInsertTipoDocumento(pool, empnit, data) {
  const coddoc = String(data.CODDOC ?? '').trim();
  if (!coddoc) return 'CODDOC es obligatorio';
  if (await tipoDocCoddocExists(pool, empnit, coddoc)) {
    return `Ya existe un tipo de documento con el código "${coddoc}"`;
  }
  return null;
}

async function validateDeleteTipoDocumento(pool, empnit, coddoc) {
  const movCount = await tipoDocTieneMovimientos(pool, empnit, coddoc);
  if (movCount > 0) {
    return `No se puede eliminar: existen ${movCount} movimiento(s) en documentos con este tipo`;
  }
  return null;
}

const DOC_FORM_FIELDS = [
  'DESDOC',
  'TIPODOC',
  'CORRELATIVO',
  'FORMATO',
  'TIPOM',
  'CODFORMATOCON',
  'CODFORMATOCRE',
];

const DOC_LIST_EXTRA = [
  'RESOLUCION',
  'AUTORIZACION',
  'FRASE1',
  'FRASE2',
  'FRASE3',
  'ACTIVO',
  'TIPOMOV',
  'CODFORMATO',
];

const router = createCatalogoRouter({
  logName: 'tipo-documentos',
  entityLabel: 'Tipo documento',
  table: 'TIPODOCUMENTOS',
  orderBy: 'DESDOC',
  idColumn: 'CODDOC',
  idType: 'varchar',
  idRouteParam: 'coddoc',
  autoId: false,
  listColumns: ['Id', 'CODDOC', ...DOC_FORM_FIELDS, ...DOC_LIST_EXTRA],
  fields: [
    { name: 'CODDOC', type: 'varchar', required: true },
    { name: 'DESDOC', type: 'varchar', required: true },
    { name: 'TIPODOC', type: 'varchar' },
    { name: 'CORRELATIVO', type: 'numeric' },
    { name: 'FORMATO', type: 'varchar' },
    { name: 'TIPOM', type: 'int' },
    { name: 'CODFORMATOCON', type: 'varchar' },
    { name: 'CODFORMATOCRE', type: 'varchar' },
    { name: 'ACTIVO', type: 'varchar' },
    { name: 'RESOLUCION', type: 'varchar' },
    { name: 'AUTORIZACION', type: 'varchar' },
    { name: 'FRASE1', type: 'varchar' },
    { name: 'FRASE2', type: 'varchar' },
    { name: 'FRASE3', type: 'varchar' },
    { name: 'TIPOMOV', type: 'varchar' },
    { name: 'CODFORMATO', type: 'varchar' },
  ],
  insertFields: ['CODDOC', ...DOC_FORM_FIELDS, 'ACTIVO'],
  updateFields: DOC_FORM_FIELDS,
  validateInsert: validateInsertTipoDocumento,
  validateDelete: validateDeleteTipoDocumento,
  requireAdminPassOnDelete: true,
});

router.get('/config-tipos', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool.request().query(`
      SELECT TIPODOC, DESCRIPCION
      FROM dbo.CONFIG_TIPODOCUMENTOS
      ORDER BY DESCRIPCION, TIPODOC
    `);
    const rows = result.recordset.map((r) => ({
      TIPODOC: String(r.TIPODOC ?? '').trim().toUpperCase(),
      DESCRIPCION: String(r.DESCRIPCION ?? r.TIPODOC ?? '').trim(),
    }));
    res.json({ rows });
  } catch (err) {
    console.warn('[API GET /tipo-documentos/config-tipos]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:coddoc/activo', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  }
  const coddoc = String(req.params.coddoc ?? '').trim();
  if (!coddoc) {
    return res.status(400).json({ error: 'CODDOC inválido' });
  }
  const raw = String(req.body?.ACTIVO ?? req.body?.activo ?? '')
    .trim()
    .toUpperCase();
  if (raw !== 'SI' && raw !== 'NO') {
    return res.status(400).json({ error: 'ACTIVO debe ser SI o NO' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('ACTIVO', sql.VarChar, raw)
      .query(`
        UPDATE dbo.TIPODOCUMENTOS SET ACTIVO = @ACTIVO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Tipo documento no encontrado' });
    }
    res.json({ ok: true, CODDOC: coddoc, ACTIVO: raw });
  } catch (err) {
    console.warn('[API PATCH /tipo-documentos/:coddoc/activo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
