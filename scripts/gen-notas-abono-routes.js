const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'routes', 'notas-credito.js');
const dest = path.join(__dirname, '..', 'routes', 'notas-abono.js');
let s = fs.readFileSync(src, 'utf8');

const reps = [
  ['notas-credito-disponible', 'notas-abono-disponible'],
  ['TIPODOC_NOTAS_CREDITO', 'TIPODOC_NOTAS_ABONO'],
  ['/notas-credito', '/notas-abono'],
  ['getTipoDocNotasCredito', 'getTipoDocNotasAbono'],
  ['nota de crédito (DEV, FNC)', 'nota de abono (FNA)'],
  ['nota de crédito', 'nota de abono'],
  ['Nota de crédito', 'Nota de abono'],
  ["usuario || 'NC'", "usuario || 'NA'"],
  ['Indique tipodoc_nota (DEV/FNC)', 'Indique tipodoc_nota (FNA)'],
];

for (const [a, b] of reps) {
  s = s.split(a).join(b);
}

s = s.replace(
  /async function resolveTipodocNota[\s\S]*?return String\(result\.recordset\[0\]\?\.TIPODOC[\s\S]*?\|\| null;\s*}/,
  `async function resolveTipodocNota(pool, empnit, { tipodocNota, coddocNota }) {
  const direct = String(tipodocNota || '').trim().toUpperCase();
  if (direct === 'FNA') return direct;
  const cod = String(coddocNota || '').trim();
  if (!cod) return null;
  const result = await pool
    .request()
    .input('EMPNIT', sql.VarChar, empnit)
    .input('CODDOC', sql.VarChar, cod)
    .query(\`
      SELECT TIPODOC FROM dbo.TIPODOCUMENTOS
      WHERE EMPNIT = @EMPNIT AND CODDOC = @CODDOC AND TIPODOC IN (\${TIPODOC_SQL_IN}) AND ACTIVO = 'SI'
    \`);
  return String(result.recordset[0]?.TIPODOC || '').trim().toUpperCase() || null;
}`
);

s = s.replace('tipodocs: TIPODOC_NOTAS,', 'tipodocs: TIPODOC_NOTAS_ABONO,');

fs.writeFileSync(dest, s);
console.log('Wrote', dest);
