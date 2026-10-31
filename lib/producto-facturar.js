/** Tipos de documento fiscal electrónico (FEL) en Guatemala — OnneB. */
const TIPODOC_FEL = Object.freeze(['FEF', 'FEC', 'FES']);

function isTipodocFel(value) {
  const s = String(value ?? '').trim().toUpperCase();
  return TIPODOC_FEL.includes(s);
}

function normalizeFacturar(value) {
  return String(value ?? 'SI').trim().toUpperCase() === 'NO' ? 'NO' : 'SI';
}

function productoPermiteFacturacionFiscal(facturar) {
  return normalizeFacturar(facturar) !== 'NO';
}

/** SQL extra: solo productos con FACTURAR distinto de NO (alias p). */
function sqlProductoSoloFacturablesWhere(alias = 'p') {
  const col = alias ? `${alias}.FACTURAR` : 'FACTURAR';
  return ` AND UPPER(RTRIM(ISNULL(${col}, 'SI'))) <> 'NO' `;
}

/**
 * ¿Filtrar búsqueda de productos por FACTURAR=SI?
 * FEL / FEL-extra siempre; mixto solo si coddoc activo es FEF/FEC/FES.
 */
function facturacionRequiereProductosFacturables(grupo, coddoc) {
  const g = String(grupo?.id ?? grupo ?? '').trim().toLowerCase();
  if (g === 'fel' || g === 'fel-extra') return true;
  if (g === 'mixto') return isTipodocFel(coddoc);
  return false;
}

module.exports = {
  TIPODOC_FEL,
  isTipodocFel,
  normalizeFacturar,
  productoPermiteFacturacionFiscal,
  sqlProductoSoloFacturablesWhere,
  facturacionRequiereProductosFacturables,
};
