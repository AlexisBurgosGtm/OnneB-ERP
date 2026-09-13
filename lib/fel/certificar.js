const sql = require('mssql');
const { loadFelCredenciales } = require('./credenciales');
const { loadDocumentoFel } = require('./documento');
const { buildFelXml } = require('./build-xml');
const { certifyWithInfile } = require('./infile-client');
const { buildIdentificador } = require('./utils');
const { loadAdendaContext } = require('./adendas');
const { fechaIsoFromFelFecha, fechaIsoFromRow, dateOnlyString } = require('../documento-fecha');
const {
  fetchFechaHoraEmisionByUuid,
  isFechaOrigenMismatchError,
} = require('./fetch-dte-fecha');

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

const { getIvaFactor } = require('../impuestos');

function shiftIsoDate(iso, deltaDays) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + deltaDays));
  if (Number.isNaN(dt.getTime())) return '';
  return dateOnlyString(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function uniqueDates(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const v = String(raw || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Candidatas a FechaEmisionDocumentoOrigen para NCRE.
 * Orden: XML Infile/SAT → FEL_FECHA → FECHA doc → ±1 día de FEL_FECHA.
 */
async function resolveFechaOrigenCandidates(referencia) {
  if (!referencia) return [];
  const fromInfile = await fetchFechaHoraEmisionByUuid(referencia.FEL_UUDI);
  if (fromInfile) {
    console.info('[FEL NCRE] FechaHoraEmision desde Infile XML:', fromInfile);
  }
  const fromFel = fechaIsoFromFelFecha(referencia.FEL_FECHA);
  const fromFecha = fechaIsoFromRow(referencia);
  return uniqueDates([
    fromInfile,
    fromFel,
    fromFecha,
    shiftIsoDate(fromFel, -1),
    shiftIsoDate(fromFel, 1),
    shiftIsoDate(fromFecha, -1),
    shiftIsoDate(fromFecha, 1),
  ]);
}

async function certificarDocumentoFel(pool, empnit, coddoc, correlativo, opts = {}) {
  const credenciales = await loadFelCredenciales(pool, empnit);
  const documento = await loadDocumentoFel(pool, empnit, coddoc, correlativo);
  const identificador = buildIdentificador(empnit, coddoc, correlativo);
  const ivaFactor = await getIvaFactor(pool);
  const adendaContext = await loadAdendaContext(pool, empnit, documento.header);

  const fechaCandidates =
    documento.referencia && String(documento.header?.TIPODOC || '').trim().toUpperCase() === 'FNC'
      ? await resolveFechaOrigenCandidates(documento.referencia)
      : [];

  const attempts =
    fechaCandidates.length > 0
      ? fechaCandidates
      : [documento.referencia?.FEL_FECHA_EMISION_SAT || null];

  let lastErr = null;
  let satTipo = null;
  let usedXml = '';

  for (let i = 0; i < attempts.length; i += 1) {
    const fechaOrigen = attempts[i];
    if (documento.referencia && fechaOrigen) {
      documento.referencia.FEL_FECHA_EMISION_SAT = fechaOrigen;
    }

    const built = buildFelXml({
      empnit,
      cred: credenciales,
      header: documento.header,
      lines: documento.lines,
      referencia: documento.referencia,
      ivaFactor,
      adendaContext,
    });
    satTipo = built.satTipo;
    usedXml = built.xml;

    try {
      const felResult = await certifyWithInfile(usedXml, credenciales, identificador);
      const fechaOverride = String(opts.fechaCertificacion || '').trim();
      const emissionFromXml = (String(usedXml).match(/\bFechaHoraEmision="([^"]+)"/i) || [])[1] || '';
      if (fechaOverride) {
        felResult.fechaCertificacion = fechaOverride;
      } else if (emissionFromXml) {
        felResult.fechaCertificacion = emissionFromXml;
      }
      await persistFelResult(pool, empnit, coddoc, correlativo, felResult);

      if (fechaOrigen && i > 0) {
        console.info('[FEL NCRE] Certificada con FechaEmisionDocumentoOrigen=', fechaOrigen);
      }

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
        fechaOrigenUsada: fechaOrigen || null,
      };
    } catch (err) {
      lastErr = err;
      const canRetry =
        documento.referencia &&
        isFechaOrigenMismatchError(err) &&
        i < attempts.length - 1 &&
        fechaOrigen;
      console.warn(
        '[FEL certificar]',
        err.message,
        fechaOrigen ? `(FechaEmisionDocumentoOrigen=${fechaOrigen})` : ''
      );
      if (!canRetry) break;
      console.warn('[FEL NCRE] Reintentando con otra fecha de origen…');
    }
  }

  if (lastErr) {
    if (isFechaOrigenMismatchError(lastErr) && attempts.filter(Boolean).length) {
      const tried = attempts.filter(Boolean).join(', ');
      const enriched = new Error(
        `${lastErr.message} (fechas origen probadas: ${tried})`
      );
      enriched.statusCode = lastErr.statusCode || 502;
      throw enriched;
    }
    throw lastErr;
  }

  const err = new Error('No se pudo certificar el documento');
  err.statusCode = 500;
  throw err;
}

module.exports = { certificarDocumentoFel, persistFelResult };
