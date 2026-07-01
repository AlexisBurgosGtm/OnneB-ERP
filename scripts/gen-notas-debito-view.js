const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'public', 'js', 'views', 'notas-credito.js');
const dest = path.join(__dirname, '..', 'public', 'js', 'views', 'notas-debito.js');
let s = fs.readFileSync(src, 'utf8');

const reps = [
  ['const NotasCreditoView', 'const NotasDebitoView'],
  ['/api/notas-credito', '/api/notas-debito'],
  ['Notas de Crédito (clientes)', 'Notas de crédito (Proveedores)'],
  ['documentos DEV y FNC', 'documentos DVP'],
  ['Configure un tipo de documento de nota de crédito activo (<strong>DEV</strong> o <strong>FNC</strong>)', 'Configure un tipo de documento DVP activo'],
  ['Cargando Notas de crédito', 'Cargando notas de crédito proveedor'],
  ['DEV=FAC, FNC=fiscales', 'Compras tipo COM operadas'],
  ['facturas-referencia', 'compras-referencia'],
  ['buscarFacturasReferencia', 'buscarComprasReferencia'],
  ['confirmarFacturaReferencia', 'confirmarCompraReferencia'],
  ['Error al buscar facturas', 'Error al buscar compras'],
  ['Factura referencia', 'Compra referencia'],
  ['nota de crédito', 'nota de crédito proveedor'],
  ['Nota de crédito', 'Nota de crédito proveedor'],
  ['Cliente:', 'Proveedor:'],
  ['Sin cliente', 'Sin proveedor'],
  ['nc-list-', 'nd-list-'],
  ['nc-ref-', 'nd-ref-'],
  ['nc-dev-', 'nd-dev-'],
  ['nc-finalizar-', 'nd-finalizar-'],
  ['nc-cart-', 'nd-cart-'],
  ['nc-product-', 'nd-product-'],
  ['btn-nc-', 'btn-nd-'],
  ['#nc-', '#nd-'],
  ['.nc-', '.nd-'],
  ['nc-list-row', 'nd-list-row'],
  ['nc-ref-row', 'nd-ref-row'],
  ['nc-fpago', 'nd-fpago'],
  ['nc-finalizar-modal', 'nd-finalizar-modal'],
  ['data-action="nc-add-line"', 'data-action="nd-add-line"'],
  ['nc-add-line', 'nd-add-line'],
  ['nc-dev-qty-input', 'nd-dev-qty-input'],
];

for (const [a, b] of reps) {
  s = s.split(a).join(b);
}

// Remove FEL column from list table if present - strip certificar and fel helpers
s = s.replace(/\s*FEL_TIPOS_CERTIFICABLES: \['FNC'\],\s*FEL_URL_OPCION: 'URL FEL',\s*/g, '');
s = s.replace(/\s*felUudiValue\(row\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*needsCertificar\(row\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*formatFelCell\(row\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*joinFelUrl\(baseUrl, felValue\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*async fetchUrlFel\(\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*async abrirFelDocumento\(felValue\) \{[\s\S]*?\},\s*/g, '');
s = s.replace(/\s*async certificarPedido\(coddoc, correlativo\) \{[\s\S]*?\},\s*/g, '');

s = s.replace(
  /const certBtn = this\.needsCertificar\(row\)[\s\S]*?\$\{certBtn\}/,
  ''
);

s = s.replace(
  `      const felLink = e.target.closest('[data-action="fel-open"]');
      if (felLink) {
        e.preventDefault();
        e.stopPropagation();
        const fel = felLink.getAttribute('data-fel-uudi');
        await this.abrirFelDocumento(fel);
        return;
      }

      `,
  ''
);

s = s.replace(
  `        else if (action === 'certificar') await this.certificarPedido(coddoc, correlativo);
`,
  ''
);

s = s.replace(
  'const [config] = await Promise.all([this.fetchConfig(), this.fetchUrlFel().catch(() => \'\')]);',
  'const config = await this.fetchConfig();'
);

// refLabel proveedor
s = s.replace(
  `  refLabel() {
    const h = this._pedido?.header || {};
    const serie = String(h.SERIEFAC || '').trim();
    const nofac = String(h.NOFAC || '').trim();
    const cliente = h.DOC_NOMCLIE || h.CLI_NOMBRE || h.CLI_NEGOCIO || '—';
    return {
      doc: serie && nofac ? \`\${serie}-\${nofac}\` : '—',
      cliente,
    };
  },`,
  `  refLabel() {
    const h = this._pedido?.header || {};
    const serie = String(h.SERIEFAC || '').trim();
    const nofac = String(h.NOFAC || '').trim();
    const proveedor = h.DOC_NOMCLIE || h.PROV_EMPRESA || h.PROV_RAZON || '—';
    return {
      doc: serie && nofac ? \`\${serie}-\${nofac}\` : '—',
      cliente: proveedor,
    };
  },`
);

fs.writeFileSync(dest, s);
console.log('Wrote', dest);
