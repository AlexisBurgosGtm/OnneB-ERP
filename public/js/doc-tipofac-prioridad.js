/**
 * Selectores TIPOFAC / PRIORIDAD para modales de finalizar documento.
 */
const DocTipofacPrioridad = {
  TIPOFAC_OPTS: [
    { value: 'FEF', label: 'FACTURA FEL NORMAL' },
    { value: 'FAC', label: 'ENVIO' },
    { value: 'FEC', label: 'FACTURA FEL CAMBIARIA' },
  ],
  PRIORIDAD_OPTS: [
    { value: 'BAJA', label: 'BAJA' },
    { value: 'MEDIA', label: 'MEDIA' },
    { value: 'ALTA', label: 'ALTA' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  tipofacLabel(value) {
    const v = String(value || '').trim().toUpperCase();
    const opt = this.TIPOFAC_OPTS.find((o) => o.value === v);
    return opt ? opt.label : v || '—';
  },

  tipofacSelectHtml({ id = 'doc-finalizar-tipofac', selected = 'FEF' } = {}) {
    const sel = String(selected || 'FEF').trim().toUpperCase() || 'FEF';
    const opts = this.TIPOFAC_OPTS.map(
      (o) =>
        `<option value="${this.escapeHtml(o.value)}"${sel === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    return `
      <div class="mb-2">
        <label class="form-label small mb-0" for="${this.escapeHtml(id)}">Tipo Documento:</label>
        <select id="${this.escapeHtml(id)}" class="form-select form-select-sm">${opts}</select>
      </div>`;
  },

  prioridadSelectHtml({ id = 'doc-finalizar-prioridad', selected = 'BAJA' } = {}) {
    const sel = String(selected || 'BAJA').trim().toUpperCase() || 'BAJA';
    const opts = this.PRIORIDAD_OPTS.map(
      (o) =>
        `<option value="${this.escapeHtml(o.value)}"${sel === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    return `
      <div class="mb-2">
        <label class="form-label small mb-0" for="${this.escapeHtml(id)}">Prioridad</label>
        <select id="${this.escapeHtml(id)}" class="form-select form-select-sm">${opts}</select>
      </div>`;
  },

  /** Campos compactos para el encabezado del editor (pedido / cotización). */
  editorFieldsHtml({ tipofacId, prioridadId, tipofac, prioridad, disabled = false } = {}) {
    const tipofacSel = String(tipofac || 'FEF').trim().toUpperCase() || 'FEF';
    const prioridadSel = String(prioridad || 'BAJA').trim().toUpperCase() || 'BAJA';
    const dis = disabled ? ' disabled' : '';
    const tipofacOpts = this.TIPOFAC_OPTS.map(
      (o) =>
        `<option value="${this.escapeHtml(o.value)}"${tipofacSel === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    const prioridadOpts = this.PRIORIDAD_OPTS.map(
      (o) =>
        `<option value="${this.escapeHtml(o.value)}"${prioridadSel === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    return `
      <div class="pos-doc-tipofac-wrap">
        <label class="form-label small mb-0" for="${this.escapeHtml(tipofacId)}">Tipo Documento</label>
        <select class="form-select form-select-sm" id="${this.escapeHtml(tipofacId)}"${dis}>${tipofacOpts}</select>
      </div>
      <div class="pos-doc-prioridad-wrap">
        <label class="form-label small mb-0" for="${this.escapeHtml(prioridadId)}">Prioridad</label>
        <select class="form-select form-select-sm" id="${this.escapeHtml(prioridadId)}"${dis}>${prioridadOpts}</select>
      </div>`;
  },

  readTipofacFromDom(id = 'doc-finalizar-tipofac') {
    return String(document.getElementById(id)?.value || 'FEF').trim().toUpperCase() || 'FEF';
  },

  readPrioridadFromDom(id = 'doc-finalizar-prioridad') {
    return String(document.getElementById(id)?.value || 'BAJA').trim().toUpperCase() || 'BAJA';
  },

  OPCION_DEFAULT_TIPOFAC: 'DEFAULT TIPO DOCUMENTO FINALIZADO',
  _defaultTipofacCache: null,

  normalizeTipofac(value) {
    const v = String(value || 'FEF').trim().toUpperCase();
    return this.TIPOFAC_OPTS.some((o) => o.value === v) ? v : 'FEF';
  },

  async fetchDefaultTipofac(force = false) {
    if (!force && this._defaultTipofacCache) return this._defaultTipofacCache;
    try {
      const params = new URLSearchParams({
        opcion: this.OPCION_DEFAULT_TIPOFAC,
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/config/tipofac-finalizado?${params}`, { cache: 'no-store' });
      this._defaultTipofacCache = this.normalizeTipofac(data.tipofac);
    } catch {
      this._defaultTipofacCache = 'FEF';
    }
    return this._defaultTipofacCache;
  },
};
