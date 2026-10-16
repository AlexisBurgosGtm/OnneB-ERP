const sql = require('mssql');
const { STATUS_ANULADO, SQL_TIPODOC_REPORTES_SI } = require('./documento-status');
const { fechaIsoFromRow, normalizeDocumentoRows } = require('./documento-fecha');
const {
  tipodocSqlIn,
  TIPODOC_CERT_FAC,
  roundMoney,
  roundQty,
  buildRemainingProductPool,
  poolRestanteTotal,
  pendingLinesFromPool,
  detalleLineasFromPool,
} = require('./fraccionamiento-product-pool');

const PENDING_EPS = 0.005;

function parseMesAnio(mesRaw, anioRaw) {
  const now = new Date();
  let mes = parseInt(String(mesRaw ?? ''), 10);
  let anio = parseInt(String(anioRaw ?? ''), 10);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) mes = now.getMonth() + 1;
  if (!Number.isFinite(anio) || anio < 2000) anio = now.getFullYear();
  return { mes, anio };
}

function estadoFraccionamiento(row) {
  const emb = String(row.CODEMBARQUE || '').trim().toUpperCase();
  const emitido = Number(row.TOTAL_EMITIDO) || 0;
  if (row.COLA_ABIERTA === 1 || row.COLA_ABIERTA === true) return 'EN_COLA';
  if (emb === 'FRACCIONADA') return 'FRACCIONADA';
  if (emitido > PENDING_EPS) return 'PARCIAL';
  return 'SIN_FEL';
}

