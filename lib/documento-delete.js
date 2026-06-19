const sql = require('mssql');
const { isStatusEditable } = require('./documento-status');
const { InventarioError, revertirMovimientoInventarioDocumento } = require('./inventario');

class DocumentoDeleteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DocumentoDeleteError';
    this.statusCode = statusCode;
  }
}

/**
 * Elimina documento operado revirtiendo inventario de sus líneas (DOCPRODUCTOS + DOCUMENTOS).
 */
async function deleteDocumentoOperado(pool, empnit, coddoc, correlativo) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const check = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        SELECT STATUS, ISNULL(CORTE, 'NO') AS CORTE
        FROM dbo.DOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    if (!check.recordset.length) {
      throw new DocumentoDeleteError('Documento no encontrado', 404);
    }

    const meta = check.recordset[0];
    if (!isStatusEditable(meta.STATUS)) {
      throw new DocumentoDeleteError('El documento no está operado y no se puede eliminar');
    }
    if (String(meta.CORTE || 'NO').trim().toUpperCase() === 'SI') {
      throw new DocumentoDeleteError('El documento está incluido en corte de caja; no se puede eliminar');
    }

    await revertirMovimientoInventarioDocumento(transaction, { empnit, coddoc, correlativo });

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        DELETE FROM dbo.DOCPRODUCTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    const del = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, coddoc)
      .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
      .query(`
        DELETE FROM dbo.DOCUMENTOS
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      `);

    if (del.rowsAffected[0] === 0) {
      throw new DocumentoDeleteError('Documento no encontrado', 404);
    }

    await transaction.commit();
    return { ok: true, CODDOC: coddoc, CORRELATIVO: correlativo };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  DocumentoDeleteError,
  deleteDocumentoOperado,
};
