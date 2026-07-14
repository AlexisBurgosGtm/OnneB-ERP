/**
 * Configuración general de nómina por empresa.
 */
const NominaConfigView = {
  _container: null,
  _config: null,

  escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  apiUrl() {
    return `/api/nomina/config?empnit=${encodeURIComponent(F.getEmpNit())}`;
  },

  field(id, label, value, { type = 'text', step } = {}) {
    const stepAttr = step ? ` step="${step}"` : '';
    return `<div class="col-md-6 col-lg-4">
      <label class="form-label small mb-1" for="${id}">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" id="${id}" value="${this.escapeHtml(value ?? '')}"${stepAttr}>
    </div>`;
  },

  renderHtml() {
    const c = this._config || {};
    return `<div class="catalogo-empresa-view nomina-config-view w-100">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h5 class="mb-0">Configuración de nómina</h5>
          <p class="small text-muted mb-0">Parámetros del patrono, IGSS e impuestos para la empresa activa.</p>
        </div>
        <button type="button" class="btn btn-sm btn-catalogo-guardar" id="nomina-config-guardar">
          <i class="fa-solid fa-floppy-disk me-1"></i>Guardar
        </button>
      </div>
      <div class="card"><div class="card-body">
        <div class="row g-3">
          ${this.field('nomina-nit', 'NIT patrono', c.NIT_PATRONO)}
          ${this.field('nomina-razon', 'Razón social', c.RAZON_SOCIAL)}
          ${this.field('nomina-igss-patrono', 'No. patrono IGSS', c.IGSS_NUMERO_PATRONO)}
          ${this.field('nomina-centro', 'Centro trabajo default', c.IGSS_CENTRO_TRABAJO || '1')}
          ${this.field('nomina-email', 'Correo IGSS', c.IGSS_EMAIL)}
          ${this.field('nomina-pct-lab', '% IGSS laboral', c.PORC_IGSS_LABORAL ?? 4.83, { type: 'number', step: '0.01' })}
          ${this.field('nomina-pct-pat', '% IGSS patronal', c.PORC_IGSS_PATRONAL ?? 10.67, { type: 'number', step: '0.01' })}
          ${this.field('nomina-pct-isr', '% ISR estimado', c.PORC_ISR ?? 0, { type: 'number', step: '0.01' })}
          ${this.field('nomina-dias', 'Días del mes', c.DIAS_MES ?? 30, { type: 'number', step: '0.01' })}
          ${this.field('nomina-minimo', 'Salario mínimo ref.', c.SALARIO_MINIMO, { type: 'number', step: '0.01' })}
          <div class="col-12">
            <label class="form-label small mb-1" for="nomina-obs">Observaciones</label>
            <textarea class="form-control form-control-sm" id="nomina-obs" rows="2">${this.escapeHtml(c.OBS || '')}</textarea>
          </div>
        </div>
      </div></div>
    </div>`;
  },

  collectForm() {
    const get = (id) => document.getElementById(id)?.value ?? '';
    return {
      NIT_PATRONO: get('nomina-nit').trim(),
      RAZON_SOCIAL: get('nomina-razon').trim(),
      IGSS_NUMERO_PATRONO: get('nomina-igss-patrono').trim(),
      IGSS_CENTRO_TRABAJO: get('nomina-centro').trim() || '1',
      IGSS_EMAIL: get('nomina-email').trim(),
      PORC_IGSS_LABORAL: Number(get('nomina-pct-lab')) || 0,
      PORC_IGSS_PATRONAL: Number(get('nomina-pct-pat')) || 0,
      PORC_ISR: Number(get('nomina-pct-isr')) || 0,
      DIAS_MES: Number(get('nomina-dias')) || 30,
      SALARIO_MINIMO: get('nomina-minimo') === '' ? null : Number(get('nomina-minimo')),
      OBS: get('nomina-obs').trim(),
    };
  },

  bindEvents() {
    this._container?.querySelector('#nomina-config-guardar')?.addEventListener('click', async () => {
      try {
        const data = await F.fetchJson(this.apiUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.collectForm()),
        });
        this._config = data.config || data;
        F.toast('Configuración guardada', 'success');
      } catch (err) {
        F.alert('Error', err.message || 'No se pudo guardar', 'error');
      }
    });
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3';
    container.innerHTML = '<p class="text-muted">Cargando configuración…</p>';
    try {
      const data = await F.fetchJson(`${this.apiUrl()}&_=${Date.now()}`, { cache: 'no-store' });
      this._config = data.config || {};
      container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<p class="text-danger">${this.escapeHtml(err.message || 'Error al cargar')}</p>`;
    }
  },
};
