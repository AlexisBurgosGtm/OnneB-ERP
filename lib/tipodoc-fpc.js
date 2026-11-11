/**
 * FPC — factura operativa (como FAC) certificable FEL pequeño contribuyente (SAT: FPEQ).
 * No contable ni inventario fiscal GT; sí en ventas, inventario operativo, corte y CXC.
 */
const TIPODOC_FPC = 'FPC';

/** Misma operatoria que FAC (no régimen FEL IVA general). */
const TIPODOC_COMO_FAC = Object.freeze(['FAC', TIPODOC_FPC]);

/** DTE SAT «Factura pequeño contribuyente» (no confundir con FESP = factura especial). */
const SAT_TIPO_FPC = 'FPEQ';

function isTipodocFpc(value) {
  return String(value ?? '').trim().toUpperCase() === TIPODOC_FPC;
}

function isTipodocComoFac(value) {
  return TIPODOC_COMO_FAC.includes(String(value ?? '').trim().toUpperCase());
}

/** Certificación Infile/SAT FPC → FPEQ (no FESP / no FEF). */
const TIPODOC_FEL_PEQUENO_CERTIFICABLE = Object.freeze([TIPODOC_FPC]);

function isTipodocFelPequenoCertificable(value) {
  return TIPODOC_FEL_PEQUENO_CERTIFICABLE.includes(String(value ?? '').trim().toUpperCase());
}

function sqlTipodocIn(tipodocs) {
  return (tipodocs || [])
    .map((t) => `'${String(t).trim().toUpperCase().replace(/'/g, "''")}'`)
    .join(', ');
}

const SQL_TIPODOC_COMO_FAC_IN = sqlTipodocIn(TIPODOC_COMO_FAC);

/** Régimen emisor FEL por empresa (dbo.Empresas.EMPREGIMENFEL). */
const REGIMEN_FEL_GEN = 'GEN';
const REGIMEN_FEL_PEQ = 'PEQ';

function normalizeRegimenFel(value) {
  const v = String(value ?? '').trim().toUpperCase();
  return v === REGIMEN_FEL_PEQ ? REGIMEN_FEL_PEQ : REGIMEN_FEL_GEN;
}

function empresaEsPequenoContribuyente(regimen) {
  return normalizeRegimenFel(regimen) === REGIMEN_FEL_PEQ;
}

module.exports = {
  TIPODOC_FPC,
  TIPODOC_COMO_FAC,
  SAT_TIPO_FPC,
  TIPODOC_FEL_PEQUENO_CERTIFICABLE,
  SQL_TIPODOC_COMO_FAC_IN,
  REGIMEN_FEL_GEN,
  REGIMEN_FEL_PEQ,
  isTipodocFpc,
  isTipodocComoFac,
  isTipodocFelPequenoCertificable,
  sqlTipodocIn,
  normalizeRegimenFel,
  empresaEsPequenoContribuyente,
};
