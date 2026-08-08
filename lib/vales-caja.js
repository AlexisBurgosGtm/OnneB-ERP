/**
 * Vales de caja (DOCUMENTOS_VALES_CAJA): salidas de efectivo desde cajas abiertas.
 * Restan del efectivo esperado al cortar la caja.
 */
const sql = require('mssql');
const { getSettingSino, ensureSettingDefault, SETTING_OPCION } = require('./settings');

const TIPOS_VALE_CAJA_COMUNES = [
  'GASTO OPERATIVO',
  'TRANSPORTE',
  'ALIMENTOS',
  'UTILERIAS',
  'SERVICIOS',
  'OTROS',
];

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function parseMesAnio(mesRaw, anioRaw) {
  const now = new Date();
  const mes = parseInt(mesRaw, 10);
  const anio = parseInt(anioRaw, 10);
  return {
    mes: Number.isFinite(mes) && mes >= 1 && mes <= 12 ? mes : now.getMonth() + 1,
    anio: Number.isFinite(anio) && anio >= 2000 && anio <= 2100 ? anio : now.getFullYear(),
  };
}

function httpError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function normalizeFechaIso(raw) {
  const fechaStr = String(raw || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return null;
  return fechaStr;
}

async function listCajasAbiertas(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT CODCAJA, DESCAJA, ISNULL(EFECTIVOINICIAL, 0) AS EFECTIVOINICIAL
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND ISNULL(STATUS, 0) = 1
      ORDER BY DESCAJA ASC
    `);
  return result.recordset || [];
}

async function assertCajaAbierta(pool, empnit, codcaja) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .query(`
      SELECT CODCAJA, DESCAJA, ISNULL(STATUS, 0) AS STATUS,
             ISNULL(EFECTIVOINICIAL, 0) AS EFECTIVOINICIAL
      FROM dbo.Cajas
      WHERE EMPNIT = @EMPNIT AND CODCAJA = @CODCAJA
    `);
  const row = result.recordset[0];
  if (!row) throw httpError('Caja no encontrada', 404);
  if (Number(row.STATUS) !== 1) throw httpError('La caja seleccionada no está abierta');
  return row;
}

async function getLimitaEfectivoValesCaja(pool) {
  await ensureSettingDefault(pool, SETTING_OPCION.LIMITA_EFECTIVO_DISPONIBLE_EN_VALES_CAJA);
  const sino = await getSettingSino(pool, SETTING_OPCION.LIMITA_EFECTIVO_DISPONIBLE_EN_VALES_CAJA);
  return sino === 'SI';
}

async function assertImporteDentroEfectivoInicial(pool, caja, importe) {
  const limita = await getLimitaEfectivoValesCaja(pool);
  if (!limita) return;
  const tope = roundMoney(caja.EFECTIVOINICIAL);
  if (importe - tope > 0.0005) {
    throw httpError(
      `El importe (Q ${importe.toFixed(2)}) supera el efectivo inicial de la caja (Q ${tope.toFixed(2)})`
    );
  }
}

async function listValesCaja(pool, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        v.NOVALE, v.EMPNIT, v.MES, v.ANIO, v.FECHA, v.CODCAJA,
        LTRIM(RTRIM(ISNULL(v.TIPO, ''))) AS TIPO,
        LTRIM(RTRIM(ISNULL(v.DESCRIPCION, ''))) AS DESCRIPCION,
        LTRIM(RTRIM(ISNULL(v.RECIBE, ''))) AS RECIBE,
        ISNULL(v.IMPORTE, 0) AS IMPORTE,
        ISNULL(v.CORTE, 'NO') AS CORTE,
        v.NOCORTE,
        ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.DOCUMENTOS_VALES_CAJA v
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = v.EMPNIT AND c.CODCAJA = v.CODCAJA
      WHERE v.EMPNIT = @EMPNIT AND v.MES = @MES AND v.ANIO = @ANIO
      ORDER BY v.FECHA DESC, v.NOVALE DESC
    `);
  return result.recordset || [];
}

