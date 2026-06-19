/**
 * Columnas dbo.PRECIOS → DOCPRODUCTOS.TIPOPRECIO.
 * PRECIO / MAYOREOA|B|C según selector en facturación y POS.
 */
const PRECIOS_FIELD_TO_TIPOPRECIO = {
  PRECIO: 'P',
  MAYOREOA: 'A',
  MAYOREOB: 'B',
  MAYOREOC: 'C',
};

/** Columna activa por defecto (PRECIO público). */
const DEFAULT_PRECIOS_FIELD = 'PRECIO';

function normalizeTipoprod(value) {
  const s = String(value ?? 'P').trim().toUpperCase();
  return s || 'P';
}

function tipoprecioFromPreciosField(field) {
  const key = String(field || DEFAULT_PRECIOS_FIELD).trim().toUpperCase();
  return PRECIOS_FIELD_TO_TIPOPRECIO[key] || 'P';
}

function normalizePreciosField(field) {
  const key = String(field || DEFAULT_PRECIOS_FIELD).trim().toUpperCase();
  return PRECIOS_FIELD_TO_TIPOPRECIO[key] ? key : DEFAULT_PRECIOS_FIELD;
}

function getPrecioFromPreciosRow(row, field = DEFAULT_PRECIOS_FIELD) {
  const key = normalizePreciosField(field);
  const raw = row?.[key] ?? row?.PRECIO;
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
  normalizePreciosField,
  tipoprecioFromPreciosField,
  getPrecioFromPreciosRow,
  lineProductMeta,
};
