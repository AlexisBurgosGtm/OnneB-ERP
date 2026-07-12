const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'public', 'js', 'views', 'operaciones', 'notas-credito.js');
const dest = path.join(__dirname, '..', 'public', 'js', 'views', 'operaciones', 'notas-abono.js');
let s = fs.readFileSync(src, 'utf8');

const reps = [
  ['const NotasCreditoView', 'const NotasAbonoView'],
  ['/api/notas-credito', '/api/notas-abono'],
  ['Notas de Crédito (clientes)', 'Notas de Abono'],
  ['documentos DEV y FNC', 'documentos FNA'],
  ['Configure un tipo de documento de nota de crédito activo (<strong>DEV</strong> o <strong>FNC</strong>)', 'Configure un tipo de documento de nota de abono activo (<strong>FNA</strong>)'],
  ['Cargando Notas de crédito', 'Cargando Notas de abono'],
  ['Seleccione una serie (DEV/FNC)', 'Seleccione una serie FNA'],
  ['nota de crédito', 'nota de abono'],
  ['Nota de crédito', 'Nota de abono'],
  ['nc-list-', 'na-list-'],
  ['nc-ref-', 'na-ref-'],
  ['nc-dev-', 'na-dev-'],
  ['nc-finalizar-', 'na-finalizar-'],
  ['nc-cart-', 'na-cart-'],
  ['nc-product-', 'na-product-'],
  ['btn-nc-', 'btn-na-'],
  ['#nc-', '#na-'],
  ['.nc-', '.na-'],
  ['nc-list-row', 'na-list-row'],
  ['nc-ref-row', 'na-ref-row'],
  ['nc-fpago', 'na-fpago'],
  ['nc-finalizar-modal', 'na-finalizar-modal'],
  ['data-action="nc-add-line"', 'data-action="na-add-line"'],
  ['nc-add-line', 'na-add-line'],
  ['nc-dev-qty-input', 'na-dev-qty-input'],
  ["return u?.username || 'NC';", "return u?.username || 'NA';"],
  ["FEL_TIPOS_CERTIFICABLES: ['FNC']", "FEL_TIPOS_CERTIFICABLES: ['FNA']"],
];

for (const [a, b] of reps) {
  s = s.split(a).join(b);
}

s = s.replace(
  `  refFacturaHint() {
    const t = this.activeNotaTipodoc();
    if (t === 'DEV') return 'Solo facturas tipo FAC';
    if (t === 'FNC') return 'Documentos fiscales FEF, FEC o FES (no FAC)';
    return '';
  },`,
  `  refFacturaHint() {
    const t = this.activeNotaTipodoc();
    if (t === 'FNA') return 'Documentos fiscales FEF, FEC o FES (no FAC)';
    return '';
  },`
);

fs.writeFileSync(dest, s);
console.log('Wrote', dest);
