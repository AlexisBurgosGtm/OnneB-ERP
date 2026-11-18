/**
 * One-off transform compras.js copy → ordenes-compra.js (run manually if needed).
 */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../public/js/views/operaciones/ordenes-compra.js');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  /\/\*\*[\s\S]*?\*\/\s*const ComprasView = \{/,
  `/**
 * Vista Órdenes de compra — documentos OCM (DOCUMENTOS + DOCPRODUCTOS).
 * Copia de Compras sin SAT/serie proveedor ni cargar costos.
 */
const OrdenesCompraView = {`
);

s = s.replaceAll('/api/compras', '/api/ordenes-compra');
s = s.replaceAll("'compras'", "'ocm'");
s = s.replaceAll('"compras"', '"ocm"');
s = s.replaceAll('compras-', 'ocm-');
s = s.replaceAll('Compras]', 'Órdenes de compra]');
s = s.replaceAll("return 'COMPRAS'", "return 'OCM'");
s = s.replace(
  'Configure un tipo de documento <strong>COM</strong> o <strong>COP</strong> (compras) activo para esta empresa.',
  'Configure un tipo de documento <strong>OCM</strong> (órdenes de compra) activo para esta empresa.'
);
s = s.replace('Cargando Compras', 'Cargando órdenes de compra');
s = s.replaceAll('Finalizar compra', 'Finalizar orden');
s = s.replaceAll('Nueva compra', 'Nueva orden');
s = s.replaceAll('Compras del día', 'Órdenes de compra del día');
s = s.replaceAll('compra activa', 'orden activa');
s = s.replaceAll('La compra no', 'La orden no');
s = s.replaceAll('Compra finalizada', 'Orden finalizada');
s = s.replaceAll('crear compra', 'crear orden');
s = s.replaceAll('fetchComprasList', 'fetchOrdenesList');
s = s.replaceAll('_comprasList', '_ordenesList');
s = s.replaceAll('filteredComprasList', 'filteredOrdenesList');
s = s.replaceAll('crearCompra', 'crearOrden');
s = s.replaceAll('finalizarCompra', 'finalizarOrden');
s = s.replaceAll('onNuevaCompra', 'onNuevaOrden');
s = s.replaceAll('/compras?', '/ordenes-compra?');
s = s.replaceAll('/compras/', '/ordenes-compra/');

fs.writeFileSync(file, s, 'utf8');
console.log('Patched', file);