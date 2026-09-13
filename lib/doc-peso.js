/** Peso en líneas de documento (PRECIOS.PESO × cantidad → DOCPRODUCTOS.TOTALPESO). */

function lineTotalPeso(line) {
  const stored = Number(line?.TOTALPESO);
  if (Number.isFinite(stored)) return stored;
  const peso = Number(line?.PESO) || 0;
  const cant = Number(line?.CANTIDAD) || 0;
  return peso * cant;
}

function sumLinesPeso(lines) {
  return (lines || []).reduce((sum, ln) => sum + lineTotalPeso(ln), 0);
}

function formatPesoQty(value, locale = 'es-GT') {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

module.exports = {
  lineTotalPeso,
  sumLinesPeso,
  formatPesoQty,
};
