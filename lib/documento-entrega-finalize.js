/**
 * Tipo de entrega al finalizar documento → DOCUMENTOS.F_ENTREGA / DIRENTREGA.
 */
const F_ENTREGA_TIENDA = 'RECOGE EN TIENDA';
const F_ENTREGA_DOMICILIO = 'A DOMICILIO';
const F_ENTREGA_OPTIONS = [F_ENTREGA_TIENDA, F_ENTREGA_DOMICILIO];

function normalizeFEntrega(raw) {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
  if (!s) return null;
  if (s === F_ENTREGA_TIENDA || s === 'TIENDA' || s === 'RECOGE') return F_ENTREGA_TIENDA;
  if (s === F_ENTREGA_DOMICILIO || s === 'DOMICILIO' || s === 'A DOMICILIO') return F_ENTREGA_DOMICILIO;
  return null;
}

/**
 * @param {object} body
 * @returns {{ fEntrega: string, dirEntrega: string } | { error: string }}
 */
function parseFinalizeEntregaBody(body) {
  const fEntrega = normalizeFEntrega(body?.F_ENTREGA ?? body?.f_entrega ?? body?.tipoEntrega);
  if (!fEntrega) {
    return { error: 'Seleccione el tipo de entrega' };
  }
  let dirEntrega = 'SN';
  if (fEntrega === F_ENTREGA_DOMICILIO) {
    dirEntrega = String(body?.DIRENTREGA ?? body?.dirEntrega ?? '').trim();
    if (!dirEntrega || dirEntrega.toUpperCase() === 'SN') {
      return { error: 'Ingrese la dirección de entrega' };
    }
  }
  return { fEntrega, dirEntrega };
}

module.exports = {
  F_ENTREGA_TIENDA,
  F_ENTREGA_DOMICILIO,
  F_ENTREGA_OPTIONS,
  normalizeFEntrega,
  parseFinalizeEntregaBody,
};
