/**
 * DOCUMENTOS.RESTAURANTE_MESA_ID — mesa atendida al facturar comanda (CRS).
 */
const sql = require('mssql');

const ENSURE_MESA_SQL = `
IF COL_LENGTH('dbo.DOCUMENTOS', 'RESTAURANTE_MESA_ID') IS NULL
BEGIN
  ALTER TABLE dbo.DOCUMENTOS ADD RESTAURANTE_MESA_ID INT NULL;
END
`;

let schemaReady = false;

function parseMesaRestauranteId(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function ensureDocumentosMesaRestauranteColumn(db) {
  if (schemaReady) return;
  await db.request().query(ENSURE_MESA_SQL);
  schemaReady = true;
}

/**
 * Guarda mesa en la factura y libera la mesa (cuenta cerrada → OCUPADA = NO).
 * @param {import('mssql').Transaction|import('mssql').ConnectionPool} db
 */
async function aplicarMesaRestauranteAlFacturarComanda(db, empnit, facCoddoc, facCorrelativo, comandaRow) {
  const tipodoc = String(comandaRow?.TIPODOC || '').trim().toUpperCase();
  if (tipodoc !== 'CRS') return null;

  const mesaId = parseMesaRestauranteId(comandaRow?.CODEMBARQUE);
  if (!mesaId) return null;

  await ensureDocumentosMesaRestauranteColumn(db);

  await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, facCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), facCorrelativo)
    .input('MESA_ID', sql.Int, mesaId)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET RESTAURANTE_MESA_ID = @MESA_ID
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);

  await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('ID', sql.Int, mesaId)
    .query(`
      UPDATE dbo.RESTAURANTE_MESAS
      SET OCUPADA = 'NO'
      WHERE EMPNIT = @EMPNIT AND ID = @ID
    `);

  return mesaId;
}

module.exports = {
  ENSURE_MESA_SQL,
  parseMesaRestauranteId,
  ensureDocumentosMesaRestauranteColumn,
  aplicarMesaRestauranteAlFacturarComanda,
};
