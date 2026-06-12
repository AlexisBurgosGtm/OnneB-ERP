/**
 * Logo de empresa — carga única al iniciar sesión; memoria + sessionStorage por EMPNIT.
 */
const EmpresaLogo = {
  _dataUrl: null,
  _empNit: null,
  _loadPromise: null,
  _pendingNit: null,
  _STORAGE_PREFIX: 'onneb-emp-logo:',

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

  _readFromStorage(empNit) {
    try {
      return sessionStorage.getItem(`${this._STORAGE_PREFIX}${empNit}`);
    } catch {
      return null;
    }
  },

  _writeToStorage(empNit, dataUrl) {
    try {
      if (dataUrl) sessionStorage.setItem(`${this._STORAGE_PREFIX}${empNit}`, dataUrl);
      else sessionStorage.removeItem(`${this._STORAGE_PREFIX}${empNit}`);
    } catch {
      /* sessionStorage no disponible */
    }
  },

  _clearStored(empNit) {
    if (!empNit) return;
    this._writeToStorage(empNit, null);
  },

  async loadForSession(empNit) {
    const nit = String(empNit || '').trim();
    if (!nit) {
      this.clearSession();
      return null;
    }

    if (this._empNit === nit && this._dataUrl) {
      return this._dataUrl;
    }

    const stored = this._readFromStorage(nit);
    if (stored) {
      this._empNit = nit;
      this._dataUrl = stored;
      this.refreshAllPosHeaders();
      return this._dataUrl;
    }

    if (this._loadPromise && this._pendingNit === nit) {
      return this._loadPromise;
    }

    this._pendingNit = nit;
    this._loadPromise = this._fetchFromApi(nit).finally(() => {
      this._loadPromise = null;
      this._pendingNit = null;
    });
    return this._loadPromise;
  },

  async _fetchFromApi(empNit) {
    if (this._empNit && this._empNit !== empNit) {
      this._clearStored(this._empNit);
    }
    this._dataUrl = null;
    this._empNit = empNit;

    try {
      const res = await fetch(`/api/empresas/${encodeURIComponent(empNit)}/logo`, {
        cache: 'default',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const hex = data?.hex || data?.LOGO || data?.EMPLOGO || '';
      if (!hex) return null;
      const mime = data?.mime || this.detectMime(hex);
      this._dataUrl = this.hexToDataUrl(hex, mime);
      if (!this._dataUrl) return null;
      this._writeToStorage(empNit, this._dataUrl);
      this.refreshAllPosHeaders();
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

  /** Logo POS / inventario: empresa o icono OnneB por defecto. */
  posHeaderLogoHtml(className = 'pos-header-logo') {
    const src = this.getDataUrl();
    if (src) {
      return `<img src="${src}" width="40" height="40" alt="Logo empresa" class="${className}">`;
    }
    return `<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="${className}">`;
  },

  refreshAllPosHeaders() {
    document.querySelectorAll('.pos-header-brand').forEach((el) => {
      el.innerHTML = this.posHeaderLogoHtml();
    });
    if (typeof updateHeaderEmpresaLogo === 'function') {
      updateHeaderEmpresaLogo();
    }
  },

  clearSession() {
    if (this._empNit) this._clearStored(this._empNit);
    this._dataUrl = null;
    this._empNit = null;
    this._loadPromise = null;
    this._pendingNit = null;
    this.refreshAllPosHeaders();
  },
};
