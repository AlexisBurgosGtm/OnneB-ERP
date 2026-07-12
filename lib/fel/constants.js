/** Tipos certificables FEL — solo régimen IVA general. */
const TIPODOC_CERTIFICABLES = new Set(['FEF', 'FEC', 'FNC']);

/** Documentos internos (no se envían a SAT). */
const TIPODOC_INTERNO = new Set(['FAC']);

/** Pequeño contribuyente u otros no certificables en este sistema. */
const TIPODOC_NO_FEL = new Set(['FES']);

/** Mapeo TIPODOC interno → Tipo DTE SAT (régimen IVA). */
const SAT_TIPO_BY_TIPODOC = {
  FEF: 'FACT',
  FEC: 'FCAM',
  FNC: 'NCRE',
};

/** Descripción del mapeo interno → SAT. */
const TIPODOC_FEL_DESCRIPCION = {
  FEF: 'Factura IVA normal (FACT)',
  FEC: 'Factura cambiaria IVA (FCAM)',
  FNC: 'Nota de crédito IVA (NCRE)',
  FES: 'Pequeño contribuyente (FESP) — no certificable en este sistema',
  FAC: 'Documento interno — no certificable',
};

const INFILE_URLS = {
  unified: 'https://certificador.feel.com.gt/fel/procesounificado/transaccion/v2/xml',
  sign: 'https://signer-emisores.feel.com.gt/sign_solicitud_firmas/firma_xml',
  certify: 'https://certificador.feel.com.gt/fel/certificacion/v2/dte/',
  cancel: 'https://certificador.feel.com.gt/fel/anulacion/v2/dte/',
};

const FEL_NS = 'http://www.sat.gob.gt/dte/fel/0.2.0';
const FEL_ANULACION_NS = 'http://www.sat.gob.gt/dte/fel/0.1.0';
const CFC_NS = 'http://www.sat.gob.gt/face2/ComplementoFacturaCambiaria/0.1.0';
const CNO_NS = 'http://www.sat.gob.gt/face2/ComplementoReferenciaNota/0.1.0';

module.exports = {
  TIPODOC_CERTIFICABLES,
  TIPODOC_INTERNO,
  TIPODOC_NO_FEL,
  SAT_TIPO_BY_TIPODOC,
  TIPODOC_FEL_DESCRIPCION,
  INFILE_URLS,
  FEL_NS,
  FEL_ANULACION_NS,
  CFC_NS,
  CNO_NS,
};