async function listTiposUsados(pool, empnit) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      SELECT DISTINCT LTRIM(RTRIM(ISNULL(TIPO, ''))) AS TIPO
      FROM dbo.DOCUMENTOS_VALES_CAJA
      WHERE EMPNIT = @EMPNIT AND LTRIM(RTRIM(ISNULL(TIPO, ''))) <> ''
      ORDER BY TIPO
    `);
  const usados = (result.recordset || []).map((r) => String(r.TIPO || '').trim()).filter(Boolean);
  const set = new Set([...TIPOS_VALE_CAJA_COMUNES, ...usados]);
  return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}

async function getValeCajaById(pool, empnit, novale) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('NOVALE', sql.Int, novale)
    .query(`
      SELECT
        NOVALE, EMPNIT, MES, ANIO, FECHA, CODCAJA, TIPO, DESCRIPCION, RECIBE,
        ISNULL(IMPORTE, 0) AS IMPORTE,
        ISNULL(CORTE, 'NO') AS CORTE,
        NOCORTE
      FROM dbo.DOCUMENTOS_VALES_CAJA
      WHERE EMPNIT = @EMPNIT AND NOVALE = @NOVALE
    `);
  return result.recordset[0] || null;
}

function parseValePayload(data, { requireCaja = true } = {}) {
  const codcaja = parseInt(data.CODCAJA, 10);
  const importe = roundMoney(data.IMPORTE);
  const fechaStr = normalizeFechaIso(data.FECHA);
  const tipo = String(data.TIPO || '').trim().slice(0, 150);
  const descripcion = String(data.DESCRIPCION || '').trim().slice(0, 250);
  const recibe = String(data.RECIBE || '').trim().slice(0, 150);

  if (requireCaja && (!Number.isFinite(codcaja) || codcaja <= 0)) {
    throw httpError('Seleccione una caja abierta');
  }
  if (!(importe > 0)) throw httpError('El importe debe ser mayor a cero');
  if (!fechaStr) throw httpError('Fecha inválida');
  if (!tipo) throw httpError('Indique el tipo de vale');
  if (!descripcion) throw httpError('Indique la descripción');
  if (!recibe) throw httpError('Indique quién recibe el efectivo');

  const [anio, mes] = fechaStr.split('-').map((n) => parseInt(n, 10));
  return { codcaja, importe, fechaStr, tipo, descripcion, recibe, mes, anio };
}

async function createValeCaja(pool, empnit, data) {
  const { codcaja, importe, fechaStr, tipo, descripcion, recibe, mes, anio } = parseValePayload(data);
  const caja = await assertCajaAbierta(pool, empnit, codcaja);
  await assertImporteDentroEfectivoInicial(pool, caja, importe);

  const insert = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('FECHA', sql.Date, fechaStr)
    .input('CODCAJA', sql.Int, codcaja)
    .input('TIPO', sql.VarChar, tipo)
    .input('DESCRIPCION', sql.VarChar, descripcion)
    .input('RECIBE', sql.VarChar, recibe)
    .input('IMPORTE', sql.Float, importe)
    .query(`
      INSERT INTO dbo.DOCUMENTOS_VALES_CAJA (
        EMPNIT, MES, ANIO, FECHA, CODCAJA, TIPO, DESCRIPCION, RECIBE, IMPORTE, CORTE, NOCORTE
      )
      OUTPUT INSERTED.NOVALE
      VALUES (
        @EMPNIT, @MES, @ANIO, @FECHA, @CODCAJA, @TIPO, @DESCRIPCION, @RECIBE, @IMPORTE, 'NO', NULL
      )
    `);

  const novale = insert.recordset[0]?.NOVALE;
  const rows = await listValesCaja(pool, empnit, mes, anio);
  return { novale, rows, mes, anio };
}

async function updateValeCaja(pool, empnit, novale, data) {
  const row = await getValeCajaById(pool, empnit, novale);
  if (!row) throw httpError('Vale no encontrado', 404);
  if (String(row.CORTE || 'NO').trim().toUpperCase() === 'SI') {
    throw httpError('No se puede editar un vale ya incluido en un corte de caja');
  }

  const { codcaja, importe, fechaStr, tipo, descripcion, recibe, mes, anio } = parseValePayload(data);
  const caja = await assertCajaAbierta(pool, empnit, codcaja);
  await assertImporteDentroEfectivoInicial(pool, caja, importe);

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('NOVALE', sql.Int, novale)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .input('FECHA', sql.Date, fechaStr)
    .input('CODCAJA', sql.Int, codcaja)
    .input('TIPO', sql.VarChar, tipo)
    .input('DESCRIPCION', sql.VarChar, descripcion)
    .input('RECIBE', sql.VarChar, recibe)
    .input('IMPORTE', sql.Float, importe)
    .query(`
      UPDATE dbo.DOCUMENTOS_VALES_CAJA
      SET MES = @MES, ANIO = @ANIO, FECHA = @FECHA, CODCAJA = @CODCAJA,
          TIPO = @TIPO, DESCRIPCION = @DESCRIPCION, RECIBE = @RECIBE, IMPORTE = @IMPORTE
      WHERE EMPNIT = @EMPNIT AND NOVALE = @NOVALE
        AND ISNULL(CORTE, 'NO') = 'NO'
    `);

  const listMes = parseInt(data.listMes, 10);
  const listAnio = parseInt(data.listAnio, 10);
  const outMes = Number.isFinite(listMes) ? listMes : mes;
  const outAnio = Number.isFinite(listAnio) ? listAnio : anio;
  const rows = await listValesCaja(pool, empnit, outMes, outAnio);
  return { novale, rows, mes: outMes, anio: outAnio };
}

async function deleteValeCaja(pool, empnit, novale) {
  const row = await getValeCajaById(pool, empnit, novale);
  if (!row) throw httpError('Vale no encontrado', 404);
  if (String(row.CORTE || 'NO').trim().toUpperCase() === 'SI') {
    throw httpError('No se puede eliminar un vale ya incluido en un corte de caja');
  }

  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('NOVALE', sql.Int, novale)
    .query(`
      DELETE FROM dbo.DOCUMENTOS_VALES_CAJA
      WHERE EMPNIT = @EMPNIT AND NOVALE = @NOVALE
        AND ISNULL(CORTE, 'NO') = 'NO'
    `);

  return { novale, mes: row.MES, anio: row.ANIO };
}

/**
 * Vales de caja pendientes de la sesión abierta (solo efectivo).
 * Filtra por FECHA (la tabla no tiene FECHA_CREACION).
 */
async function sumValesCajaSesion(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT ISNULL(SUM(ISNULL(IMPORTE, 0)), 0) AS TOTAL,
             COUNT(1) AS CANTIDAD
      FROM dbo.DOCUMENTOS_VALES_CAJA
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA >= CAST(@APERTURA AS date)
    `);
  const row = result.recordset[0] || {};
  return {
    totalValesCaja: roundMoney(row.TOTAL),
    cantidadValesCaja: Number(row.CANTIDAD) || 0,
  };
}

