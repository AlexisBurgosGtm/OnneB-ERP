const sql = require('mssql');
const { roundMoney } = require('./libro-contable-utils');
const {
  getIvaFactor,
  getRetencionIvaPorcentaje,
  getRetencionIsrPorcentaje,
} = require('./impuestos');

async function recalcImpuestosDocumentos(pool, empnit) {
  const ivaFactor = await getIvaFactor(pool);
  const rtvPct = await getRetencionIvaPorcentaje(pool);
  const rtiPct = await getRetencionIsrPorcentaje(pool);

  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const lineas = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .input('IVA_FACTOR', sql.Float, ivaFactor)
      .query(`
        UPDATE dbo.DOCPRODUCTOS
        SET
          TOTALSINIVA = CASE
            WHEN ISNULL(EXENTO, 0) > 0 THEN 0
            ELSE ROUND(CAST(TOTALPRECIO AS FLOAT) / @IVA_FACTOR, 3)
          END,
          TOTALIVA = CASE
            WHEN ISNULL(EXENTO, 0) > 0 THEN 0
            ELSE ROUND(CAST(TOTALPRECIO AS FLOAT) - (CAST(TOTALPRECIO AS FLOAT) / @IVA_FACTOR), 3)
          END
        OUTPUT INSERTED.ID
        WHERE EMPNIT = @EMPNIT
      `);

    const docs = await transaction
      .request()
      .input('EMPNIT', sql.VarChar, empnit)
      .query(`
        UPDATE d
        SET
          TOTALCOSTO = agg.TOTALCOSTO,
          TOTALPRECIO = agg.TOTALPRECIO,
          TOTALIVA = agg.TOTALIVA,
          TOTALSINIVA = agg.TOTALSINIVA,
          TOTALEXENTO = agg.TOTALEXENTO,
          PAGO = CASE
            WHEN ISNULL(d.PAGO, 0) = ISNULL(d.TOTALPRECIO, 0) OR d.PAGO IS NULL THEN agg.TOTALPRECIO
            ELSE d.PAGO
          END,
          DOC_ABONO = CASE
            WHEN ISNULL(d.DOC_ABONO, 0) = ISNULL(d.TOTALPRECIO, 0) OR d.DOC_ABONO IS NULL THEN agg.TOTALPRECIO
            ELSE d.DOC_ABONO
          END
        OUTPUT INSERTED.ID
        FROM dbo.DOCUMENTOS d
        INNER JOIN (
          SELECT
            EMPNIT,
            CODDOC,
            CORRELATIVO,
            ROUND(ISNULL(SUM(TOTALCOSTO), 0), 3) AS TOTALCOSTO,
            ROUND(ISNULL(SUM(TOTALPRECIO), 0), 3) AS TOTALPRECIO,
            ROUND(ISNULL(SUM(TOTALIVA), 0), 3) AS TOTALIVA,
            ROUND(ISNULL(SUM(TOTALSINIVA), 0), 3) AS TOTALSINIVA,
            ROUND(
              ISNULL(SUM(CASE WHEN ISNULL(EXENTO, 0) > 0 THEN TOTALPRECIO ELSE 0 END), 0),
              3
            ) AS TOTALEXENTO
          FROM dbo.DOCPRODUCTOS
          WHERE EMPNIT = @EMPNIT
          GROUP BY EMPNIT, CODDOC, CORRELATIVO
        ) agg
          ON agg.EMPNIT = d.EMPNIT
         AND agg.CODDOC = d.CODDOC
         AND agg.CORRELATIVO = d.CORRELATIVO
        WHERE d.EMPNIT = @EMPNIT
      `);

    let rtvDocs = 0;
    if (rtvPct > 0) {
      const rtv = await transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('PCT', sql.Float, rtvPct)
        .input('IVA_FACTOR', sql.Float, ivaFactor)
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET
            TOTALIVA = ROUND(
              ISNULL(TOTALSINIVA, 0) * (@IVA_FACTOR - 1.0) * @PCT / 100.0,
              3
            ),
            TOTALPRECIO = ROUND(
              ISNULL(TOTALSINIVA, 0) * (@IVA_FACTOR - 1.0) * @PCT / 100.0,
              3
            )
          OUTPUT INSERTED.ID
          WHERE EMPNIT = @EMPNIT
            AND TIPODOC = 'RTV'
            AND ISNULL(STATUS, '') <> 'A'
            AND ISNULL(TOTALSINIVA, 0) > 0
        `);
      rtvDocs = rtv.recordset.length;
    }

    let rtiDocs = 0;
    if (rtiPct > 0) {
      const rti = await transaction
        .request()
        .input('EMPNIT', sql.VarChar, empnit)
        .input('PCT', sql.Float, rtiPct)
        .query(`
          UPDATE dbo.DOCUMENTOS
          SET
            TOTALIVA = ROUND(ISNULL(TOTALSINIVA, 0) * @PCT / 100.0, 3),
            TOTALPRECIO = ROUND(ISNULL(TOTALSINIVA, 0) * @PCT / 100.0, 3)
          OUTPUT INSERTED.ID
          WHERE EMPNIT = @EMPNIT
            AND TIPODOC = 'RTI'
            AND ISNULL(STATUS, '') <> 'A'
            AND ISNULL(TOTALSINIVA, 0) > 0
        `);
      rtiDocs = rti.recordset.length;
    }

    await transaction.commit();

    return {
      ok: true,
      ivaFactor: roundMoney(ivaFactor),
      retencionIvaPorcentaje: roundMoney(rtvPct),
      retencionIsrPorcentaje: roundMoney(rtiPct),
      lineasActualizadas: lineas.recordset.length,
      documentosActualizados: docs.recordset.length,
      retencionesIvaActualizadas: rtvDocs,
      retencionesIsrActualizadas: rtiDocs,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { recalcImpuestosDocumentos };
