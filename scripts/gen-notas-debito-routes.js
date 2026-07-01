const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'routes', 'notas-credito.js');
const dest = path.join(__dirname, '..', 'routes', 'notas-debito.js');
let s = fs.readFileSync(src, 'utf8');

const reps = [
  ['notas-credito-disponible', 'notas-debito-disponible'],
  ['TIPODOC_NOTAS_CREDITO', 'TIPODOC_NOTAS_DEBITO'],
  ['/notas-credito', '/notas-debito'],
  ['cuentas-docs', 'cuentas-pagar-docs'],
  ['SQL_TIPODOC_CUENTAS_COBRAR_IN', 'SQL_TIPODOC_CUENTAS_PAGAR_IN'],
  ['fetchFacturasReferencia', 'fetchComprasReferencia'],
  ['loadFacturaReferencia', 'loadCompraReferencia'],
  ['tiposFacturaReferenciaParaNota', 'tiposCompraReferenciaParaNota'],
  ['assertFacturaReferenciaPermitida', 'assertCompraReferenciaPermitida'],
  ['loadFacturaCreditoParaAbono', 'loadCompraCreditoParaPago'],
  ['aplicarNotaCreditoAFacturaCredito', 'aplicarNotaDebitoACompraCredito'],
  ['revertirNotaCreditoEnFacturaCredito', 'revertirNotaDebitoEnCompraCredito'],
  ['/facturas-referencia', '/compras-referencia'],
  ['getTipoDocNotasCredito', 'getTipoDocNotasDebito'],
  ['facturaRef', 'compraRef'],
  ['facCoddoc', 'comCoddoc'],
  ['facCorrelativo', 'comCorrelativo'],
  ['Factura de referencia', 'Compra de referencia'],
  ['factura de referencia', 'compra de referencia'],
  ['la factura', 'la compra'],
  ['nota de crédito (DEV, FNC)', 'nota de crédito proveedor (DVP)'],
  ['nota de crédito', 'nota de crédito proveedor'],
  ["usuario || 'NC'", "usuario || 'NDP'"],
  [
    'LEFT JOIN dbo.CLIENTES c ON c.EMPNIT = d.EMPNIT AND c.CODCLIENTE = d.CODCLIENTE',
    'LEFT JOIN dbo.PROVEEDORES p ON p.EMPNIT = d.EMPNIT AND p.CODPROV = d.CODCLIENTE',
  ],
  [
    `c.NEGOCIO AS CLI_NEGOCIO, c.TIPONEGOCIO AS CLI_TIPONEGOCIO,
        c.NOMBRECLIENTE AS CLI_NOMBRE, c.DIRCLIENTE AS CLI_DIR`,
    `p.EMPRESA AS PROV_EMPRESA, p.RAZONSOCIAL AS PROV_RAZON, p.DIRECCION AS PROV_DIR,
        d.CODCLIENTE AS CODPROV`,
  ],
];

for (const [a, b] of reps) {
  s = s.split(a).join(b);
}

s = s.replace(
  /async function resolveTipodocNota[\s\S]*?return String\(result\.recordset\[0\]\?\.TIPODOC[\s\S]*?\|\| null;\s*}/,
  `async function resolveTipodocNota(pool, empnit, { tipodocNota, coddocNota }) {
  const direct = String(tipodocNota || '').trim().toUpperCase();
  if (direct === 'DVP') return direct;
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

s = s.replace(
  'assertCompraReferenciaPermitida(tipo.TIPODOC, compraRef.TIPODOC);',
  'assertCompraReferenciaPermitida(compraRef.TIPODOC);'
);
s = s.replace(
  'const tiposRef = tiposCompraReferenciaParaNota(tipo.TIPODOC);',
  'const tiposRef = tiposCompraReferenciaParaNota();'
);
s = s.replace('tipodocs: TIPODOC_NOTAS,', 'tipodocs: TIPODOC_NOTAS_DEBITO,');

fs.writeFileSync(dest, s);
console.log('Wrote', dest);
