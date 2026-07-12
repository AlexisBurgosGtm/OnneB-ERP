/**
 * Vista Configuraciones Contabilidad — porcentajes IVA / retenciones en SETTINGS.
 */
const ConfiguracionesContabilidadView = {
  _container: null,
  _impuestos: null,
  _catalogo: [],
  _saving: false,
  _recalculando: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(n);
  },

  renderImpuestoCard(item, values) {
    let value = '';
    let hint = '';
    if (item.id === 'iva') {
      value = this.formatPct(values?.iva?.porcentaje);
      hint = `Factor almacenado: ${this.escapeHtml(values?.iva?.factor ?? '1.12')} (CONFIGURACION IVA)`;
    } else if (item.id === 'rtv') {
      value = this.formatPct(values?.retencionIva?.porcentaje);
      hint = `SETTINGS: ${this.escapeHtml(item.opcion)}`;
    } else if (item.id === 'rti') {
      value = this.formatPct(values?.retencionIsr?.porcentaje);
      hint = `SETTINGS: ${this.escapeHtml(item.opcion)}`;
    }

    return `
      <div class="card config-card-compact config-contab-card h-100" data-impuesto-id="${this.escapeHtml(item.id)}">
        <div class="card-body py-2 px-2">
          <h6 class="card-title mb-0">
            <i class="fa-solid ${item.icon} me-1 text-primary"></i>${this.escapeHtml(item.label)}
          </h6>
          <p class="card-text config-contab-desc mb-1">${this.escapeHtml(item.description)}</p>
          <label class="form-label config-contab-label mb-0" for="cfg-contab-${item.id}">Porcentaje</label>
          <div class="input-group input-group-sm config-contab-pct-group">
            <input
              type="number"
              class="form-control"
              id="cfg-contab-${item.id}"
              data-impuesto-id="${this.escapeHtml(item.id)}"
              min="${item.min ?? 0}"
              max="${item.max ?? 100}"
              step="${item.step ?? '0.01'}"
              value="${this.escapeHtml(value)}"
            >
            <span class="input-group-text">%</span>
          </div>
          <p class="config-contab-hint mb-0 mt-1">${hint}</p>
        </div>
      </div>`;
  },

  renderShell() {
    const cards = (this._catalogo || [])
      .map((item) => this.renderImpuestoCard(item, this._impuestos))
      .join('');

    return `
      <div class="config-contab-wrap catalogo-vista-wrap w-100">
        <div class="config-contab-header mb-3">
          <h2 class="h5 mb-1">Configuraciones Contabilidad</h2>
          <p class="text-muted small mb-0">
            Porcentajes fiscales almacenados en <code>SETTINGS</code>. Al guardar o recalcular se actualizan
            los montos de IVA en líneas de documentos y los libros contables reflejan los nuevos valores.
          </p>
        </div>
        <div class="config-contab-cards-grid mb-3">${cards}</div>
        <div class="card shadow-sm config-contab-recalc-card">
          <div class="card-body py-2 px-3">
            <h6 class="mb-1"><i class="fa-solid fa-calculator me-1 text-primary"></i>Recálculo contable</h6>
            <p class="small text-muted mb-2">
              Vuelve a calcular <strong>TOTALSINIVA</strong> y <strong>TOTALIVA</strong> en todas las líneas de
              productos según el IVA configurado, actualiza totales de documentos y reaplica porcentajes en
              retenciones RTV/RTI. Los libros de ventas, compras, diario, mayor y balance usan estos montos.
            </p>
            <div class="d-flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary btn-sm" id="btn-cfg-contab-guardar">
                <i class="fa-solid fa-floppy-disk me-1"></i>Guardar configuración
              </button>
              <button type="button" class="btn btn-outline-warning btn-sm" id="btn-cfg-contab-recalcular">
                <i class="fa-solid fa-rotate me-1"></i>Guardar y recalcular libros
              </button>
            </div>
            <p class="small text-muted mb-0 mt-2" id="cfg-contab-last-result"></p>
          </div>
        </div>
      </div>`;
  },

  readFormValues() {
    return {
      ivaPorcentaje: Number(document.getElementById('cfg-contab-iva')?.value),
      retencionIvaPorcentaje: Number(document.getElementById('cfg-contab-rtv')?.value),
      retencionIsrPorcentaje: Number(document.getElementById('cfg-contab-rti')?.value),
    };
  },

  async fetchConfig() {
    const data = await F.fetchJson(`/api/config-contabilidad?_=${Date.now()}`, { cache: 'no-store' });
    this._impuestos = data.impuestos || null;
    this._catalogo = data.catalogo || [];
    return data;
  },

  async saveConfig() {
    if (this._saving) return null;
    this._saving = true;
    try {
      const payload = this.readFormValues();
      const data = await F.fetchJson('/api/config-contabilidad', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      this._impuestos = data.impuestos || this._impuestos;
      return data;
    } finally {
      this._saving = false;
    }
  },

  async recalcularLibros() {
    if (this._recalculando) return null;
    const empnit = F.getEmpNit();
    if (!empnit) throw new Error('No hay empresa activa');
    this._recalculando = true;
    try {
      const params = new URLSearchParams({ empnit });
      return await F.fetchJson(`/api/config-contabilidad/recalcular?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } finally {
      this._recalculando = false;
    }
  },

  updateResultText(text) {
    const el = this._container?.querySelector('#cfg-contab-last-result');
    if (el) el.textContent = text || '';
  },

  bindEvents() {
    this._container?.querySelector('#btn-cfg-contab-guardar')?.addEventListener('click', () => {
      this.onGuardar(false).catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-cfg-contab-recalcular')?.addEventListener('click', () => {
      this.onGuardar(true).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async onGuardar(withRecalc) {
    const ok = await CatalogosUI.fireConfirm({
      title: withRecalc ? '¿Guardar y recalcular?' : '¿Guardar configuración?',
      text: withRecalc
        ? 'Se guardarán los porcentajes y se recalcularán IVA/retenciones en todos los documentos de la empresa activa.'
        : 'Se guardarán los porcentajes de impuestos en SETTINGS.',
      icon: 'question',
      confirmText: withRecalc ? 'Guardar y recalcular' : 'Guardar',
    });
    if (!ok) return;

    await this.saveConfig();
    F.toast('Configuración de impuestos guardada', 'success');

    if (withRecalc) {
      const stats = await this.recalcularLibros();
      const msg = [
        `${stats.lineasActualizadas ?? 0} línea(s) actualizadas`,
        `${stats.documentosActualizados ?? 0} documento(s) con líneas`,
        `${stats.retencionesIvaActualizadas ?? 0} RTV`,
        `${stats.retencionesIsrActualizadas ?? 0} RTI`,
      ].join(' · ');
      this.updateResultText(`Recálculo completado: ${msg}`);
      F.toast('Libros contables recalculados', 'success');
    }
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

    try {
      await this.fetchConfig();
      container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
      F.toast(err.message, 'error');
    }
  },
};
