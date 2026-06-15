/** Columna PRECIOS → DOCPRODUCTOS.TIPOPRECIO */
const PRECIOS_FIELD_TO_TIPOPRECIO = {
  PRECIO: 'P',
  MAYORISTAA: 'A',
  MAYORISTAB: 'B',
  MAYORISTAC: 'C',
};

/** Tipo de precio usado al agregar líneas (hasta selector en UI). */
const DEFAULT_PRECIOS_FIELD = 'PRECIO';

function normalizeTipoprod(value) {
  const s = String(value ?? 'P').trim().toUpperCase();
  return s || 'P';
}

function tipoprecioFromPreciosField(field) {
  const key = String(field || DEFAULT_PRECIOS_FIELD).trim().toUpperCase();
  return PRECIOS_FIELD_TO_TIPOPRECIO[key] || 'P';
}

function getPrecioFromPreciosRow(row, field = DEFAULT_PRECIOS_FIELD) {
  const key = String(field || DEFAULT_PRECIOS_FIELD).trim().toUpperCase();
  const col = PRECIOS_FIELD_TO_TIPOPRECIO[key] ? key : DEFAULT_PRECIOS_FIELD;
  const raw = row?.[col] ?? row?.PRECIO;
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** TIPOPROD desde PRODUCTOS; TIPOPRECIO según columna de PRECIOS usada. */
function lineProductMeta(prodRow, preciosField = DEFAULT_PRECIOS_FIELD) {
  return {
    tipoprod: normalizeTipoprod(prodRow?.TIPOPROD),
    tipoprecio: tipoprecioFromPreciosField(preciosField),
  };
}

module.exports = {
  PRECIOS_FIELD_TO_TIPOPRECIO,
  DEFAULT_PRECIOS_FIELD,
  normalizeTipoprod,
  tipoprecioFromPreciosField,
  getPrecioFromPreciosRow,
  lineProductMeta,
};
