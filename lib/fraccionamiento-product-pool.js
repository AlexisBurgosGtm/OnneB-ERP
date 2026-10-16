const sql = require('mssql');
const { STATUS_ANULADO } = require('./documento-status');

const TIPODOC_CERT_FAC = ['FEF', 'FEC'];

function tipodocSqlIn(tipodocs) {
  return tipodocs.map((t) => `'${String(t).replace(/'/g, "''")}'`).join(', ');
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function roundQty(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/**
 * Pool de líneas fuente menos lo ya emitido en fiscales (SERIEFAC/NOFAC).
 * Conserva PRECIO/CODPROD/CODMEDIDA; solo reparte CANTIDAD.
 */
async function buildRemainingProductPool(txOrPool, empnit, srcCoddoc, srcCorrelativo) {
  const srcRes = await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, srcCoddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), srcCorrelativo)
    .query(`
      SELECT *
      FROM dbo.DOCPRODUCTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND CORRELATIVO = @CORRELATIVO
      ORDER BY ID
    `);
  const pool = (srcRes.recordset || []).map((l) => ({
    src: l,
    restante: roundQty(l.CANTIDAD),
  }));
  if (!pool.length) {
    const err = new Error('El documento fuente no tiene líneas');
    err.statusCode = 400;
    throw err;
  }

  const issuedRes = await new sql.Request(txOrPool)
    .input('EMPNIT', sql.VarChar, empnit)
    .input('SERIEFAC', sql.VarChar, srcCoddoc)
    .input('CORR_SRC', sql.Decimal(18, 0), srcCorrelativo)
    .query(`
      SELECT l.ID, l.CODPROD, l.CODMEDIDA, l.PRECIO, l.CANTIDAD, l.OBS
      FROM dbo.DOCPRODUCTOS l
      INNER JOIN dbo.DOCUMENTOS d
        ON d.EMPNIT = l.EMPNIT AND d.CODDOC = l.CODDOC AND d.CORRELATIVO = l.CORRELATIVO
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT
        AND t.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
        AND d.SERIEFAC = @SERIEFAC
        AND TRY_CAST(LTRIM(RTRIM(d.NOFAC)) AS DECIMAL(18, 0)) = @CORR_SRC
        AND d.STATUS <> '${STATUS_ANULADO}'
      ORDER BY d.ID, l.ID
    `);

  for (const iss of issuedRes.recordset || []) {
    const qty = roundQty(iss.CANTIDAD);
    if (!(qty > 0)) continue;
    const obs = String(iss.OBS || '');
    const m = /^FFACSRC:(\d+)/i.exec(obs);
    let item = null;
    if (m) {
      const srcId = Number(m[1]);
      item = pool.find((p) => Number(p.src.ID) === srcId && p.restante > 0);
    }
    if (!item) {
      const precio = roundMoney(iss.PRECIO);
      const codprod = String(iss.CODPROD || '').trim();
      const codmedida = String(iss.CODMEDIDA || '').trim();
      item = pool.find(
        (p) =>
          p.restante > 0 &&
          String(p.src.CODPROD || '').trim() === codprod &&
          String(p.src.CODMEDIDA || '').trim() === codmedida &&
          roundMoney(p.src.PRECIO) === precio
      );
    }
    if (!item) continue;
    item.restante = roundQty(Math.max(0, item.restante - qty));
  }

  return pool;
}

function poolRestanteTotal(pool) {
  return roundMoney(
    pool.reduce((s, p) => {
      const precio = Number(p.src.PRECIO) || 0;
      const qty = Number(p.restante) || 0;
      return s + precio * qty;
    }, 0)
  );
}

/** Líneas con cantidad pendiente y monto (PRECIO × restante). */
function pendingLinesFromPool(pool) {
  const out = [];
  for (const p of pool || []) {
    const qty = roundQty(p.restante);
    if (!(qty > 0.0005)) continue;
    const precio = Number(p.src.PRECIO) || 0;
    out.push({
      CODPROD: String(p.src.CODPROD || '').trim(),
      DESPROD: String(p.src.DESPROD || '').trim(),
      CODMEDIDA: String(p.src.CODMEDIDA || '').trim(),
      CANTIDAD: qty,
      PRECIO: precio,
      TOTALPRECIO: roundMoney(qty * precio),
    });
  }
  return out;
}

/** Todas las líneas fuente con cantidades pedidas vs pendientes FEL. */
function detalleLineasFromPool(pool) {
  const out = [];
  for (const p of pool || []) {
    const pedida = roundQty(p.src.CANTIDAD);
    const pendiente = roundQty(p.restante);
    const facturada = roundQty(Math.max(0, pedida - pendiente));
    const precio = Number(p.src.PRECIO) || 0;
    out.push({
      LINE_ID: p.src.ID,
      CODPROD: String(p.src.CODPROD || '').trim(),
      DESPROD: String(p.src.DESPROD || '').trim(),
      CODMEDIDA: String(p.src.CODMEDIDA || '').trim(),
      PRECIO: precio,
      CANTIDAD_PEDIDA: pedida,
      CANTIDAD_FACTURADA_FEL: facturada,
      CANTIDAD_PENDIENTE_FEL: pendiente,
      TOTAL_PEDIDO: roundMoney(Number(p.src.TOTALPRECIO) || precio * pedida),
      TOTAL_PENDIENTE_FEL: roundMoney(precio * pendiente),
    });
  }
  return out;
}

module.exports = {
  TIPODOC_CERT_FAC,
  tipodocSqlIn,
  roundMoney,
  roundQty,
  buildRemainingProductPool,
  poolRestanteTotal,
  pendingLinesFromPool,
  detalleLineasFromPool,
};
