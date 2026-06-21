const sql = require('mssql');
const { loadFelCredenciales } = require('./credenciales');
const { loadDocumentoFel } = require('./documento');
const { buildFelXml } = require('./build-xml');
const { certifyWithInfile } = require('./infile-client');
const { buildIdentificador } = require('./utils');

async function persistFelResult(pool, empnit, coddoc, correlativo, result) {
  await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .input('FEL_UUDI', sql.VarChar, result.uuid)
    .input('FEL_SERIE', sql.VarChar, result.serie || '')
    .input('FEL_NUMERO', sql.VarChar, result.numero || '')
    .input('FEL_FECHA', sql.VarChar, result.fechaCertificacion || '')
    .query(`
      UPDATE dbo.DOCUMENTOS
      SET FEL_UUDI = @FEL_UUDI,
          FEL_SERIE = @FEL_SERIE,
          FEL_NUMERO = @FEL_NUMERO,
          FEL_FECHA = @FEL_FECHA
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
    `);
}

async function certificarDocumentoFel(pool, empnit, coddoc, correlativo) {
  const credenciales = await loadFelCredenciales(pool, empnit);
  const documento = await loadDocumentoFel(pool, empnit, coddoc, correlativo);
  const identificador = buildIdentificador(empnit, coddoc, correlativo);
  const { xml, satTipo } = buildFelXml({
    empnit,
    cred: credenciales,
    header: documento.header,
    lines: documento.lines,
    referencia: documento.referencia,
  });

  const felResult = await certifyWithInfile(xml, credenciales, identificador);
  await persistFelResult(pool, empnit, coddoc, correlativo, felResult);

  return {
    ok: true,
    coddoc,
    correlativo,
    satTipo,
    fel: {
      uuid: felResult.uuid,
      serie: felResult.serie,
      numero: felResult.numero,
      fecha: felResult.fechaCertificacion,
    },
  };
}

module.exports = { certificarDocumentoFel, persistFelResult };
