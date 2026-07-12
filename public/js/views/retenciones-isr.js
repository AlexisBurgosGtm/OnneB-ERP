/**
 * Vista Retenciones ISR — documentos RTI en DOCUMENTOS.
 */
const RetencionesIsrView = {
  _container: null,
  _rows: [],
  _doc: null,
  _mes: null,
  _anio: null,
  _loading: false,
  _saving: false,
  _setup: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatDate(value) {
    return LibroContableCommon.formatDate(value);
  },

  apiBase(path = '') {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp });
    return `/api/retenciones-isr${segment}?${params}`;
  },

  defaultPeriod() {
    return LibroContableCommon.defaultPeriod();
  },

  async fetchList() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/retenciones-isr?${params}`, { cache: 'no-store' });
    this._rows = data.rows || [];
    return data;
  },

  renderListRows() {
    if (!this._rows.length) {
      return `<tr><td colspan="6" class="text-center text-muted py-3">Sin retenciones en este período</td></tr>`;
    }
    return this._rows
      .map((r) => {
        const key = `${r.CODDOC}-${r.CORRELATIVO}`;
        const selected =
          this._doc &&
          String(this._doc.CODDOC) === String(r.CODDOC) &&
          Number(this._doc.CORRELATIVO) === Number(r.CORRELATIVO);
        return `
        <tr class="rti-list-row${selected ? ' rti-list-row-selected' : ''}" data-key="${this.escapeHtml(key)}" role="button">
          <td>${this.escapeHtml(this.formatDate(r.FECHA))}</td>
          <td class="fw-semibold">${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
          <td>${this.escapeHtml(r.SERIEFAC || '—')}-${this.escapeHtml(r.NOFAC || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td>${this.escapeHtml(r.CONCRE === 'CRE' ? 'Crédito' : 'Contado')}</td>
        </tr>`;
      })
      .join('');
  },

  renderEditor() {
    const d = this._doc;
    if (!d) {
      return `
        <div class="rti-detail-empty">
          <i class="fa-solid fa-hand-holding-dollar fa-2x mb-3 text-muted opacity-50"></i>
          <p class="mb-0 text-muted">Seleccione una retención o cree una nueva</p>
        </div>`;
    }
    return `
      <form id="rti-editor-form" class="rti-editor-form" autocomplete="off">
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Documento</label>
            <input type="text" class="form-control form-control-sm" readonly
              value="${this.escapeHtml(`${d.CODDOC} #${d.CORRELATIVO}`)}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-fecha">Fecha</label>
            <input type="date" class="form-control form-control-sm" id="rti-fecha"
              value="${this.escapeHtml(String(d.FECHA || '').slice(0, 10))}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-concre">Tipo pago</label>
            <select class="form-select form-select-sm" id="rti-concre">
              <option value="CON"${d.CONCRE === 'CON' ? ' selected' : ''}>Contado</option>
              <option value="CRE"${d.CONCRE === 'CRE' ? ' selected' : ''}>Crédito</option>
            </select>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-codprov">Cód. proveedor</label>
            <input type="number" class="form-control form-control-sm" id="rti-codprov"
              value="${this.escapeHtml(d.CODPROV ?? '')}">
          </div>
          <div class="col-md-8">
            <label class="form-label small mb-0">Proveedor</label>
            <input type="text" class="form-control form-control-sm" readonly
              value="${this.escapeHtml(d.DOC_NOMCLIE || '')}">
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-serie">Serie factura ref.</label>
            <input type="text" class="form-control form-control-sm" id="rti-serie"
              value="${this.escapeHtml(d.SERIEFAC || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-numero">Número factura ref.</label>
            <input type="text" class="form-control form-control-sm" id="rti-numero"
              value="${this.escapeHtml(d.NOFAC || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-fel">ID electrónico (FEL)</label>
            <input type="text" class="form-control form-control-sm" id="rti-fel"
              value="${this.escapeHtml(d.FEL_UUDI || '')}">
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-base">Base imponible</label>
            <input type="number" step="0.001" class="form-control form-control-sm" id="rti-base"
              value="${Number(d.TOTALSINIVA) || ''}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-isr">Monto retención ISR</label>
            <input type="number" step="0.001" class="form-control form-control-sm" id="rti-isr"
              value="${Number(d.TOTALIVA) || Number(d.TOTALPRECIO) || ''}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="rti-total">Total documento</label>
            <input type="number" step="0.001" class="form-control form-control-sm" id="rti-total"
              value="${Number(d.TOTALPRECIO) || ''}">
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-0" for="rti-obs">Observaciones</label>
          <textarea class="form-control form-control-sm" id="rti-obs" rows="2">${this.escapeHtml(d.OBS || '')}</textarea>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-sm btn-primary" id="btn-rti-guardar">
            <i class="fa-solid fa-floppy-disk me-1"></i>Guardar
          </button>
          <button type="button" class="btn btn-sm btn-success" id="btn-rti-finalizar">
            <i class="fa-solid fa-check me-1"></i>Finalizar
          </button>
        </div>
      </form>`;
  },

  renderShell() {
    const p = LibroContableCommon;
    return `
      <div class="retenciones-isr-wrap">
        <div class="card shadow-sm mb-3">
          <div class="card-body py-2">
            <div class="d-flex flex-wrap align-items-end gap-2">
              ${p.periodSelectsHtml('rti', this._mes, this._anio)}
              <button type="button" class="btn btn-sm btn-outline-primary" id="btn-rti-recargar">
                <i class="fa-solid fa-rotate me-1"></i>Actualizar
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-rti-setup" title="Crear/actualizar tipo RTI y formatos contables">
                <i class="fa-solid fa-gears me-1"></i>Configurar RTI
              </button>
            </div>
            <div class="small text-muted mt-2" id="rti-badge">
              ${this._rows.length} retención(es) · ${p.mesLabel(this._mes)} ${this._anio}
              · Formato contado: <code>RTICON</code> · crédito: <code>RTICRE</code>
            </div>
          </div>
        </div>
        <div class="rti-split-panels">
          <div class="card shadow-sm rti-list-panel">
            <div class="card-header py-2 d-flex justify-content-between align-items-center">
              <span class="small fw-semibold">Retenciones ISR</span>
              <button type="button" class="btn btn-sm btn-primary" id="btn-rti-nuevo">
                <i class="fa-solid fa-plus me-1"></i>Nueva
              </button>
            </div>
            <div class="card-body p-0">
              <div class="table-responsive">
                <table class="table table-sm table-hover mb-0">
                  <thead class="table-light sticky-top">
                    <tr>
                      <th>Fecha</th><th>No.</th><th>Proveedor</th><th>Factura ref.</th>
                      <th class="text-end">Total</th><th>Pago</th>
                    </tr>
                  </thead>
                  <tbody id="rti-list-tbody">${this.renderListRows()}</tbody>
                </table>
              </div>
            </div>
          </div>
          <div class="card shadow-sm rti-detail-panel">
            <div class="card-header py-2"><span class="small fw-semibold">Detalle retención</span></div>
            <div class="card-body p-3" id="rti-detail-body">${this.renderEditor()}</div>
          </div>
        </div>
      </div>`;
  },

  readEditorPayload() {
    const isr = Number(document.getElementById('rti-isr')?.value);
    const total = Number(document.getElementById('rti-total')?.value);
    const totalPrecio = Number.isFinite(total) && total > 0 ? total : isr;
    return {
      FECHA: document.getElementById('rti-fecha')?.value || null,
      CODPROV: document.getElementById('rti-codprov')?.value || null,
      CONCRE: document.getElementById('rti-concre')?.value || 'CON',
      SERIEFAC: document.getElementById('rti-serie')?.value?.trim() || '',
      NOFAC: document.getElementById('rti-numero')?.value?.trim() || '',
      FEL_UUDI: document.getElementById('rti-fel')?.value?.trim() || '',
      TOTALSINIVA: Number(document.getElementById('rti-base')?.value) || 0,
      TOTALIVA: Number.isFinite(isr) ? isr : 0,
      TOTALPRECIO: totalPrecio,
      OBS: document.getElementById('rti-obs')?.value?.trim() || '',
    };
  },

  refreshDom() {
    const tbody = this._container?.querySelector('#rti-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListRows();
    const body = this._container?.querySelector('#rti-detail-body');
    if (body) {
      body.innerHTML = this.renderEditor();
      this.bindEditorEvents();
    }
    const badge = this._container?.querySelector('#rti-badge');
    if (badge) {
      badge.innerHTML = `${this._rows.length} retención(es) · ${LibroContableCommon.mesLabel(this._mes)} ${this._anio} · Formato contado: <code>RTICON</code> · crédito: <code>RTICRE</code>`;
    }
  },

  selectDoc(doc) {
    this._doc = doc;
    this.refreshDom();
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    try {
      await this.fetchList();
      if (this._doc) {
        const found = this._rows.find(
          (r) =>
            String(r.CODDOC) === String(this._doc.CODDOC) &&
            Number(r.CORRELATIVO) === Number(this._doc.CORRELATIVO)
        );
        this._doc = found || null;
      }
      this.refreshDom();
    } finally {
      this._loading = false;
    }
  },

  async runSetup() {
    const data = await F.fetchJson(this.apiBase('/setup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    this._setup = data;
    const warns = (data.warnings || []).join(' ');
    F.toast(warns ? `RTI configurado. ${warns}` : 'Tipo RTI y formatos contables listos', 'success');
  },

  async onNuevo() {
    const user = F.session('user');
    const doc = await F.fetchJson(this.apiBase(''), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ USUARIO: user?.usuario || user?.nombre || 'SISTEMA' }),
    });
    await this.reload();
    this.selectDoc(doc);
    F.toast('Retención ISR creada', 'success');
  },

  async onGuardar() {
    if (!this._doc || this._saving) return;
    this._saving = true;
    try {
      const payload = this.readEditorPayload();
      const { CODDOC, CORRELATIVO } = this._doc;
      const doc = await F.fetchJson(
        this.apiBase(`/${encodeURIComponent(CODDOC)}/${CORRELATIVO}`),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      this._doc = doc;
      await this.reload();
      F.toast('Retención guardada', 'success');
    } finally {
      this._saving = false;
    }
  },

  async onFinalizar() {
    if (!this._doc || this._saving) return;
    await this.onGuardar();
    this._saving = true;
    try {
      const payload = this.readEditorPayload();
      const { CODDOC, CORRELATIVO } = this._doc;
      const res = await F.fetchJson(
        this.apiBase(`/${encodeURIComponent(CODDOC)}/${CORRELATIVO}/finalizar`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      this._doc = res.documento || this._doc;
      await this.reload();
      F.toast('Retención finalizada', 'success');
    } finally {
      this._saving = false;
    }
  },

  bindEditorEvents() {
    this._container?.querySelector('#btn-rti-guardar')?.addEventListener('click', () => {
      this.onGuardar().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-rti-finalizar')?.addEventListener('click', () => {
      this.onFinalizar().catch((err) => F.toast(err.message, 'error'));
    });
    const isrInput = this._container?.querySelector('#rti-isr');
    const totalInput = this._container?.querySelector('#rti-total');
    isrInput?.addEventListener('input', () => {
      if (totalInput && !totalInput.value) totalInput.value = isrInput.value;
    });
  },

  bindEvents() {
    this._container?.querySelector('#rti-mes')?.addEventListener('change', (e) => {
      this._mes = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#rti-anio')?.addEventListener('change', (e) => {
      this._anio = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-rti-recargar')?.addEventListener('click', () => {
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-rti-setup')?.addEventListener('click', () => {
      this.runSetup().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-rti-nuevo')?.addEventListener('click', () => {
      this.onNuevo().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#rti-list-tbody')?.addEventListener('click', (e) => {
      const row = e.target.closest('.rti-list-row');
      if (!row) return;
      const key = row.getAttribute('data-key');
      const doc = this._rows.find((r) => `${r.CODDOC}-${r.CORRELATIVO}` === key);
      if (doc) this.selectDoc(doc);
    });
  },

  async load(container) {
    this._container = container;
    const period = this.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'rti-main-host');
    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;
    try {
      const config = await F.fetchJson(this.apiBase('/config'), { cache: 'no-store' });
      this._setup = config.setup;
      await this.fetchList();
      container.innerHTML = this.renderShell();
      this.bindEvents();
      this.bindEditorEvents();
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
      F.toast(err.message, 'error');
    }
  },
};
