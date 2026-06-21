const express = require('express');
const sql = require('mssql');
const { createCatalogoRouter } = require('./lib/catalogo-empresa');
const { isDbConfigured } = require('../config/database');

const PRIORIDADES = ['BAJA', 'MEDIA', 'ALTA'];
const ESTADOS = ['PENDIENTE', 'FINALIZADA'];

const ENSURE_FECHA_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.TASKS') AND name = 'FECHA'
)
BEGIN
  ALTER TABLE dbo.TASKS ADD FECHA DATE NULL;
  UPDATE dbo.TASKS SET FECHA = CAST(GETDATE() AS DATE) WHERE FECHA IS NULL;
END;
`;

let fechaColumnEnsured = false;

function normalizePrioridad(value) {
  const s = String(value ?? '').trim().toUpperCase();
  return PRIORIDADES.includes(s) ? s : null;
}

function normalizeEstado(value) {
  const s = String(value ?? '').trim().toUpperCase();
  return ESTADOS.includes(s) ? s : null;
}

function parseHoraMinuto(raw, label) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return `${label} inválido`;
  if (label === 'HORA' && (n < 0 || n > 23)) return 'HORA debe estar entre 0 y 23';
  if (label === 'MINUTO' && (n < 0 || n > 59)) return 'MINUTO debe estar entre 0 y 59';
  return null;
}

function validateTareaPayload(data) {
  if (!String(data.TAREA || '').trim()) return 'TAREA es obligatoria';
  const prioridad = normalizePrioridad(data.PRIORIDAD);
  if (!prioridad) return 'PRIORIDAD inválida (BAJA, MEDIA, ALTA)';
  const estado = normalizeEstado(data.ST);
  if (!estado) return 'Estado inválido (PENDIENTE, FINALIZADA)';
  const errHora = parseHoraMinuto(data.HORA, 'HORA');
  if (typeof errHora === 'string') return errHora;
  const errMin = parseHoraMinuto(data.MINUTO, 'MINUTO');
  if (typeof errMin === 'string') return errMin;
  data.PRIORIDAD = prioridad;
  data.ST = estado;
  return null;
}

function getEmpNitFromReq(req) {
  return String(req.query.empnit || req.headers['x-emp-nit'] || '').trim();
}

async function ensureFechaColumn(pool) {
  if (fechaColumnEnsured) return;
  await pool.request().query(ENSURE_FECHA_SQL);
  fechaColumnEnsured = true;
}

const router = express.Router();

router.use(async (req, res, next) => {
  if (!isDbConfigured()) return next();
  try {
    const pool = await req.app.locals.getDbPool();
    await ensureFechaColumn(pool);
  } catch (err) {
    console.warn('[API /tareas ensure FECHA]', err.message);
  }
  next();
});

router.use(
  createCatalogoRouter({
    logName: 'tareas',
    entityLabel: 'Tarea',
    table: 'TASKS',
    orderBy: 'ID ASC',
    idColumn: 'ID',
    idType: 'int',
    idRouteParam: 'id',
    autoId: false,
    identityColumn: true,
    fechaOnInsert: true,
    listColumns: ['ID', 'FECHA', 'TAREA', 'RESPONSABLE', 'PRIORIDAD', 'ST', 'HORA', 'MINUTO'],
    fields: [
      { name: 'TAREA', type: 'varchar', required: true },
      { name: 'RESPONSABLE', type: 'varchar' },
      { name: 'PRIORIDAD', type: 'varchar', required: true },
      { name: 'ST', type: 'varchar', required: true },
      { name: 'HORA', type: 'int' },
      { name: 'MINUTO', type: 'int' },
    ],
    insertFields: ['TAREA', 'RESPONSABLE', 'PRIORIDAD', 'ST', 'HORA', 'MINUTO'],
    updateFields: ['TAREA', 'RESPONSABLE', 'PRIORIDAD', 'ST', 'HORA', 'MINUTO'],
    async validateInsert(_pool, _empnit, data) {
      return validateTareaPayload(data);
    },
    async validateUpdate(_pool, _empnit, data) {
      return validateTareaPayload(data);
    },
  })
);

router.patch('/:id/estado', async (req, res) => {
  if (!isDbConfigured()) {
    return res.status(503).json({ error: 'Base de datos no configurada' });
  }
  const empnit = getEmpNitFromReq(req);
  if (!empnit) {
    return res.status(400).json({ error: 'EMPNIT requerido (empresa de la sesión)' });
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  const st = normalizeEstado(req.body?.ST ?? req.body?.st);
  if (!st) {
    return res.status(400).json({ error: 'Estado inválido (PENDIENTE, FINALIZADA)' });
  }
  try {
    const pool = await req.app.locals.getDbPool();
    const result = await pool
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('ID', sql.Int, id)
      .input('ST', sql.VarChar, st)
      .query(`
        UPDATE dbo.TASKS SET ST = @ST
        WHERE EMPNIT = @EMPNIT AND ID = @ID
      `);
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    res.json({ ok: true, ID: id, ST: st });
  } catch (err) {
    console.warn('[API PATCH /tareas/:id/estado]', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
