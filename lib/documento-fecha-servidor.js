const sql = require('mssql');
const { TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('./corte-caja-docs');
const { getSettingSino, SETTING_OPCION } = require('./settings');
const { nowParts, parseFechaInput } = require('./documento-fecha');

/** FAC, FPC, FEF, FEC, FES, DEV, FNC (vía TIPODOC_FACTURA + devoluciones) */
const TIPODOCS_FECHA_SERVIDOR = [...TIPODOC_FACTURA, ...TIPODOC_DEVOLUCION];

function normalizeTipodoc(tipodoc) {
  return String(tipodoc || '').trim().toUpperCase();
}

function tipodocUsaFechaServidor(tipodoc) {
  return TIPODOCS_FECHA_SERVIDOR.includes(normalizeTipodoc(tipodoc));
}

async function getObligaFechaServidorFacturas(pool) {
  return (await getSettingSino(pool, SETTING_OPCION.OBLIGA_FECHA_SERVIDOR_FACTURAS)) === 'SI';
}

async function isFechaServidorActivaParaTipodoc(pool, tipodoc) {
  if (!tipodocUsaFechaServidor(tipodoc)) return false;
  return getObligaFechaServidorFacturas(pool);
}

async function loadTipodocDocumento(db, empnit, coddoc) {
  const r = await db
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT TOP 1 TIPODOC
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  return normalizeTipodoc(r.recordset[0]?.TIPODOC);
}

function serverFechaParts() {
  return nowParts();
}

/**
 * Fecha de alta: si la opción aplica al TIPODOC, siempre calendario del servidor (hora actual).
 */
function resolveFechaAltaDocumento(tipodoc, obligaServidor, clientFechaParts) {
  const now = serverFechaParts();
  if (obligaServidor && tipodocUsaFechaServidor(tipodoc)) {
    return now;
  }
  if (clientFechaParts) {
    return { ...now, ...clientFechaParts };
  }
  return now;
}

async function resolveFechaAltaDocumentoAsync(pool, tipodoc, clientFechaRaw) {
  const obliga = await isFechaServidorActivaParaTipodoc(pool, tipodoc);
  const clientParts =
    clientFechaRaw !== undefined && clientFechaRaw !== null && String(clientFechaRaw).trim() !== ''
      ? parseFechaInput(clientFechaRaw)
      : null;
  return resolveFechaAltaDocumento(tipodoc, obliga, clientParts);
}

/**
 * Impide cambiar FECHA manualmente (PATCH) cuando la configuración está activa.
 */
async function assertPermiteCambioFechaDocumento(pool, empnit, tipodoc) {
  if (!(await isFechaServidorActivaParaTipodoc(pool, tipodoc))) return;
  const err = new Error(
    'La fecha del documento está fijada al día del servidor (configuración activa). No puede modificarla manualmente.'
  );
  err.statusCode = 403;
  throw err;
}

async function assertPermiteCambioFechaPorCoddoc(pool, empnit, coddoc) {
  const tipodoc = await loadTipodocDocumento(pool, empnit, coddoc);
  await assertPermiteCambioFechaDocumento(pool, empnit, tipodoc);
}

module.exports = {
  TIPODOCS_FECHA_SERVIDOR,
  tipodocUsaFechaServidor,
  getObligaFechaServidorFacturas,
  isFechaServidorActivaParaTipodoc,
  loadTipodocDocumento,
  serverFechaParts,
  resolveFechaAltaDocumento,
  resolveFechaAltaDocumentoAsync,
  assertPermiteCambioFechaDocumento,
  assertPermiteCambioFechaPorCoddoc,
};
