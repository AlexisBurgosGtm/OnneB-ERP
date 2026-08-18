const sql = require('mssql');
const multer = require('multer');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');
const {
  assertAccesoUnico,
  normalizeUsuario,
  normalizeClave,
  tieneAccesoSistema,
} = require('../lib/empleado-acceso');
const {
  resolveEmpleadoFoto,
  readEmpleadoFotoBuffer,
  saveEmpleadoFoto,
  removeEmpleadoFotos,
} = require('../lib/empleado-fotos');

const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.mimetype || '')) {
      return cb(new Error('Formato de imagen no permitido'));
    }
    cb(null, true);
  },
});

async function validateEmpleadoAcceso(pool, data, exclude) {
  const usuario = normalizeUsuario(data.USUARIO);
  const clave = normalizeClave(data.CLAVE);
  // Sin usuario o sin clave (null/vacío): no accede al sistema; no validar duplicados.
  if (!tieneAccesoSistema(usuario, clave)) {
    data.USUARIO = null;
    data.CLAVE = null;
    return null;
  }
  data.USUARIO = usuario;
  data.CLAVE = clave;
  try {
    await assertAccesoUnico(pool, usuario, clave, exclude);
  } catch (err) {
    return err.message;
  }
  return null;
}

/** Documentos que referencian al empleado como vendedor (CODVEN). */
async function empleadoTieneDocumentos(pool, empnit, codempleado) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODEMPLEADO', sql.Int, codempleado)
    .query(`
      SELECT TOP 1 1 AS X
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODVEN = @CODEMPLEADO
    `);
  return result.recordset.length > 0;
}

const router = createCatalogoRouter({
  logName: 'empleados',
  entityLabel: 'Empleado',
  table: 'Empleados',
  orderBy: 'NOMEMPLEADO',
  idColumn: 'CODEMPLEADO',
  idType: 'int',
  idRouteParam: 'codempleado',
  identityColumn: true,
  requireAdminPassOnDelete: true,
  listColumns: [
    'CODEMPLEADO',
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'ACTIVO',
    'USUARIO',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
    'NIT',
    'FECHA_INICIO',
    'FECHA_NACIMIENTO',
  ],
  fields: [
    { name: 'NOMEMPLEADO', type: 'varchar', required: true },
    { name: 'CODTIPOEMPLEADO', type: 'int' },
    { name: 'DPI', type: 'varchar' },
    { name: 'IGSS', type: 'varchar' },
    { name: 'DIRECCION', type: 'varchar' },
    { name: 'CODMUNICIPIO', type: 'int' },
    { name: 'CODDEPTO', type: 'int' },
    { name: 'TELEFONOS', type: 'varchar' },
    { name: 'WHATSAPP', type: 'varchar' },
    { name: 'EMAIL', type: 'varchar' },
    { name: 'ACTIVO', type: 'varchar' },
    { name: 'USUARIO', type: 'varchar' },
    { name: 'CLAVE', type: 'varchar' },
    { name: 'LATITUD', type: 'varchar' },
    { name: 'LONGITUD', type: 'varchar' },
    { name: 'CODRUTA', type: 'int' },
    { name: 'CODCATALOGO', type: 'varchar' },
    { name: 'CODDOC_REC', type: 'varchar' },
    { name: 'NIT', type: 'varchar' },
    { name: 'FECHA_INICIO', type: 'date' },
    { name: 'FECHA_NACIMIENTO', type: 'date' },
  ],
  insertFields: [
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'ACTIVO',
    'USUARIO',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
    'NIT',
    'FECHA_INICIO',
    'FECHA_NACIMIENTO',
  ],
  updateFields: [
    'NOMEMPLEADO',
    'CODTIPOEMPLEADO',
    'DPI',
    'IGSS',
    'DIRECCION',
    'CODMUNICIPIO',
    'CODDEPTO',
    'TELEFONOS',
    'WHATSAPP',
    'EMAIL',
    'USUARIO',
    'CLAVE',
    'LATITUD',
    'LONGITUD',
    'CODRUTA',
    'CODCATALOGO',
    'CODDOC_REC',
    'NIT',
    'FECHA_INICIO',
    'FECHA_NACIMIENTO',
  ],
  async validateInsert(pool, empnit, data) {
    return validateEmpleadoAcceso(pool, data);
  },
  async validateUpdate(pool, empnit, data, req, codempleado) {
    return validateEmpleadoAcceso(pool, data, {
      empnit,
      codempleado,
    });
  },
  async customDelete(pool, empnit, idValue) {
    const exists = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODEMPLEADO', sql.Int, idValue)
      .query(`
        SELECT TOP 1 CODEMPLEADO
        FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
      `);
    if (!exists.recordset.length) {
      return { error: 'Empleado no encontrado', statusCode: 404 };
    }

    const tieneDocumentos = await empleadoTieneDocumentos(pool, empnit, idValue);
    if (tieneDocumentos) {
      await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODEMPLEADO', sql.Int, idValue)
        .query(`
          UPDATE dbo.Empleados SET ACTIVO = 'NO'
          WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
        `);
      return {
        ok: true,
        action: 'disabled',
        CODEMPLEADO: idValue,
        ACTIVO: 'NO',
        message:
          'El empleado tiene documentos asociados; no se eliminó y quedó deshabilitado (ACTIVO = NO).',
      };
    }

    const del = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODEMPLEADO', sql.Int, idValue)
      .query(`
        DELETE FROM dbo.Empleados
        WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
      `);
    if (!del.rowsAffected[0]) {
      return { error: 'Empleado no encontrado', statusCode: 404 };
    }
    return { ok: true, action: 'deleted', CODEMPLEADO: idValue };
  },
});

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

