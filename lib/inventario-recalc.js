const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');
const { deduplicateInvSaldo, countDuplicateInvSaldo } = require('./invsaldo');
const { TIPODOC_ENTREGA_PARCIAL, ensureDocumentosEntregadoColumn } = require('./documentos-entregado');
const { ensureInventarioFisicoColumns } = require('./inventario');

/**
 * Movimientos desde DOCPRODUCTOS (documento no anulado).
 * SALDO/EXISTENCIA = SUM(TOTALUNIDADES × TIPOM)
 * FISICO = SUM(ENTREGADOS_TOTALUNIDADES × TIPOM)
 */
const SQL_TIPODOCS_ENTREGA = TIPODOC_ENTREGA_PARCIAL.map((t) => `'${t}'`).join(', ');

const LINE_MOV_CTE = `
  LineMov AS (
    SELECT
      l.EMPNIT,
      LTRIM(RTRIM(l.CODPROD)) AS CODPROD,
      CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT) AS DELTA,
      CAST(ISNULL(l.ENTREGADOS_TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT) AS DELTA_FISICO,
      CASE
        WHEN CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT) > 0
        THEN CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT)
        ELSE 0
      END AS ENTRADAS,
      CASE
        WHEN CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT) < 0
        THEN ABS(CAST(ISNULL(l.TOTALUNIDADES, 0) AS FLOAT) * CAST(ISNULL(l.TIPOM, 0) AS FLOAT))
        ELSE 0
      END AS SALIDAS
    FROM dbo.DOCPRODUCTOS l
    INNER JOIN dbo.DOCUMENTOS d
      ON d.EMPNIT = l.EMPNIT
      AND d.CODDOC = l.CODDOC
      AND d.CORRELATIVO = l.CORRELATIVO
    WHERE l.EMPNIT = @EMPNIT
      AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
      AND ISNULL(l.TIPOPROD, 'P') <> 'S'
      AND ISNULL(l.TIPOM, 0) <> 0
      AND (
        ISNULL(l.TOTALUNIDADES, 0) <> 0
        OR ISNULL(l.ENTREGADOS_TOTALUNIDADES, 0) <> 0
      )
  ),
  SaldoCalc AS (
    SELECT
      CODPROD,
      SUM(DELTA) AS SALDO,
      SUM(DELTA_FISICO) AS FISICO,
      SUM(ENTRADAS) AS TOTAL_ENTRADAS,
      SUM(SALIDAS) AS TOTAL_SALIDAS,
      COUNT(*) AS LINEAS
    FROM LineMov
    GROUP BY CODPROD
  ),
  PrimaryInv AS (
    SELECT
      i.ID,
      LTRIM(RTRIM(i.CODPROD)) AS CODPROD,
      ROW_NUMBER() OVER (
        PARTITION BY LTRIM(RTRIM(i.CODPROD))
        ORDER BY i.ID
      ) AS RN
    FROM dbo.INVSALDO i
    WHERE i.EMPNIT = @EMPNIT
  )
`;

function bindRecalcParams(request, empnit) {
  request.input('EMPNIT', sql.VarChar, empnit);
  request.input('STATUS_ANULADO', sql.VarChar, STATUS_ANULADO);
}

/**
 * Alinea ENTREGADOS_* antes del recalc de físico:
 * - tipodocs sin entrega parcial → ENTREGADOS = TOTAL*
 * - tipodocs con entrega y DOCUMENTOS.ENTREGADO = 1 → ENTREGADOS = TOTAL*
 */
