/**
 * Contado/crédito en ventas — política según Config general.
 */
const DocConcreConfig = {
  isSi(value) {
    return String(value || 'NO').trim().toUpperCase() === 'SI';
  },

  normalizeConcre(value) {
    return String(value || 'CON').trim().toUpperCase() === 'CRE' ? 'CRE' : 'CON';
  },

  isLocked(config) {
    if (typeof F !== 'undefined' && typeof F.isAdminOrSuperUser === 'function' && F.isAdminOrSuperUser()) {
      return false;
    }
    return this.isSi(config?.bloqueaContadoCreditoVentas);
  },

  defaultConcre(config) {
    const fromCfg = config?.cobroPredeterminado;
    if (fromCfg) return this.normalizeConcre(fromCfg);
    return 'CON';
  },

  empleadoQuerySuffix() {
    const cod = typeof F !== 'undefined' && typeof F.sessionCodEmpleado === 'function' ? F.sessionCodEmpleado() : null;
    return cod != null ? `&codempleado=${encodeURIComponent(String(cod))}` : '';
  },

  effectiveConcre(header, config) {
    if (this.isLocked(config)) return this.defaultConcre(config);
    return this.normalizeConcre(header?.CONCRE);
  },

  renderHeaderField({ selectId, header, config }) {
    const editable = header && String(header.STATUS || '').trim().toUpperCase() === 'O';
    const locked = editable && this.isLocked(config);
    const val = this.effectiveConcre(header, config);
    const disabled = !editable || locked;
    return `
      <div class="pos-doc-concre-wrap">
        <label class="form-label small mb-0" for="${selectId}">Contado / crédito</label>
        <select class="form-select form-select-sm" id="${selectId}"${disabled ? ' disabled' : ''}
          title="${locked ? 'Fijado por configuración de la empresa' : ''}">
          <option value="CON"${val !== 'CRE' ? ' selected' : ''}>CONTADO</option>
          <option value="CRE"${val === 'CRE' ? ' selected' : ''}>CREDITO</option>
        </select>
      </div>`;
  },

  lockFinalizarSelect(selectEl, config, preferredValue) {
    if (!selectEl || !this.isLocked(config)) return;
    const val = preferredValue != null ? this.normalizeConcre(preferredValue) : this.defaultConcre(config);
    selectEl.value = val;
    selectEl.disabled = true;
    selectEl.title = 'Fijado por configuración de la empresa';
  },
};

window.DocConcreConfig = DocConcreConfig;