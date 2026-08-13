const sql = require('mssql');
const { STATUS_OPERADO } = require('./documento-status');

class DocumentoSerieError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DocumentoSerieError';
    this.statusCode = statusCode;
  }
}

function parseCorrelativo(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function allocateCorrelativo(transaction, empnit, coddoc) {
  const tipoRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT CORRELATIVO FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr FROM dbo.DOCUMENTOS WITH (UPDLOCK, HOLDLOCK)
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  const next = Math.max(tipoCorr, maxCorr) + 1;
  await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORR', sql.Decimal(18, 0), next)
    .query(`
      UPDATE dbo.TIPODOCUMENTOS SET CORRELATIVO = @CORR
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  return next;
}

async function previewSiguienteCorrelativo(pool, empnit, coddoc) {
  const tipoRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(CORRELATIVO, 0) AS CORRELATIVO
      FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const maxRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT ISNULL(MAX(CORRELATIVO), 0) AS maxCorr
      FROM dbo.DOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
    `);
  const tipoCorr = Number(tipoRes.recordset[0]?.CORRELATIVO) || 0;
  const maxCorr = Number(maxRes.recordset[0]?.maxCorr) || 0;
  return Math.max(tipoCorr, maxCorr) + 1;
}

/**
 * Series (CODDOC) activas del mismo TIPODOC que el documento origen.
 */
async function listSeriesAlternas(pool, empnit, coddoc, correlativo) {
  const corr = parseCorrelativo(correlativo);
  if (!coddoc || corr === null) {
    throw new DocumentoSerieError('Documento inválido');
  }

  const origenRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), corr)
    .query(`
      SELECT
        d.CODDOC,
        d.CORRELATIVO,
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        LTRIM(RTRIM(ISNULL(t.DESDOC, ''))) AS DESDOC,
        ISNULL(d.STATUS, '') AS STATUS,
        ISNULL(d.CORTE, 'NO') AS CORTE,
        LTRIM(RTRIM(ISNULL(d.FEL_UUDI, ''))) AS FEL_UUDI
      FROM dbo.DOCUMENTOS d
      LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const origen = origenRes.recordset[0];
  if (!origen) throw new DocumentoSerieError('Documento no encontrado', 404);

  const tipodoc = String(origen.TIPODOC || '').trim().toUpperCase();
  if (!tipodoc) {
    throw new DocumentoSerieError('El documento no tiene TIPODOC configurado');
  }

  const seriesRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('TIPODOC', sql.VarChar, tipodoc)
    .input('CODDOC', sql.VarChar, coddoc)
    .query(`
      SELECT
        t.CODDOC,
        LTRIM(RTRIM(ISNULL(t.DESDOC, ''))) AS DESDOC,
        UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC,
        ISNULL(t.CORRELATIVO, 0) AS CORRELATIVO_TIPO
      FROM dbo.TIPODOCUMENTOS t
      WHERE t.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) = @TIPODOC
        AND UPPER(LTRIM(RTRIM(ISNULL(t.ACTIVO, 'SI')))) = 'SI'
        AND LTRIM(RTRIM(t.CODDOC)) <> LTRIM(RTRIM(@CODDOC))
      ORDER BY t.CODDOC
    `);

  const rows = [];
  for (const r of seriesRes.recordset) {
    const serieCod = String(r.CODDOC || '').trim();
    const preview = await previewSiguienteCorrelativo(pool, empnit, serieCod);
    rows.push({
      CODDOC: serieCod,
      DESDOC: String(r.DESDOC || '').trim() || serieCod,
      TIPODOC: String(r.TIPODOC || '').trim().toUpperCase(),
      SIGUIENTE_CORRELATIVO: preview,
    });
  }

  return {
    origen: {
      CODDOC: String(origen.CODDOC || '').trim(),
      CORRELATIVO: Number(origen.CORRELATIVO),
      TIPODOC: tipodoc,
      DESDOC: String(origen.DESDOC || '').trim(),
      STATUS: String(origen.STATUS || '').trim(),
      CORTE: String(origen.CORTE || 'NO').trim().toUpperCase(),
      FEL_UUDI: String(origen.FEL_UUDI || '').trim(),
    },
    rows,
  };
}

function assertPuedeCambiarSerie(meta) {
  if (!meta) throw new DocumentoSerieError('Documento no encontrado', 404);
  if (String(meta.STATUS || '').trim().toUpperCase() === 'A') {
    throw new DocumentoSerieError('El documento está anulado y no permite cambiar serie');
  }
  if (String(meta.STATUS || '').trim().toUpperCase() !== STATUS_OPERADO) {
    throw new DocumentoSerieError('Solo documentos operados permiten cambiar serie');
  }
}

/**
 * Reasigna CODDOC+CORRELATIVO del documento y actualiza referencias SERIEFAC/NOFAC
 * y DOCUMENTOS_FACTURAS_ABONADAS (CODDOC/CORRELATIVO, CODDOC_REC, CODDOC_FAC).
 * El nuevo correlativo es el siguiente disponible de la serie destino.
 */
async function cambiarSerieInterna(pool, empnit, coddocOrigen, correlativoOrigen, nuevoCoddoc) {
  const oldCod = String(coddocOrigen || '').trim();
  const oldCorr = parseCorrelativo(correlativoOrigen);
  const newCod = String(nuevoCoddoc || '').trim();
  if (!oldCod || oldCorr === null) throw new DocumentoSerieError('Documento inválido');
  if (!newCod) throw new DocumentoSerieError('Seleccione la nueva serie (CODDOC)');
  if (oldCod.toUpperCase() === newCod.toUpperCase()) {
    throw new DocumentoSerieError('La serie destino debe ser distinta a la actual');
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const origenRes = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, oldCod)
      .input('CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .query(`
        SELECT
          d.STATUS,
          ISNULL(d.CORTE, 'NO') AS CORTE,
          LTRIM(RTRIM(ISNULL(d.FEL_UUDI, ''))) AS FEL_UUDI,
          UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) AS TIPODOC
        FROM dbo.DOCUMENTOS d WITH (UPDLOCK, ROWLOCK)
        LEFT JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
        WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
      `);
    const origen = origenRes.recordset[0];
    assertPuedeCambiarSerie(origen);
    const tipodocOrigen = String(origen.TIPODOC || '').trim().toUpperCase();
    if (!tipodocOrigen) {
      throw new DocumentoSerieError('El documento no tiene TIPODOC configurado');
    }

    const destRes = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('CODDOC', sql.VarChar, newCod)
      .query(`
        SELECT
          LTRIM(RTRIM(CODDOC)) AS CODDOC,
          LTRIM(RTRIM(ISNULL(DESDOC, ''))) AS DESDOC,
          UPPER(LTRIM(RTRIM(ISNULL(TIPODOC, '')))) AS TIPODOC,
          UPPER(LTRIM(RTRIM(ISNULL(ACTIVO, 'SI')))) AS ACTIVO
        FROM dbo.TIPODOCUMENTOS WITH (UPDLOCK, ROWLOCK)
        WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC
      `);
    const dest = destRes.recordset[0];
    if (!dest) throw new DocumentoSerieError('Serie destino no encontrada', 404);
    if (dest.ACTIVO !== 'SI') {
      throw new DocumentoSerieError('La serie destino no está habilitada');
    }
    if (String(dest.TIPODOC || '').trim().toUpperCase() !== tipodocOrigen) {
      throw new DocumentoSerieError(
        `La serie destino debe ser del mismo tipo (${tipodocOrigen})`
      );
    }

    const newCorr = await allocateCorrelativo(transaction, empnit, newCod);
    const oldNofac = String(oldCorr);
    const newNofac = String(newCorr);

    await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_CORRELATIVO', sql.Decimal(18, 0), newCorr)
      .query(`
        UPDATE dbo.DOCPRODUCTOS
        SET CODDOC = @NEW_CODDOC, CORRELATIVO = @NEW_CORRELATIVO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @OLD_CODDOC AND CORRELATIVO = @OLD_CORRELATIVO
      `);

    const docUpd = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_CORRELATIVO', sql.Decimal(18, 0), newCorr)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET CODDOC = @NEW_CODDOC, CORRELATIVO = @NEW_CORRELATIVO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @OLD_CODDOC AND CORRELATIVO = @OLD_CORRELATIVO
      `);
    if (!docUpd.rowsAffected[0]) {
      throw new DocumentoSerieError('No se pudo actualizar el documento', 500);
    }

    const refSeriefac = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('OLD_NOFAC', sql.VarChar, oldNofac)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_NOFAC', sql.VarChar, newNofac)
      .query(`
        UPDATE dbo.DOCUMENTOS
        SET SERIEFAC = @NEW_CODDOC, NOFAC = @NEW_NOFAC
        WHERE EMPNIT = @EMPNIT
          AND LTRIM(RTRIM(ISNULL(SERIEFAC, ''))) = @OLD_CODDOC
          AND (
            TRY_CAST(LTRIM(RTRIM(NOFAC)) AS DECIMAL(18, 0)) = @OLD_CORRELATIVO
            OR LTRIM(RTRIM(ISNULL(NOFAC, ''))) = @OLD_NOFAC
          )
      `);

    const refAbonosDoc = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_CORRELATIVO', sql.Decimal(18, 0), newCorr)
      .query(`
        UPDATE dbo.DOCUMENTOS_FACTURAS_ABONADAS
        SET CODDOC = @NEW_CODDOC, CORRELATIVO = @NEW_CORRELATIVO
        WHERE EMPNIT = @EMPNIT AND CODDOC = @OLD_CODDOC AND CORRELATIVO = @OLD_CORRELATIVO
      `);

    const refAbonosRec = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_CORRELATIVO', sql.Decimal(18, 0), newCorr)
      .query(`
        UPDATE dbo.DOCUMENTOS_FACTURAS_ABONADAS
        SET CODDOC_REC = @NEW_CODDOC, CORRELATIVO_REC = @NEW_CORRELATIVO
        WHERE EMPNIT = @EMPNIT
          AND LTRIM(RTRIM(ISNULL(CODDOC_REC, ''))) = @OLD_CODDOC
          AND CORRELATIVO_REC = @OLD_CORRELATIVO
      `);

    const refAbonosFac = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('OLD_CODDOC', sql.VarChar, oldCod)
      .input('OLD_CORRELATIVO', sql.Decimal(18, 0), oldCorr)
      .input('NEW_CODDOC', sql.VarChar, newCod)
      .input('NEW_CORRELATIVO', sql.Decimal(18, 0), newCorr)
      .query(`
        UPDATE dbo.DOCUMENTOS_FACTURAS_ABONADAS
        SET CODDOC_FAC = @NEW_CODDOC, CORRELATIVO_FAC = @NEW_CORRELATIVO
        WHERE EMPNIT = @EMPNIT
          AND LTRIM(RTRIM(ISNULL(CODDOC_FAC, ''))) = @OLD_CODDOC
          AND CORRELATIVO_FAC = @OLD_CORRELATIVO
      `);

    await transaction.commit();
    return {
      ok: true,
      ORIGEN: { CODDOC: oldCod, CORRELATIVO: oldCorr },
      DESTINO: { CODDOC: newCod, CORRELATIVO: newCorr, DESDOC: dest.DESDOC },
      TIPODOC: tipodocOrigen,
      actualizados: {
        seriefacNofac: Number(refSeriefac.rowsAffected[0]) || 0,
        abonosDocumento: Number(refAbonosDoc.rowsAffected[0]) || 0,
        abonosRecibo: Number(refAbonosRec.rowsAffected[0]) || 0,
        abonosFactura: Number(refAbonosFac.rowsAffected[0]) || 0,
      },
    };
  } catch (err) {
    try {
      await transaction.rollback();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

module.exports = {
  DocumentoSerieError,
  listSeriesAlternas,
  cambiarSerieInterna,
};
