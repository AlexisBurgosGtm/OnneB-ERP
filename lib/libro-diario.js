const { getIvaFactor, desgloseIvaIncluyente } = require('./impuestos');

const TIPODOC_NOTAS_CREDITO = ['FNC', 'DVP'];
const TIPODOC_RETENCIONES = ['RTV', 'RTI', 'RVR', 'RIR'];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function strVal(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function isAnulado(row) {
  return String(row?.STATUS ?? '').trim().toUpperCase() === 'A';
}

function isNotaCredito(row) {
  return TIPODOC_NOTAS_CREDITO.includes(String(row?.TIPODOC ?? '').trim().toUpperCase());
}

function isRetencion(row) {
  return TIPODOC_RETENCIONES.includes(String(row?.TIPODOC ?? '').trim().toUpperCase());
}

function signForDoc(row) {
  if (isAnulado(row)) return 0;
  return isNotaCredito(row) ? -1 : 1;
}

function isCreditoDoc(row) {
  return String(row?.CONCRE ?? '').trim().toUpperCase() === 'CRE';
}

function resolveCodFormato(row) {
  const con = strVal(row.CODFORMATOCON);
  const cre = strVal(row.CODFORMATOCRE);
  const gen = strVal(row.CODFORMATO);
  if (isCreditoDoc(row)) return cre || gen;
  return con || gen;
}

function resolveTotal(doc) {
  const costo = toNumber(doc.TOTALCOSTO);
  const precio = toNumber(doc.TOTALPRECIO);
  return costo !== 0 ? costo : precio;
}

/**
 * Aplica desglose SAT (total/1.12) sobre el documento para tokens SUBTOTAL e IVA.
 * Retenciones conservan los montos originales.
 */
function applySatIvaDesglose(doc, ivaFactor) {
  if (isRetencion(doc)) return doc;
  const { exento, gravable, iva } = desgloseIvaIncluyente(
    resolveTotal(doc),
    toNumber(doc.TOTALEXENTO),
    ivaFactor
  );
  return {
    ...doc,
    TOTALEXENTO: exento,
    TOTALSINIVA: gravable,
    TOTALIVA: iva,
  };
}

function resolveToken(token, doc) {
  const t = String(token ?? '').trim().toUpperCase();
  if (!t) return 0;
  switch (t) {
    case 'TOTAL':
      return resolveTotal(doc);
    case 'SUBTOTAL':
      return toNumber(doc.TOTALSINIVA);
    case 'IVA':
      return toNumber(doc.TOTALIVA);
    case 'COSTO':
      return toNumber(doc.TOTALCOSTO);
    default:
      return 0;
  }
}

function resolveSerie(row) {
  return strVal(row.FEL_SERIE) || strVal(row.SERIEFAC) || strVal(row.CODDOC);
}

function resolveNumero(row) {
  return (
    strVal(row.FEL_NUMERO) ||
    strVal(row.NOFAC) ||
    (row.CORRELATIVO != null ? String(row.CORRELATIVO) : null)
  );
}

function resolveFechaSort(row) {
  const fel = strVal(row.FEL_FECHA);
  if (fel) return fel;
  if (row.FECHA) return String(row.FECHA);
  return '';
}

function buildPartidasMap(partidasRows) {
  const map = new Map();
  partidasRows.forEach((p) => {
    const key = String(p.CODFORMATO ?? '').trim().toUpperCase();
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return map;
}

function expandDocToLines(doc, partidasMap, lineStart) {
  const sign = signForDoc(doc);
  const codformato = resolveCodFormato(doc);
  const docRef = `${resolveSerie(doc) || doc.CODDOC || ''}-${resolveNumero(doc) || doc.CORRELATIVO || ''}`;
  const base = {
    DOC_ID: doc.ID,
    CODDOC: doc.CODDOC ?? null,
    CORRELATIVO: doc.CORRELATIVO ?? null,
    DOC_REF: docRef,
    FECHA: doc.FEL_FECHA ?? doc.FECHA ?? null,
    FECHA_SORT: resolveFechaSort(doc),
    TIPODOC: String(doc.TIPODOC ?? '').trim().toUpperCase(),
    DESDOC: doc.DESDOC ?? null,
    DOC_NIT: doc.DOC_NIT ?? null,
    DOC_NOMCLIE: doc.DOC_NOMCLIE ?? null,
    CONCRE: String(doc.CONCRE ?? 'CON').trim().toUpperCase(),
    TIPOPAGO: doc.TIPOPAGO ?? (isCreditoDoc(doc) ? 'CREDITO' : 'CONTADO'),
    CODFORMATO: codformato,
    DESFORMATO: doc.DESFORMATO ?? null,
    STATUS: String(doc.STATUS ?? '').trim().toUpperCase(),
    ANULADO: isAnulado(doc),
    ES_NOTA_CREDITO: isNotaCredito(doc),
  };

  if (!codformato) {
    return {
      lines: [],
      warning: {
        DOC_ID: doc.ID,
        DOC_REF: docRef,
        CODDOC: doc.CODDOC,
        CORRELATIVO: doc.CORRELATIVO,
        reason: 'sin_formato',
        message: `Documento ${docRef} sin formato contable asignado (${isCreditoDoc(doc) ? 'crédito' : 'contado'})`,
      },
      nextLine: lineStart,
    };
  }

  const partidas = partidasMap.get(String(codformato).trim().toUpperCase()) || [];
  if (!partidas.length) {
    return {
      lines: [],
      warning: {
        DOC_ID: doc.ID,
        DOC_REF: docRef,
        CODDOC: doc.CODDOC,
        CORRELATIVO: doc.CORRELATIVO,
        CODFORMATO: codformato,
        reason: 'sin_partidas',
        message: `Formato "${codformato}" sin partidas para documento ${docRef}`,
      },
      nextLine: lineStart,
    };
  }

  const lines = [];
  let lineNo = lineStart;
  partidas.forEach((p) => {
    const debe = roundMoney(resolveToken(p.DEBE, doc) * sign);
    const haber = roundMoney(resolveToken(p.HABER, doc) * sign);
    if (debe === 0 && haber === 0 && sign !== 0) return;

    lineNo += 1;
    lines.push({
      ...base,
      LINEA: lineNo,
      CODCUENTA: p.CODCUENTA ?? null,
      DESCRIPCION_CUENTA: p.DESCRIPCION_CUENTA ?? null,
      TOKEN_DEBE: strVal(p.DEBE),
      TOKEN_HABER: strVal(p.HABER),
      DEBE: debe,
      HABER: haber,
      CENTRO_COSTO: p.CENTRO_COSTO ?? '1',
    });
  });

  return { lines, warning: null, nextLine: lineNo };
}

function summarizeLines(lines) {
  const totals = {
    debe: 0,
    haber: 0,
    lineas: lines.length,
    documentos: 0,
    anulados: 0,
    sinFormato: 0,
    sinPartidas: 0,
  };

  const docIds = new Set();
  lines.forEach((l) => {
    docIds.add(l.DOC_ID);
    if (!l.ANULADO) {
      totals.debe = roundMoney(totals.debe + toNumber(l.DEBE));
      totals.haber = roundMoney(totals.haber + toNumber(l.HABER));
    }
  });
  totals.documentos = docIds.size;
  return totals;
}

async function fetchPartidasForFormatos(pool, sql, empnit, codformatos) {
  const codes = [...new Set(codformatos.filter(Boolean).map((c) => String(c).trim()))];
  if (!codes.length) return [];

  const request = pool.request().input('EMPNIT', sql.VarChar, empnit);
  const placeholders = codes.map((cod, i) => {
    const key = `F${i}`;
    request.input(key, sql.VarChar, cod);
    return `@${key}`;
  });

  const result = await request.query(`
    SELECT
      p.CODFORMATO,
      p.CODCUENTA,
      p.DEBE,
      p.HABER,
      p.CENTRO_COSTO,
      c.DESCRIPCION AS DESCRIPCION_CUENTA
    FROM dbo.CONTA_FORMATOS_PARTIDAS p
    LEFT JOIN dbo.CONTA_CUENTAS c
      ON c.EMPNIT = p.EMPNIT AND c.CODCUENTA = p.CODCUENTA
    WHERE p.EMPNIT = @EMPNIT
      AND p.CODFORMATO IN (${placeholders.join(', ')})
    ORDER BY
      p.CODFORMATO,
      CASE WHEN LTRIM(RTRIM(ISNULL(p.DEBE, ''))) <> '' THEN 0 ELSE 1 END,
      p.ID
  `);

  return result.recordset || [];
}

async function listLibroDiario(pool, sql, empnit, mes, anio) {
  const ivaFactor = await getIvaFactor(pool);
  const docResult = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('MES', sql.Int, mes)
    .input('ANIO', sql.Int, anio)
    .query(`
      SELECT
        d.ID,
        d.CODDOC,
        d.CORRELATIVO,
        d.FEL_SERIE,
        d.FEL_NUMERO,
        d.FEL_FECHA,
        d.SERIEFAC,
        d.NOFAC,
        d.FECHA,
        d.DOC_NIT,
        d.DOC_NOMCLIE,
        d.CONCRE,
        d.TIPOPAGO,
        ISNULL(d.TOTALEXENTO, 0) AS TOTALEXENTO,
        ISNULL(d.TOTALSINIVA, 0) AS TOTALSINIVA,
        ISNULL(d.TOTALIVA, 0) AS TOTALIVA,
        ISNULL(d.TOTALCOSTO, 0) AS TOTALCOSTO,
        ISNULL(d.TOTALPRECIO, 0) AS TOTALPRECIO,
        d.STATUS,
        t.TIPODOC,
        t.DESDOC,
        t.CODFORMATOCON,
        t.CODFORMATOCRE,
        t.CODFORMATO,
        f.DESFORMATO
      FROM dbo.DOCUMENTOS d
      INNER JOIN dbo.TIPODOCUMENTOS t
        ON d.EMPNIT = t.EMPNIT AND d.CODDOC = t.CODDOC
      LEFT JOIN dbo.CONTA_FORMATOS f
        ON f.EMPNIT = t.EMPNIT
        AND f.CODFORMATO = CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL(d.CONCRE, 'CON')))) = 'CRE'
            THEN NULLIF(LTRIM(RTRIM(ISNULL(t.CODFORMATOCRE, ''))), '')
          ELSE NULLIF(LTRIM(RTRIM(ISNULL(t.CODFORMATOCON, ''))), '')
        END
      WHERE d.EMPNIT = @EMPNIT
        AND d.MES = @MES
        AND d.ANIO = @ANIO
        AND ISNULL(t.CONTABLE, 'NO') = 'SI'
      ORDER BY
        CASE
          WHEN d.FEL_FECHA IS NOT NULL AND LTRIM(RTRIM(d.FEL_FECHA)) <> '' THEN d.FEL_FECHA
          ELSE CONVERT(VARCHAR(30), d.FECHA, 126)
        END,
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_SERIE)), ''), ISNULL(d.SERIEFAC, d.CODDOC)),
        ISNULL(NULLIF(LTRIM(RTRIM(d.FEL_NUMERO)), ''), ISNULL(d.NOFAC, CAST(d.CORRELATIVO AS VARCHAR(30)))),
        d.ID
    `);

  const docs = (docResult.recordset || []).map((doc) => applySatIvaDesglose(doc, ivaFactor));
  const formatosNeeded = docs.map((d) => resolveCodFormato(d)).filter(Boolean);
  const partidasRows = await fetchPartidasForFormatos(pool, sql, empnit, formatosNeeded);
  const partidasMap = buildPartidasMap(partidasRows);

  const lines = [];
  const warnings = [];
  let lineNo = 0;

  docs.forEach((doc) => {
    const expanded = expandDocToLines(doc, partidasMap, lineNo);
    lines.push(...expanded.lines);
    if (expanded.warning) warnings.push(expanded.warning);
    lineNo = expanded.nextLine;
  });

  const totals = summarizeLines(lines);
  totals.documentos = docs.length;
  totals.anulados = docs.filter((d) => isAnulado(d)).length;
  totals.sinFormato = warnings.filter((w) => w.reason === 'sin_formato').length;
  totals.sinPartidas = warnings.filter((w) => w.reason === 'sin_partidas').length;

  return {
    rows: lines,
    warnings,
    totals,
    mes,
    anio,
    ivaFactor: roundMoney(ivaFactor),
  };
}

module.exports = {
  TIPODOC_NOTAS_CREDITO,
  listLibroDiario,
  resolveCodFormato,
  resolveToken,
  signForDoc,
  applySatIvaDesglose,
};
