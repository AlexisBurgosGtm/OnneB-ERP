const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'lib', 'notas-credito-disponible.js');
const dest = path.join(__dirname, '..', 'lib', 'notas-abono-disponible.js');
let s = fs.readFileSync(src, 'utf8');

s = s.replace(
  "const { TIPODOC_FACTURA, TIPODOC_DEVOLUCION } = require('./corte-caja-docs');",
  "const { TIPODOC_FACTURA } = require('./corte-caja-docs');"
);
s = s.replace(
  'const TIPODOC_NOTAS_CREDITO = [...TIPODOC_DEVOLUCION];',
  'const TIPODOC_NOTAS_ABONO = [\'FNA\'];'
);
s = s.replace(/TIPODOC_NOTAS_CREDITO/g, 'TIPODOC_NOTAS_ABONO');
s = s.replace(
  /\/\*\* DEV → solo FAC; FNC → fiscales excepto FAC \(FEF, FEC, FES\)\. \*\/[\s\S]*?return \[\.\.\.TIPODOC_FACTURA\];\s*}/,
  `/** FNA → documentos fiscales (FEF, FEC, FES). */
function tiposFacturaReferenciaParaNota(tipodocNota) {
  const t = String(tipodocNota || '').trim().toUpperCase();
  if (t === 'FNA') return [...TIPODOC_FACTURA_FEL];
  return [...TIPODOC_FACTURA_FEL];
}`
);
s = s.replace(
  /tipodocNota === 'DEV'[\s\S]*?no FAC'/,
  "tipodocNota === 'FNA'\n        ? 'Las notas FNA solo pueden referenciar documentos fiscales (FEF, FEC, FES), no FAC'"
);

fs.writeFileSync(dest, s);
console.log('Wrote', dest);
