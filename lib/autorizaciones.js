const sql = require('mssql');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayFechaDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nowHoraHhMm() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseFecha(raw) {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
  }
  const s = String(raw || '').trim().slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

function normalizeHora(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || h < 0 || h > 23 || !Number.isFinite(min) || min < 0 || min > 59) {
    return null;
  }
  return `${pad2(h)}:${pad2(min)}`;
}

function isAutorizadoSi(value) {
  return String(value || 'NO').trim().toUpperCase() === 'SI';
}

async function listAutorizaciones(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT ID, EMPNIT, FECHA, HORA, TIPO, DESCRIPCION, USUARIO,
             ISNULL(AUTORIZADO, 'NO') AS AUTORIZADO,
             USUARIOAUTORIZA
      FROM dbo.AUTORIZACIONES
      WHERE EMPNIT = @EMPNIT
      ORDER BY ID ASC
    `);
  return result.recordset || [];
}

async function getAutorizacionById(pool, empnit, id) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .query(`
      SELECT ID, EMPNIT, FECHA, HORA, TIPO, DESCRIPCION, USUARIO,
             ISNULL(AUTORIZADO, 'NO') AS AUTORIZADO,
             USUARIOAUTORIZA
      FROM dbo.AUTORIZACIONES
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);
  return result.recordset[0] || null;
}

/**
 * Inserta una solicitud de autorización.
 * @param {object} data - EMPNIT, FECHA?, HORA?, TIPO, DESCRIPCION, USUARIO
 */
async function createAutorizacion(pool, data) {
  const empnit = String(data.EMPNIT || '').trim();
  const tipo = String(data.TIPO || '').trim();
  const descripcion = String(data.DESCRIPCION || '').trim();
  const usuario = String(data.USUARIO || '').trim();
  if (!empnit) {
    const err = new Error('EMPNIT requerido');
    err.statusCode = 400;
    throw err;
  }
  if (!tipo) {
    const err = new Error('TIPO requerido');
    err.statusCode = 400;
    throw err;
  }
  if (!usuario) {
    const err = new Error('USUARIO requerido');
    err.statusCode = 400;
    throw err;
  }

  const fecha = parseFecha(data.FECHA) || todayFechaDate();
  const hora = normalizeHora(data.HORA) || nowHoraHhMm();

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FECHA', sql.Date, fecha)
    .input('HORA', sql.VarChar, hora)
    .input('TIPO', sql.VarChar, tipo)
    .input('DESCRIPCION', sql.NVarChar(sql.MAX), descripcion)
    .input('USUARIO', sql.VarChar, usuario)
    .query(`
      INSERT INTO dbo.AUTORIZACIONES
        (EMPNIT, FECHA, HORA, TIPO, DESCRIPCION, USUARIO, AUTORIZADO)
      OUTPUT
        INSERTED.ID, INSERTED.EMPNIT, INSERTED.FECHA, INSERTED.HORA,
        INSERTED.TIPO, INSERTED.DESCRIPCION, INSERTED.USUARIO,
        ISNULL(INSERTED.AUTORIZADO, 'NO') AS AUTORIZADO,
        INSERTED.USUARIOAUTORIZA
      VALUES
        (@EMPNIT, @FECHA, @HORA, @TIPO, @DESCRIPCION, @USUARIO, 'NO')
    `);
  return result.recordset[0] || null;
}

async function autorizarAutorizacion(pool, empnit, id, usuarioAutoriza) {
  const row = await getAutorizacionById(pool, empnit, id);
  if (!row) {
    const err = new Error('Autorización no encontrada');
    err.statusCode = 404;
    throw err;
  }
  if (isAutorizadoSi(row.AUTORIZADO)) {
    const err = new Error('Esta autorización ya fue otorgada');
    err.statusCode = 400;
    throw err;
  }
  const usuario = String(usuarioAutoriza || '').trim();
  if (!usuario) {
    const err = new Error('USUARIOAUTORIZA requerido');
    err.statusCode = 400;
    throw err;
  }

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, id)
    .input('USUARIOAUTORIZA', sql.VarChar, usuario)
    .query(`
      UPDATE dbo.AUTORIZACIONES
      SET AUTORIZADO = 'SI', USUARIOAUTORIZA = @USUARIOAUTORIZA
      WHERE EMPNIT = @EMPNIT
        AND ID = @ID
        AND ISNULL(AUTORIZADO, 'NO') <> 'SI'
    `);

  return getAutorizacionById(pool, empnit, id);
}

module.exports = {
  listAutorizaciones,
  getAutorizacionById,
  createAutorizacion,
  autorizarAutorizacion,
  isAutorizadoSi,
  nowHoraHhMm,
  todayFechaDate,
};
