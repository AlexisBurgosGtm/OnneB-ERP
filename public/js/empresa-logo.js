/**
 * Logo de empresa — carga única al iniciar sesión; se limpia al cerrar.
 */
const EmpresaLogo = {
  _dataUrl: null,
  _empNit: null,

  hexToDataUrl(hex, mime = 'image/png') {
    const clean = String(hex || '')
      .trim()
      .replace(/^0x/i, '')
      .replace(/\s/g, '');
    if (!clean || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) return null;
    try {
      let binary = '';
      for (let i = 0; i < clean.length; i += 2) {
        binary += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
      }
      const b64 = btoa(binary);
      return `data:${mime};base64,${b64}`;
    } catch {
      return null;
    }
  },

  detectMime(hex) {
    const h = String(hex || '').trim().replace(/^0x/i, '').toUpperCase();
    if (h.startsWith('89504E47')) return 'image/png';
    if (h.startsWith('FFD8FF')) return 'image/jpeg';
    if (h.startsWith('47494638')) return 'image/gif';
    if (h.startsWith('52494646')) return 'image/webp';
    return 'image/png';
  },

  async loadForSession(empNit) {
    this.clearSession();
    const nit = String(empNit || '').trim();
    if (!nit) return null;
    try {
      const res = await fetch(
        `/api/empresas/${encodeURIComponent(nit)}/logo?_=${Date.now()}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const hex = data?.hex || data?.LOGO || data?.EMPLOGO || '';
      if (!hex) return null;
      const mime = data?.mime || this.detectMime(hex);
      this._dataUrl = this.hexToDataUrl(hex, mime);
      if (!this._dataUrl) return null;
      this._empNit = nit;
      return this._dataUrl;
    } catch (err) {
      console.warn('[EmpresaLogo] load:', err.message);
      return null;
    }
  },

  getDataUrl() {
    return this._dataUrl;
  },

  /** HTML img listo para insertar (vacío si no hay logo). */
  imgHtml(className = 'empresa-logo-img', alt = 'Logo empresa') {
    if (!this._dataUrl) return '';
    const cls = className ? ` class="${className}"` : '';
    return `<img src="${this._dataUrl}" alt="${alt}"${cls}>`;
  },

  clearSession() {
    this._dataUrl = null;
    this._empNit = null;
  },
};
