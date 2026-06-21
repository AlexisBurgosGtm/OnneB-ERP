const {
  TIPODOC_CERTIFICABLES,
  TIPODOC_INTERNO,
  TIPODOC_NO_FEL,
  SAT_TIPO_BY_TIPODOC,
} = require('./constants');

function normalizeTipodoc(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isCertificableTipodoc(tipodoc) {
  const t = normalizeTipodoc(tipodoc);
  return TIPODOC_CERTIFICABLES.has(t);
}

function isInternoTipodoc(tipodoc) {
  return TIPODOC_INTERNO.has(normalizeTipodoc(tipodoc));
}

function isNoFelTipodoc(tipodoc) {
  return TIPODOC_NO_FEL.has(normalizeTipodoc(tipodoc));
}

function satTipoFromTipodoc(tipodoc) {
  const t = normalizeTipodoc(tipodoc);
  return SAT_TIPO_BY_TIPODOC[t] || null;
}

function assertCertificableTipodoc(tipodoc) {
  const t = normalizeTipodoc(tipodoc);
  if (isInternoTipodoc(t)) {
    const err = new Error(`El tipo ${t} es documento interno y no se certifica ante SAT`);
    err.statusCode = 400;
    throw err;
  }
  if (isNoFelTipodoc(t)) {
    const err = new Error(
      `El tipo ${t} (pequeño contribuyente) no se certifica — solo régimen IVA: FEF (FACT), FEC (FCAM), FNC (NCRE)`
    );
    err.statusCode = 400;
    throw err;
  }
  if (!isCertificableTipodoc(t)) {
    const err = new Error(`El tipo de documento ${t || '(vacío)'} no es certificable FEL (régimen IVA)`);
    err.statusCode = 400;
    throw err;
  }
  return t;
}

module.exports = {
  normalizeTipodoc,
  isCertificableTipodoc,
  isInternoTipodoc,
  isNoFelTipodoc,
  satTipoFromTipodoc,
  assertCertificableTipodoc,
};