router.patch('/:codempleado/activo', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  }
  const id = parseInt(req.params.codempleado, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'CODEMPLEADO inválido' });
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
      .input('CODEMPLEADO', sql.Int, id)
      .input('ACTIVO', sql.VarChar, raw)
      .query(`
        UPDATE dbo.Empleados SET ACTIVO = @ACTIVO
        WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado' });
    }
    res.json({ ok: true, CODEMPLEADO: id, ACTIVO: raw });
  } catch (err) {
    console.warn('[API PATCH /empleados/:codempleado/activo]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:codempleado/foto', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = getEmpNitFromReq(req);
  if (!empnit) return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  const codempleado = parseInt(req.params.codempleado, 10);
  if (Number.isNaN(codempleado)) return res.status(400).json({ error: 'CODEMPLEADO inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    const wantMeta =
      String(req.query.meta || '') === '1' || String(req.headers.accept || '').includes('application/json');
    if (wantMeta) {
      const meta = await resolveEmpleadoFoto(pool, empnit, codempleado);
      if (!meta) return res.status(404).json({ error: 'Sin foto', url: null });
      return res.json({ ok: true, url: meta.url, filename: meta.filename, modo: meta.modo });
    }
    const file = await readEmpleadoFotoBuffer(pool, empnit, codempleado);
    if (!file) return res.status(404).json({ error: 'Sin foto', url: null });
    const ext = String(file.filename || '').toLowerCase();
    const type =
      ext.endsWith('.png')
        ? 'image/png'
        : ext.endsWith('.webp')
          ? 'image/webp'
          : ext.endsWith('.gif')
            ? 'image/gif'
            : 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.send(file.buffer);
  } catch (err) {
    console.warn('[API GET /empleados/:codempleado/foto]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

router.post('/:codempleado/foto', (req, res) => {
  uploadFoto.single('foto')(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Error al subir imagen' });
    }
    if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
    const empnit = getEmpNitFromReq(req);
    if (!empnit) return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
    const codempleado = parseInt(req.params.codempleado, 10);
    if (Number.isNaN(codempleado)) return res.status(400).json({ error: 'CODEMPLEADO inválido' });
    if (!req.file) return res.status(400).json({ error: 'Seleccione una imagen' });
    try {
      const pool = await req.app.locals.getDbPool();
      const exists = await pool
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('CODEMPLEADO', sql.Int, codempleado)
        .query(`
          SELECT TOP 1 CODEMPLEADO FROM dbo.Empleados
          WHERE EMPNIT = @EMPNIT AND CODEMPLEADO = @CODEMPLEADO
        `);
      if (!exists.recordset.length) return res.status(404).json({ error: 'Empleado no encontrado' });
      const saved = await saveEmpleadoFoto(pool, empnit, codempleado, req.file);
      res.json({ ok: true, url: saved.url, filename: saved.filename, modo: saved.modo });
    } catch (err) {
      console.warn('[API POST /empleados/:codempleado/foto]', err.message);
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });
});

router.delete('/:codempleado/foto', async (req, res) => {
  if (!isDbConfigured()) return res.status(503).json({ error: 'Base de datos no configurada' });
  const empnit = getEmpNitFromReq(req);
  if (!empnit) return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  const codempleado = parseInt(req.params.codempleado, 10);
  if (Number.isNaN(codempleado)) return res.status(400).json({ error: 'CODEMPLEADO inválido' });
  try {
    const pool = await req.app.locals.getDbPool();
    await removeEmpleadoFotos(pool, empnit, codempleado);
    res.json({ ok: true });
  } catch (err) {
    console.warn('[API DELETE /empleados/:codempleado/foto]', err.message);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

module.exports = router;
