/**
 * Config de precio en documentos (pedidos, cotizaciones, facturas).
 * Solo aplica a usuarios que no son administrador ni superusuario.
 */
const DocPrecioConfig = {
  isSi(value) {
    return String(value || 'NO').trim().toUpperCase() === 'SI';
  },

  /** Sin clave ni auth al cambiar precio («Solicita clave al cambiar precios» = No). */
  omiteClaveAlCambiarPrecio(config) {
    return !this.isSi(config?.solicitaClaveCambiarPrecios);
  },

  /** Permite editar precio en UI (override cuando omite clave). */
  puedeCambiarPrecio(config) {
    if (!config) return false;
    if (this.omiteClaveAlCambiarPrecio(config)) return true;
    return this.isSi(config.permiteCambiarPrecio);
  },

  /** Clave admin o autorización en línea al bajar precio. */
  requiereAutorizacionPrecio(config) {
    if (typeof F !== 'undefined' && F.isAdminOrSuperUser()) return false;
    if (this.omiteClaveAlCambiarPrecio(config)) return false;
    return true;
  },
};

window.DocPrecioConfig = DocPrecioConfig;
