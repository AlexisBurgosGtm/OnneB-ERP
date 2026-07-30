const sql = require('mssql');
const { assertAdminPass } = require('../config-auth');
const { STATUS_OPERADO, STATUS_ANULADO, STATUS_BLOQUEADO } = require('../documento-status');
const { loadFelCredenciales } = require('./credenciales');
const { buildAnulacionXml } = require('./build-xml');
const { cancelWithInfile } = require('./infile-client');
const { assertCertificableTipodoc } = require('./tipo-documento');
const { buildIdentificador } = require('./utils');

async function loadDocumentoFelAnulacion(pool, empnit, coddoc, correlativo) {
  const headerRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.TIPODOC
      FROM dbo.DOCUMENTOS d
      JOIN dbo.TIPODOCUMENTOS t ON d.CODDOC = t.CODDOC AND d.EMPNIT = t.EMPNIT
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);

  if (!headerRes.recordset.length) {
    const err = new Error('Documento no encontrado');
    err.statusCode = 404;
    throw err;
  }

  const header = headerRes.recordset[0];
  assertCertificableTipodoc(header.TIPODOC);

  const status = String(header.STATUS || '').trim().toUpperCase();
  if (status === STATUS_ANULADO) {
    const err = new Error('El documento ya está anulado');
    err.statusCode = 409;
    throw err;
  }
  if (status !== STATUS_OPERADO && status !== STATUS_BLOQUEADO) {
    const err = new Error('Solo se pueden anular documentos operados o bloqueados');
    err.statusCode = 400;
    throw err;
  }

  const uuid = String(header.FEL_UUDI || '').trim();
  if (!uuid) {
    const err = new Error('El documento no está certificado ante SAT');
    err.statusCode = 400;
    throw err;
  }

  return header;
}

async function persistAnulacionDocumento(pool, empnit, coddoc, correlativo) {
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('STATUS', sql.VarChar, STATUS_ANULADO)
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET STATUS = @STATUS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

async function anularDocumentoFel(pool, empnit, coddoc, correlativo, { motivo, adminPass }) {
  const motivoClean = String(motivo ?? '').trim();
  if (!motivoClean) {
    const err = new Error('El motivo de anulación es obligatorio');
    err.statusCode = 400;
    throw err;
  }
  if (motivoClean.length > 255) {
    const err = new Error('El motivo de anulación no puede exceder 255 caracteres');
    err.statusCode = 400;
    throw err;
  }

  await assertAdminPass(pool, String(adminPass ?? ''));

  const credenciales = await loadFelCredenciales(pool, empnit);
  const header = await loadDocumentoFelAnulacion(pool, empnit, coddoc, correlativo);
  const identificador = `${buildIdentificador(empnit, coddoc, correlativo)}_ANUL`;
  const { xml, uuid } = buildAnulacionXml({ cred: credenciales, header, motivo: motivoClean });

  const felResult = await cancelWithInfile(xml, credenciales, identificador);
  await persistAnulacionDocumento(pool, empnit, coddoc, correlativo);

  return {
    ok: true,
    coddoc,
    correlativo,
    status: STATUS_ANULADO,
    fel: {
      uuid: felResult.uuid || uuid,
      serie: felResult.serie || header.FEL_SERIE || '',
      numero: felResult.numero || header.FEL_NUMERO || '',
      fechaAnulacion: felResult.fechaCertificacion || '',
    },
  };
}

module.exports = { anularDocumentoFel, loadDocumentoFelAnulacion };
