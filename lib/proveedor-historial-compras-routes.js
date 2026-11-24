const {
  handleCatalogoProductos,
  handleLineasProducto,
  handleDocumentos,
} = require('./proveedor-historial-compras-handlers');

/**
 * Rutas bajo /proveedores/:codprov/historial-compras/…
 * @param {import('express').Router} router
 * @param {{ defaultTipodocs: string[] }} opts
 */
function attachProveedorHistorialComprasRoutes(router, opts) {
  const defaultTipodocs = opts?.defaultTipodocs || ['COM', 'COP'];
  router.get('/proveedores/:codprov/historial-compras/catalogo-productos', (req, res) =>
    handleCatalogoProductos(req, res, defaultTipodocs)
  );
  router.get('/proveedores/:codprov/historial-compras/lineas', (req, res) =>
    handleLineasProducto(req, res, defaultTipodocs)
  );
  router.get('/proveedores/:codprov/historial-compras/documentos', (req, res) =>
    handleDocumentos(req, res, defaultTipodocs)
  );
}

module.exports = { attachProveedorHistorialComprasRoutes };