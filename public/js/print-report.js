/**
 * Encabezado común para reportes imprimibles (logo + nombre de empresa).
 */
const PrintReport = {
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  getEmpresaNombre() {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    return user?.empNombre || F.getEmpNitNombre() || F.getEmpNit() || '—';
  },

  getLogoDataUrl() {
    if (typeof EmpresaLogo !== 'undefined') return EmpresaLogo.getDataUrl();
    return null;
  },

  logoBlockHtml(className = 'report-logo') {
    const src = this.getLogoDataUrl();
    if (!src) return '';
    return `<img src="${src}" alt="Logo empresa" class="${className}">`;
  },

  /** Encabezado con logo, nombre de empresa y título del reporte. */
  reportHeaderHtml({ title = '', subtitleHtml = '' } = {}) {
    const nombre = this.escapeHtml(this.getEmpresaNombre());
    const logo = this.logoBlockHtml();
    const titleBlock = title
      ? `<h1 class="report-title">${this.escapeHtml(title)}</h1>`
      : '';
    const subtitleBlock = subtitleHtml
      ? `<div class="report-subtitle">${subtitleHtml}</div>`
      : '';
    return `
      <header class="report-header">
        <div class="report-brand">
          ${logo ? `<div class="report-brand-logo">${logo}</div>` : ''}
          <div class="report-brand-text">
            <div class="report-empresa-nombre">${nombre}</div>
            ${titleBlock}
            ${subtitleBlock}
          </div>
        </div>
      </header>
    `;
  },

  baseStyles(extra = '') {
    return `
      body{font-family:Segoe UI,sans-serif;padding:1.25rem;font-size:12px;color:#111}
      .report-header{margin-bottom:1rem;border-bottom:1px solid #ccc;padding-bottom:.75rem}
      .report-brand{display:flex;align-items:center;gap:.75rem}
      .report-brand-logo{flex:0 0 auto}
      .report-logo{max-height:56px;max-width:130px;object-fit:contain;display:block}
      .report-empresa-nombre{font-size:1rem;font-weight:700;margin:0 0 .2rem;line-height:1.2}
      .report-title{font-size:1.05rem;margin:.15rem 0;font-weight:600;line-height:1.25}
      .report-subtitle{margin:.2rem 0 0;color:#444;font-size:11px;line-height:1.45}
      .report-subtitle p{margin:.1rem 0}
      .meta{color:#444;margin:.15rem 0}
      table{width:100%;border-collapse:collapse;margin-top:.75rem}
      th,td{border:1px solid #ccc;padding:4px 6px}
      th{background:#f5f5f5;text-align:left}
      .text-end{text-align:right}
      tr.totals td{background:#f5f5f5;border-top:2px solid #999}
      .warn{color:#666;margin-top:.5rem}
      @media print{body{padding:.5rem}}
      ${extra}
    `;
  },

  wrapDocument({ title, bodyHtml, extraStyles = '' }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this.escapeHtml(title || 'Reporte')}</title>
      <style>${this.baseStyles(extraStyles)}</style></head>
      <body>${bodyHtml}</body></html>`;
  },

  openAndPrint(html, windowFeatures = 'width=900,height=700') {
    const w = window.open('', '_blank', windowFeatures);
    if (!w) {
      F.toast('Permita ventanas emergentes para imprimir', 'warning');
      return false;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
    return true;
  },
};