async function listFacBase(pool, empnit, mes, anio) {
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        d.EMPNIT, d.CODDOC, d.CORRELATIVO, d.ANIO, d.MES, d.DIA, d.FECHA,
        d.DOC_NIT, d.DOC_NOMCLIE, d.STATUS, d.TOTALPRECIO,
        d.ID_COLA_TRABAJO,
        LTRIM(RTRIM(ISNULL(d.CODEMBARQUE, ''))) AS CODEMBARQUE,
        t.TIPODOC, t.DESDOC,
        ISNULL((
          SELECT SUM(ISNULL(df.TOTALPRECIO, 0))
          FROM dbo.DOCUMENTOS df
          INNER JOIN dbo.TIPODOCUMENTOS tf
            ON tf.EMPNIT = df.EMPNIT AND tf.CODDOC = df.CODDOC
          WHERE df.EMPNIT = d.EMPNIT
            AND df.SERIEFAC = d.CODDOC
            AND TRY_CAST(LTRIM(RTRIM(df.NOFAC)) AS DECIMAL(18, 0)) = d.CORRELATIVO
            AND tf.TIPODOC IN (${tipodocSqlIn(TIPODOC_CERT_FAC)})
            AND ISNULL(df.STATUS, '') <> '${STATUS_ANULADO}'
        ), 0) AS TOTAL_EMITIDO,
        CASE
          WHEN c.ID IS NOT NULL AND ISNULL(c.FINALIZADO, 'NO') <> 'SI' THEN 1
          ELSE 0
        END AS COLA_ABIERTA,
        c.ID AS ID_COLA,
        c.FINALIZADO AS COLA_FINALIZADO
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      LEFT JOIN dbo.DOCUMENTOS_COLA_TRABAJO c
        ON c.EMPNIT = d.EMPNIT AND c.ID = d.ID_COLA_TRABAJO
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND UPPER(LTRIM(RTRIM(ISNULL(t.TIPODOC, '')))) = 'FAC'
        AND ${SQL_TIPODOC_REPORTES_SI}
        AND ISNULL(d.STATUS, '') <> '${STATUS_ANULADO}'
      ORDER BY d.FECHA, d.CODDOC, d.CORRELATIVO
    `);
  return normalizeDocumentoRows(result.recordset || []);
}

async function buildReportePendientesFacturar(pool, empnit, mesRaw, anioRaw) {
  const { mes, anio } = parseMesAnio(mesRaw, anioRaw);
  const baseRows = await listFacBase(pool, empnit, mes, anio);

  const facturas = [];
  const productMap = new Map();

  for (const row of baseRows) {
    let poolLines;
    try {
      poolLines = await buildRemainingProductPool(pool, empnit, row.CODDOC, row.CORRELATIVO);
    } catch {
      continue;
    }
    const pendienteFel = poolRestanteTotal(poolLines);
    if (!(pendienteFel > PENDING_EPS)) continue;

    const totalFac = roundMoney(row.TOTALPRECIO);
    const totalEmitido = roundMoney(row.TOTAL_EMITIDO);

    facturas.push({
      FECHA: fechaIsoFromRow(row) || row.FECHA,
      CODDOC: row.CODDOC,
      CORRELATIVO: row.CORRELATIVO,
      CLIENTE: String(row.DOC_NOMCLIE || row.DOC_NIT || '').trim(),
      DOC_NIT: row.DOC_NIT,
      STATUS: row.STATUS,
      TIPODOC: row.TIPODOC,
      DESDOC: row.DESDOC,
      TOTAL_FAC: totalFac,
      TOTAL_EMITIDO_FEL: totalEmitido,
      PENDIENTE_FEL: pendienteFel,
      ESTADO_FRACC: estadoFraccionamiento(row),
      ID_COLA: row.ID_COLA || null,
      CODEMBARQUE: row.CODEMBARQUE,
    });

    for (const ln of pendingLinesFromPool(poolLines)) {
      const key = String(ln.CODPROD || '').trim();
      if (!key) continue;
      const prev = productMap.get(key) || {
        CODPROD: key,
        DESPROD: ln.DESPROD,
        CANTIDAD: 0,
        TOTALPRECIO: 0,
      };
      prev.CANTIDAD = roundQty(prev.CANTIDAD + ln.CANTIDAD);
      prev.TOTALPRECIO = roundMoney(prev.TOTALPRECIO + ln.TOTALPRECIO);
      if (!prev.DESPROD && ln.DESPROD) prev.DESPROD = ln.DESPROD;
      productMap.set(key, prev);
    }
  }

  facturas.sort(
    (a, b) =>
      String(a.FECHA || '').localeCompare(String(b.FECHA || '')) ||
      String(a.CODDOC).localeCompare(String(b.CODDOC)) ||
      (Number(a.CORRELATIVO) || 0) - (Number(b.CORRELATIVO) || 0)
  );

  const productos = [...productMap.values()].sort(
    (a, b) =>
      (Number(b.TOTALPRECIO) || 0) - (Number(a.TOTALPRECIO) || 0) ||
      String(a.CODPROD).localeCompare(String(b.CODPROD))
  );

  const resumen = {
    mes,
    anio,
    docs: facturas.length,
    totalFac: roundMoney(facturas.reduce((s, r) => s + (Number(r.TOTAL_FAC) || 0), 0)),
    totalEmitidoFel: roundMoney(facturas.reduce((s, r) => s + (Number(r.TOTAL_EMITIDO_FEL) || 0), 0)),
    pendienteFel: roundMoney(facturas.reduce((s, r) => s + (Number(r.PENDIENTE_FEL) || 0), 0)),
  };

  return { resumen, facturas, productos };
}

async function getDetalleFacturaPendiente(pool, empnit, coddoc, correlativoRaw) {
  const correlativo = Number(correlativoRaw);
  if (!Number.isFinite(correlativo)) {
    const err = new Error('Correlativo inválido');
    err.statusCode = 400;
    throw err;
  }
  const poolLines = await buildRemainingProductPool(pool, empnit, coddoc, correlativo);
  const pendienteFel = poolRestanteTotal(poolLines);
  const lineas = detalleLineasFromPool(poolLines);
  const headerRes = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, coddoc)
    .input('CORRELATIVO', sql.Decimal(18, 0), correlativo)
    .query(`
      SELECT d.*, t.TIPODOC, t.DESDOC
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t ON t.EMPNIT = d.EMPNIT AND t.CODDOC = d.CODDOC
      WHERE d.EMPNIT = @EMPNIT AND d.CODDOC = @CODDOC AND d.CORRELATIVO = @CORRELATIVO
    `);
  const h = normalizeDocumentoRows(headerRes.recordset || [])[0] || null;
  return {
    header: h
      ? {
          CODDOC: h.CODDOC,
          CORRELATIVO: h.CORRELATIVO,
          FECHA: fechaIsoFromRow(h) || h.FECHA,
          CLIENTE: String(h.DOC_NOMCLIE || h.DOC_NIT || '').trim(),
          DOC_NIT: h.DOC_NIT,
          TOTAL_FAC: roundMoney(h.TOTALPRECIO),
          STATUS: h.STATUS,
          PENDIENTE_FEL: pendienteFel,
        }
      : { CODDOC: coddoc, CORRELATIVO: correlativo },
    lineas,
    pendienteFel,
  };
}

module.exports = {
  parseMesAnio,
  buildReportePendientesFacturar,
  getDetalleFacturaPendiente,
};
