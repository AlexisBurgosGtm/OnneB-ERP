const sql = require('mssql');
const { STATUS_OPERADO } = require('../documento-status');
const { assertCertificableTipodoc } = require('./tipo-documento');

async function loadDocumentoFel(pool, empnit, coddoc, correlativo) {
  const headerRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.DESDOC, t.TIPODOC,
        c.NEGOCIO AS CLI_NEGOCIO, c.TIPONEGOCIO AS CLI_TIPONEGOCIO,
        c.NOMBRECLIENTE AS CLI_NOMBRE, c.DIRCLIENTE AS CLI_DIR, c.NIT AS CLI_NIT
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  if (!headerRes.recordset.length) {
    const err = new Error('Documento no encontrado');
    err.statusCode = 404;
    throw err;
  }
  const header = headerRes.recordset[0];
  assertCertificableTipodoc(header.TIPODOC);

  if (String(header.STATUS || '').trim().toUpperCase() !== STATUS_OPERADO) {
    const err = new Error('Solo se pueden certificar documentos en estado operado');
    err.statusCode = 400;
    throw err;
  }
  if (String(header.FEL_UUDI || '').trim()) {
    const err = new Error('El documento ya está certificado ante SAT');
    err.statusCode = 409;
    throw err;
  }

  const linesRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT Id AS ID, CODPROD, DESPROD, CODMEDIDA, CANTIDAD, EQUIVALE, PRECIO, COSTO,
        TOTALPRECIO, TOTALCOSTO, TOTALUNIDADES, TIPOPRECIO, ISNULL(EXENTO, 0) AS EXENTO,
        ISNULL(TIPOPROD, 'P') AS TIPOPROD
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY Id
    `);
  if (!linesRes.recordset.length) {
    const err = new Error('El documento no tiene líneas para certificar');
    err.statusCode = 400;
    throw err;
  }

  let referencia = null;
  if (String(header.TIPODOC || '').trim().toUpperCase() === 'FNC') {
    referencia = await loadReferenciaNotaCredito(pool, empnit, header);
  }

  return { header, lines: linesRes.recordset, referencia };
}

async function loadReferenciaNotaCredito(pool, empnit, header) {
  const seriefac = String(header.SERIEFAC || '').trim();
  const nofac = String(header.NOFAC || '').trim();
  if (!seriefac || !nofac) {
    const err = new Error('La nota de crédito debe referenciar la factura original (SERIEFAC / NOFAC)');
    err.statusCode = 400;
    throw err;
  }
  const corrRaw = Number(String(nofac).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(corrRaw)) {
    const err = new Error('NOFAC de referencia inválido en la nota de crédito');
    err.statusCode = 400;
    throw err;
  }
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, seriefac)
    .input('CORRELATIVO', sql.Decimal(18, 0), corrRaw)
    .query(`
      SELECT CODDOC, CORRELATIVO, FECHA, ANIO, MES, DIA, FEL_UUDI, FEL_SERIE, FEL_NUMERO, FEL_FECHA
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
  const orig = result.recordset[0];
  if (!orig) {
    const err = new Error('No se encontró el documento original referenciado por la nota de crédito');
    err.statusCode = 400;
    throw err;
  }
  if (!String(orig.FEL_UUDI || '').trim()) {
    const err = new Error('La factura original aún no está certificada ante SAT');
    err.statusCode = 400;
    throw err;
  }
  return orig;
}

module.exports = { loadDocumentoFel };
