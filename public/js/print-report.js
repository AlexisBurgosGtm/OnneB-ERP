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
    if (typeof EmpresaLogo !== 'undefined') {
      const url = EmpresaLogo.getDataUrl();
      if (url) return url;
    }
    if (typeof F !== 'undefined') {
      const nit = F.getEmpNit();
      if (nit) {
        try {
          const stored = sessionStorage.getItem(`onneb-emp-logo:${nit}`);
          if (stored) return stored;
        } catch {
          /* sessionStorage no disponible */
        }
      }
    }
    return null;
  },

  async ensureLogo() {
    if (typeof F === 'undefined' || typeof EmpresaLogo === 'undefined') return this.getLogoDataUrl();
    const nit = F.getEmpNit();
    if (!nit) return null;
    if (!this.getLogoDataUrl()) {
      try {
        await EmpresaLogo.loadForSession(nit);
      } catch {
        /* sin logo */
      }
    }
    return this.getLogoDataUrl();
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
      html,body{zoom:1!important;transform:none!important;-webkit-text-size-adjust:100%}
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
      .doc-anulado-stamp{
        text-align:center;color:#dc2626;font-size:3.25rem;font-weight:900;
        letter-spacing:.14em;text-transform:uppercase;line-height:1.1;
        margin:0 0 .85rem;padding:.45rem .6rem;border:3px solid #dc2626;
        background:rgba(254,226,226,.55)
      }
      @media print{
        html,body{zoom:1!important;transform:none!important}
        body{padding:.5rem}
        .doc-anulado-stamp{font-size:2.75rem;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      }
      ${extra}
    `;
  },

  wrapDocument({ title, bodyHtml, extraStyles = '' }) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<title>${this.escapeHtml(title || 'Reporte')}</title>
      <style>${this.baseStyles(extraStyles)}</style></head>
      <body>${bodyHtml}</body></html>`;
  },

  maximizedFeatures() {
    const w = Math.max(800, Number(window.screen?.availWidth) || 1200);
    const h = Math.max(600, Number(window.screen?.availHeight) || 800);
    return `left=0,top=0,width=${w},height=${h}`;
  },

  _maximizeWindow(win) {
    if (!win) return;
    try {
      const aw = Number(window.screen?.availWidth) || 0;
      const ah = Number(window.screen?.availHeight) || 0;
      if (aw > 0 && ah > 0) {
        win.moveTo(0, 0);
        win.resizeTo(aw, ah);
      }
    } catch {
      /* algunos navegadores bloquean resize */
    }
  },

  _forceZoom100(win) {
    if (!win?.document) return;
    try {
      const doc = win.document;
      if (doc.documentElement) doc.documentElement.style.zoom = '1';
      if (doc.body) {
        doc.body.style.zoom = '1';
        doc.body.style.transform = 'none';
      }
    } catch {
      /* ignore */
    }
  },

  _openPrintWindow(html, windowFeatures) {
    const features = windowFeatures || this.maximizedFeatures();
    const w = window.open('', '_blank', features);
    if (!w) {
      F.toast('Permita ventanas emergentes para imprimir', 'warning');
      return false;
    }
    this._maximizeWindow(w);
    w.document.write(html);
    w.document.close();
    this._forceZoom100(w);
    this._maximizeWindow(w);
    w.focus();
    let printed = false;
    const doPrint = () => {
      if (printed) return;
      printed = true;
      this._forceZoom100(w);
      this._maximizeWindow(w);
      try {
        w.print();
      } catch {
        /* ignore */
      }
    };
    if (w.document.readyState === 'complete') {
      window.setTimeout(doPrint, 60);
    } else {
      w.addEventListener('load', () => window.setTimeout(doPrint, 60), { once: true });
      window.setTimeout(doPrint, 400);
    }
    return true;
  },

  /**
   * Abre ventana de impresión. Asegura logo de empresa antes de generar el HTML.
   * @param {string|function(): string} htmlOrBuilder — HTML listo o función que lo construye tras cargar el logo.
   */
  async openAndPrint(htmlOrBuilder, windowFeatures) {
    await this.ensureLogo();
    const html = typeof htmlOrBuilder === 'function' ? htmlOrBuilder() : htmlOrBuilder;
    return this._openPrintWindow(html, windowFeatures || this.maximizedFeatures());
  },
};