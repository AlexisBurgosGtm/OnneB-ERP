const sql = require('mssql');
const { isStatusEditable, STATUS_OPERADO, STATUS_BLOQUEADO } = require('./documento-status');
const { InventarioError, revertirMovimientoInventarioDocumento } = require('./inventario');

/** Tipos que marcan CORTE=SI al finalizar (no es corte de caja real). */
const TIPOS_ELIMINABLES_IGNORA_CORTE = new Set(['ENV', 'COT', 'RCC', 'CRS']);

class DocumentoDeleteError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DocumentoDeleteError';
    this.statusCode = statusCode;
  }
}

async function loadDocumentoDeleteMeta(transaction, empnit, coddoc, correlativo) {
  const check = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT
        d.STATUS,
        ISNULL(d.CORTE, 'NO') AS CORTE,
        ISNULL(d.FEL_UUDI, '') AS FEL_UUDI,
        LTRIM(RTRIM(ISNULL(d.SERIEFAC, ''))) AS SERIEFAC,
        LTRIM(RTRIM(ISNULL(d.NOFAC, ''))) AS NOFAC,
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  return check.recordset[0] || null;
}

function assertPuedeEliminarDocumento(meta) {
  if (!meta) {
    throw new DocumentoDeleteError('Documento no encontrado', 404);
  }
  const tipodoc = String(meta.TIPODOC || '').trim().toUpperCase();
  const status = String(meta.STATUS || '').trim().toUpperCase();
  const corte = String(meta.CORTE || 'NO').trim().toUpperCase();
  const fel = String(meta.FEL_UUDI || '').trim();

  if (fel) {
    throw new DocumentoDeleteError('El documento está certificado FEL y no se puede eliminar');
  }
  if (status === 'A') {
    throw new DocumentoDeleteError('El documento está anulado y no se puede eliminar');
  }

  const ignoraCorte = TIPOS_ELIMINABLES_IGNORA_CORTE.has(tipodoc);
  if (ignoraCorte) {
    if (status !== STATUS_OPERADO && status !== STATUS_BLOQUEADO) {
      throw new DocumentoDeleteError('El documento no se puede eliminar en su estado actual');
    }
    return { tipodoc, status, corte, ignoraCorte: true };
  }

  if (!isStatusEditable(status)) {
    throw new DocumentoDeleteError('El documento no está operado y no se puede eliminar');
  }
  if (corte === 'SI') {
    throw new DocumentoDeleteError('El documento está incluido en corte de caja; no se puede eliminar');
  }
  return { tipodoc, status, corte, ignoraCorte: false };
}

/**
 * Tras borrar un RCC, recalcula abono/saldo de la factura vinculada (SERIEFAC/NOFAC).
 */
async function recalcularSaldoFacturaTrasBorrarRcc(transaction, empnit, seriefac, nofac) {
  const facCoddoc = String(seriefac || '').trim();
  const facCorrelativo = Number(String(nofac || '').trim());
  if (!facCoddoc || !Number.isFinite(facCorrelativo)) return;

  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('FAC_CODDOC', sql.VarChar, facCoddoc)
    .input('FAC_CORRELATIVO', sql.Decimal(18, 0), facCorrelativo)
    .query(`
      ;WITH AbonosFactura AS (
        SELECT
          ISNULL(SUM(ISNULL(a.TOTALPRECIO, 0)), 0) AS TOTAL_ABONOS
        FROM dbo.DOCUMENTOS a
        INNER JOIN dbo.TIPODOCUMENTOS ta ON ta.EMPNIT = a.EMPNIT AND ta.CODDOC = a.CODDOC
        WHERE a.EMPNIT = @EMPNIT
          AND a.STATUS = '${STATUS_OPERADO}'
          AND ta.TIPODOC IN ('RCC', 'DEV', 'FNC')
          AND LTRIM(RTRIM(ISNULL(a.SERIEFAC, ''))) = @FAC_CODDOC
          AND TRY_CAST(LTRIM(RTRIM(a.NOFAC)) AS DECIMAL(18, 0)) = @FAC_CORRELATIVO
      )
      UPDATE d
      SET
        d.DOC_ABONO = ISNULL(ab.TOTAL_ABONOS, 0),
        d.DOC_SALDO = CASE
          WHEN ISNULL(d.TOTALPRECIO, 0) - ISNULL(ab.TOTAL_ABONOS, 0) < 0 THEN 0
          ELSE ISNULL(d.TOTALPRECIO, 0) - ISNULL(ab.TOTAL_ABONOS, 0)
        END
      FROM dbo.DOCUMENTOS d
      CROSS JOIN AbonosFactura ab
      WHERE d.EMPNIT = @EMPNIT
        AND d.CODDOC = @FAC_CODDOC
        AND d.CORRELATIVO = @FAC_CORRELATIVO
    `);
}

/**
 * Elimina documento revirtiendo inventario de sus líneas (DOCPRODUCTOS + DOCUMENTOS).
 * ENV/COT/RCC/CRS pueden eliminarse aunque CORTE=SI o STATUS=I.
 */
async function deleteDocumentoOperado(pool, empnit, coddoc, correlativo) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const meta = await loadDocumentoDeleteMeta(transaction, empnit, coddoc, correlativo);
    const info = assertPuedeEliminarDocumento(meta);

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

    if (info.tipodoc === 'RCC') {
      await recalcularSaldoFacturaTrasBorrarRcc(transaction, empnit, meta.SERIEFAC, meta.NOFAC);
    }

    await transaction.commit();
    return { ok: true, CODDOC: coddoc, CORRELATIVO: correlativo, TIPODOC: info.tipodoc };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  DocumentoDeleteError,
  deleteDocumentoOperado,
  TIPOS_ELIMINABLES_IGNORA_CORTE,
};