async function listValesCajaSesion(requestable, empnit, codcaja, apertura) {
  const result = await requestable
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      SELECT
        v.NOVALE AS ID, v.NOVALE, v.FECHA, v.CODCAJA, v.TIPO, v.DESCRIPCION, v.RECIBE,
        ISNULL(v.IMPORTE, 0) AS IMPORTE,
        ISNULL(v.IMPORTE, 0) AS MONTO,
        ISNULL(c.DESCAJA, '') AS DESCAJA
      FROM dbo.DOCUMENTOS_VALES_CAJA v
      LEFT JOIN dbo.Cajas c ON c.EMPNIT = v.EMPNIT AND c.CODCAJA = v.CODCAJA
      WHERE v.EMPNIT = @EMPNIT
        AND v.CODCAJA = @CODCAJA
        AND ISNULL(v.CORTE, 'NO') = 'NO'
        AND v.FECHA >= CAST(@APERTURA AS date)
      ORDER BY v.FECHA DESC, v.NOVALE DESC
    `);
  return result.recordset || [];
}

async function marcarValesCajaCorte(transaction, empnit, codcaja, nocorte, apertura) {
  const result = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODCAJA', sql.Int, codcaja)
    .input('NOCORTE', sql.Float, nocorte)
    .input('APERTURA', sql.DateTime, apertura)
    .query(`
      UPDATE dbo.DOCUMENTOS_VALES_CAJA
      SET CORTE = 'SI', NOCORTE = @NOCORTE
      WHERE EMPNIT = @EMPNIT
        AND CODCAJA = @CODCAJA
        AND ISNULL(CORTE, 'NO') = 'NO'
        AND FECHA >= CAST(@APERTURA AS date)
    `);
  return result.rowsAffected[0] || 0;
}

module.exports = {
  TIPOS_VALE_CAJA_COMUNES,
  parseMesAnio,
  listCajasAbiertas,
  listValesCaja,
  listTiposUsados,
  getValeCajaById,
  createValeCaja,
  updateValeCaja,
  deleteValeCaja,
  sumValesCajaSesion,
  listValesCajaSesion,
  marcarValesCajaCorte,
  getLimitaEfectivoValesCaja,
  roundMoney,
};