async function backfillEntregadosParaFisico(transaction, empnit) {
  await ensureDocumentosEntregadoColumn(transaction);
  const noEntrega = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      UPDATE l
      SET
        l.ENTREGADOS_TOTALUNIDADES = ISNULL(l.TOTALUNIDADES, 0),
        l.ENTREGADOS_TOTALCOSTO = ISNULL(l.TOTALCOSTO, 0),
        l.ENTREGADOS_TOTALPRECIO = ISNULL(l.TOTALPRECIO, 0)
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = l.EMPNIT AND t.CODDOC = l.CODDOC
      WHERE l.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, l.CODDOC)))) NOT IN (${SQL_TIPODOCS_ENTREGA})
        AND (
          ISNULL(l.ENTREGADOS_TOTALUNIDADES, 0) <> ISNULL(l.TOTALUNIDADES, 0)
          OR ISNULL(l.ENTREGADOS_TOTALCOSTO, 0) <> ISNULL(l.TOTALCOSTO, 0)
          OR ISNULL(l.ENTREGADOS_TOTALPRECIO, 0) <> ISNULL(l.TOTALPRECIO, 0)
        )
    `);

  const entregadosCompletos = await transaction
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .query(`
      UPDATE l
      SET
        l.ENTREGADOS_TOTALUNIDADES = ISNULL(l.TOTALUNIDADES, 0),
        l.ENTREGADOS_TOTALCOSTO = ISNULL(l.TOTALCOSTO, 0),
        l.ENTREGADOS_TOTALPRECIO = ISNULL(l.TOTALPRECIO, 0)
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = l.EMPNIT AND t.CODDOC = l.CODDOC
      WHERE l.EMPNIT = @EMPNIT
        AND UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, l.CODDOC)))) IN (${SQL_TIPODOCS_ENTREGA})
        AND ISNULL(TRY_CAST(d.ENTREGADO AS INT), 0) = 1
        AND (
          ISNULL(l.ENTREGADOS_TOTALUNIDADES, 0) <> ISNULL(l.TOTALUNIDADES, 0)
          OR ISNULL(l.ENTREGADOS_TOTALCOSTO, 0) <> ISNULL(l.TOTALCOSTO, 0)
          OR ISNULL(l.ENTREGADOS_TOTALPRECIO, 0) <> ISNULL(l.TOTALPRECIO, 0)
        )
    `);

  return {
    noEntrega: noEntrega.rowsAffected?.[0] ?? 0,
    entregadosCompletos: entregadosCompletos.rowsAffected?.[0] ?? 0,
  };
}

/**
 * Resumen previo a la actualización global de inventario.
 * @param {import('mssql').ConnectionPool} pool
 */
async function previewRecalcInventario(pool, empnit) {
  const empnitTrim = String(empnit || '').trim();
  if (!empnitTrim) throw new Error('EMPNIT requerido');

  await ensureInventarioFisicoColumns(pool);
  const duplicados = await countDuplicateInvSaldo(pool, empnitTrim);

  const nullTipomReq = pool.request();
  bindRecalcParams(nullTipomReq, empnitTrim);
  const nullTipomRes = await nullTipomReq.query(`
    SELECT COUNT(*) AS cnt
    FROM dbo.DOCPRODUCTOS l
    INNER JOIN dbo.DOCUMENTOS d
      ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
    WHERE l.EMPNIT = @EMPNIT
      AND ISNULL(d.STATUS, '') <> @STATUS_ANULADO
      AND l.TIPOM IS NULL
  `);

  const req = pool.request();
  bindRecalcParams(req, empnitTrim);
  const result = await req.query(`
    WITH ${LINE_MOV_CTE}
    SELECT
      (SELECT COUNT(*) FROM LineMov) AS lineas,
      (SELECT COUNT(*) FROM SaldoCalc) AS productos,
      (SELECT ISNULL(SUM(TOTAL_ENTRADAS), 0) FROM SaldoCalc) AS totalEntradas,
      (SELECT ISNULL(SUM(TOTAL_SALIDAS), 0) FROM SaldoCalc) AS totalSalidas,
      (SELECT ISNULL(SUM(SALDO), 0) FROM SaldoCalc) AS saldoNeto,
      (SELECT ISNULL(SUM(FISICO), 0) FROM SaldoCalc) AS fisicoNeto,
      (
        SELECT COUNT(*)
        FROM SaldoCalc sc
        INNER JOIN PrimaryInv pi ON pi.CODPROD = sc.CODPROD AND pi.RN = 1
        INNER JOIN dbo.INVSALDO i ON i.ID = pi.ID
        WHERE ABS(ISNULL(i.SALDO, 0) - ISNULL(sc.SALDO, 0)) > 0.0005
           OR ABS(ISNULL(i.FISICO, ISNULL(i.SALDO, 0)) - ISNULL(sc.FISICO, 0)) > 0.0005
      ) AS discrepancias,
      (
        SELECT COUNT(*)
        FROM PrimaryInv pi
        INNER JOIN dbo.INVSALDO i ON i.ID = pi.ID
        WHERE pi.RN = 1
          AND NOT EXISTS (SELECT 1 FROM SaldoCalc sc WHERE sc.CODPROD = pi.CODPROD)
          AND (ISNULL(i.SALDO, 0) <> 0 OR ISNULL(i.FISICO, 0) <> 0)
      ) AS invsaldoSinMovimiento,
      (
        SELECT COUNT(*)
        FROM SaldoCalc sc
        WHERE NOT EXISTS (SELECT 1 FROM PrimaryInv pi WHERE pi.CODPROD = sc.CODPROD)
      ) AS productosSinInvSaldo
  `);

  const row = result.recordset[0] || {};
  return {
    empnit: empnitTrim,
    lineas: row.lineas ?? 0,
    productos: row.productos ?? 0,
    totalEntradas: row.totalEntradas ?? 0,
    totalSalidas: row.totalSalidas ?? 0,
    saldoNeto: row.saldoNeto ?? 0,
    fisicoNeto: row.fisicoNeto ?? 0,
    discrepancias: row.discrepancias ?? 0,
    invsaldoSinMovimiento: row.invsaldoSinMovimiento ?? 0,
    registrosDuplicados: duplicados,
    productosSinInvSaldo: row.productosSinInvSaldo ?? 0,
    tipomNulos: nullTipomRes.recordset[0]?.cnt ?? 0,
  };
}

/**
 * Rellena DOCPRODUCTOS.TIPOM NULL con TIPODOCUMENTOS.TIPOM actual.
 */
async function corregirTipomNulos(pool, empnit) {
  const empnitTrim = String(empnit || '').trim();
  if (!empnitTrim) throw new Error('EMPNIT requerido');

  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnitTrim)
    .query(`
      UPDATE l
      SET l.TIPOM = ISNULL(t.TIPOM, 0)
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = l.EMPNIT AND t.CODDOC = l.CODDOC
      WHERE l.EMPNIT = @EMPNIT
        AND l.TIPOM IS NULL
    `);

  const actualizados = result.rowsAffected?.[0] ?? 0;
  const preview = await previewRecalcInventario(pool, empnitTrim);
  return { ok: true, actualizados, tipomNulosRestantes: preview.tipomNulos ?? 0, resumen: preview };
}

/**
 * Recalcula INVSALDO (SALDO + FISICO) y PRODUCTOS.EXISTENCIA + PRODUCTOS.FISICO.
 * @param {import('mssql').ConnectionPool} pool
 */
async function ejecutarRecalcInventario(pool, empnit) {
  const empnitTrim = String(empnit || '').trim();
  if (!empnitTrim) throw new Error('EMPNIT requerido');

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await ensureInventarioFisicoColumns(transaction);
    const backfill = await backfillEntregadosParaFisico(transaction, empnitTrim);
    const dedupe = await deduplicateInvSaldo(transaction, empnitTrim);

    const updReq = transaction.request();
    bindRecalcParams(updReq, empnitTrim);
    const upd = await updReq.query(`
      WITH ${LINE_MOV_CTE}
      UPDATE i
      SET i.SALDO = sc.SALDO,
          i.FISICO = sc.FISICO
      FROM dbo.INVSALDO i
      INNER JOIN PrimaryInv pi ON pi.ID = i.ID AND pi.RN = 1
      INNER JOIN SaldoCalc sc ON sc.CODPROD = pi.CODPROD
      WHERE i.EMPNIT = @EMPNIT
    `);

    const zeroReq = transaction.request();
    bindRecalcParams(zeroReq, empnitTrim);
    const zero = await zeroReq.query(`
      WITH ${LINE_MOV_CTE}
      UPDATE i
      SET i.SALDO = 0,
          i.FISICO = 0
      FROM dbo.INVSALDO i
      INNER JOIN PrimaryInv pi ON pi.ID = i.ID AND pi.RN = 1
      WHERE i.EMPNIT = @EMPNIT
        AND NOT EXISTS (SELECT 1 FROM SaldoCalc sc WHERE sc.CODPROD = pi.CODPROD)
        AND (ISNULL(i.SALDO, 0) <> 0 OR ISNULL(i.FISICO, 0) <> 0)
    `);

    const dupAfter = await deduplicateInvSaldo(transaction, empnitTrim);

    const prodReq = transaction.request();
    bindRecalcParams(prodReq, empnitTrim);
    const prod = await prodReq.query(`
      WITH ${LINE_MOV_CTE}
      UPDATE p
      SET p.EXISTENCIA = ISNULL(sc.SALDO, 0),
          p.FISICO = ISNULL(sc.FISICO, 0)
      FROM dbo.PRODUCTOS p
      INNER JOIN PrimaryInv pi ON pi.CODPROD = LTRIM(RTRIM(p.CODPROD)) AND pi.RN = 1
      LEFT JOIN SaldoCalc sc ON sc.CODPROD = LTRIM(RTRIM(p.CODPROD))
      WHERE p.EMPNIT = @EMPNIT
        AND ISNULL(p.TIPOPROD, 'P') <> 'S'
    `);

    const prodZeroReq = transaction.request();
    bindRecalcParams(prodZeroReq, empnitTrim);
    const prodZero = await prodZeroReq.query(`
      WITH ${LINE_MOV_CTE}
      UPDATE p
      SET p.EXISTENCIA = 0,
          p.FISICO = 0
      FROM dbo.PRODUCTOS p
      WHERE p.EMPNIT = @EMPNIT
        AND ISNULL(p.TIPOPROD, 'P') <> 'S'
        AND (ISNULL(p.EXISTENCIA, 0) <> 0 OR ISNULL(p.FISICO, 0) <> 0)
        AND NOT EXISTS (
          SELECT 1 FROM PrimaryInv pi WHERE pi.CODPROD = LTRIM(RTRIM(p.CODPROD))
        )
    `);

    await transaction.commit();

    const resumen = await previewRecalcInventario(pool, empnitTrim);
    return {
      ok: true,
      entregadosAlineados: backfill,
      duplicadosEliminados: (dedupe.eliminados ?? 0) + (dupAfter.eliminados ?? 0),
      bodegasNormalizadas: (dedupe.bodegasNormalizadas ?? 0) + (dupAfter.bodegasNormalizadas ?? 0),
      actualizados: upd.rowsAffected[0] ?? 0,
      puestosEnCero: zero.rowsAffected[0] ?? 0,
      productosActualizados: prod.rowsAffected[0] ?? 0,
      productosEnCero: prodZero.rowsAffected[0] ?? 0,
      resumen,
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = {
  previewRecalcInventario,
  ejecutarRecalcInventario,
  corregirTipomNulos,
  backfillEntregadosParaFisico,
};
