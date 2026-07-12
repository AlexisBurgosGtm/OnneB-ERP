/**
 * Factory vista Retenciones (IVA / ISR) — listado + editor como compras/cotizaciones.
 */
function createRetencionesDocView(cfg) {
  const P = cfg.prefix;
  const id = (name) => `${P}-${name}`;

  return {
    _container: null,
    _screen: 'list',
    _rows: [],
    _doc: null,
    _mes: null,
    _anio: null,
    _listFilter: '',
    _loading: false,
    _saving: false,
    _setup: null,
    _proveedores: [],

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
      if (Number.isNaN(n)) return 'Q 0.00';
      return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
    },

    roundMoney(n) {
      return Math.round(Number(n) * 1000) / 1000;
    },

    formatDate(value) {
      return LibroContableCommon.formatDate(value);
    },

    apiBase(path = '') {
      const emp = F.getEmpNit();
      if (!emp) throw new Error('No hay empresa activa');
      const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
      const params = new URLSearchParams({ empnit: emp });
      return `${cfg.apiPath}${segment}?${params}`;
    },

    defaultPeriod() {
      return LibroContableCommon.defaultPeriod();
    },

    docEditable(doc) {
      return DocFecha.editableStatus(doc?.STATUS);
    },

    async fetchList() {
      const params = new URLSearchParams({
        empnit: F.getEmpNit(),
        mes: String(this._mes),
        anio: String(this._anio),
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`${cfg.apiPath}?${params}`, { cache: 'no-store' });
      this._rows = data.rows || [];
      return data;
    },

    async fetchProveedores() {
      const data = await F.fetchJson(this.apiBase('/proveedores') + '&limit=500', {
        cache: 'no-store',
      });
      this._proveedores = data.rows || [];
      return this._proveedores;
    },

    filteredRows() {
      const q = this._listFilter.trim().toLowerCase();
      if (!q) return this._rows;
      return this._rows.filter((r) => {
        const hay = [
          r.CODDOC,
          r.CORRELATIVO,
          r.DOC_NOMCLIE,
          r.DOC_NIT,
          r.SERIEFAC,
          r.NOFAC,
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    },

    proveedorLabel(codprov) {
      const p = this._proveedores.find((x) => String(x.CODPROV) === String(codprov));
      if (!p) return '';
      const nom = String(p.EMPRESA || p.RAZONSOCIAL || '').trim();
      const nit = String(p.NIT || '').trim();
      return nit ? `${nom} (${nit})` : nom;
    },

    proveedorSelectHtml(selected) {
      const sel = String(selected ?? '');
      const opts = (this._proveedores || [])
        .map((p) => {
          const cod = String(p.CODPROV ?? '');
          const nom = String(p.EMPRESA || p.RAZONSOCIAL || '').trim();
          const nit = String(p.NIT || '').trim();
          const label = nit ? `${cod} — ${nom} (${nit})` : `${cod} — ${nom}`;
          return `<option value="${this.escapeHtml(cod)}"${sel === cod ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
        })
        .join('');
      return `<option value="">— Seleccione proveedor —</option>${opts}`;
    },

    moneyInput(fieldId, value, { readonly = false, extraClass = '' } = {}) {
      const ro = readonly ? 'readonly' : '';
      const cls = extraClass ? ` ${extraClass}` : '';
      return `
        <div class="input-group input-group-sm ret-doc-money${cls}">
          <span class="input-group-text">Q</span>
          <input type="number" step="0.001" class="form-control form-control-sm" id="${fieldId}"
            value="${value !== '' && value !== null && value !== undefined ? Number(value) : ''}" ${ro}>
        </div>`;
    },

    renderListCardsHtml() {
      const rows = this.filteredRows();
      if (!rows.length) {
        return `<p class="text-center text-muted py-4 mb-0">Sin retenciones en este período</p>`;
      }
      return rows
        .map((r) => {
          const factRef =
            r.SERIEFAC || r.NOFAC
              ? `${this.escapeHtml(r.SERIEFAC || '—')}-${this.escapeHtml(r.NOFAC || '—')}`
              : '—';
          return `
        <div class="pos-pedido-card inv-doc-card" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}">
          <div class="pos-pedido-card-top">
            <span class="pos-pedido-card-doc">${this.escapeHtml(r.CODDOC)} #${this.escapeHtml(r.CORRELATIVO)}</span>
            <span class="pos-pedido-card-total">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</span>
          </div>
          <div class="pos-pedido-card-meta small text-muted mb-1">
            ${this.escapeHtml(this.formatDate(r.FECHA))} · ${this.escapeHtml(r.CONCRE === 'CRE' ? 'Crédito' : 'Contado')}
          </div>
          <div class="pos-pedido-card-cliente">${this.escapeHtml(r.DOC_NOMCLIE || '—')}</div>
          <div class="small text-muted mb-2">Factura ref.: ${factRef}</div>
          <div class="inv-card-actions">
            <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar">
              <i class="fa-solid fa-pen me-1"></i>Editar
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir">
              <i class="fa-solid fa-print me-1"></i>Imprimir
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar">
              <i class="fa-solid fa-trash me-1"></i>Eliminar
            </button>
          </div>
        </div>`;
        })
        .join('');
    },

    renderListScreen() {
      const p = LibroContableCommon;
      return `
        <div class="pos-list-wrap ret-doc-list-wrap">
          <div class="pos-list-header">
            <h2 class="pos-list-title">${this.escapeHtml(cfg.title)}</h2>
            <p class="pos-list-sub text-muted mb-0">${this.filteredRows().length} retención(es) · ${p.mesLabel(this._mes)} ${this._anio}</p>
          </div>
          <div class="pos-list-toolbar mb-3 d-flex flex-wrap align-items-end gap-2">
            ${p.periodSelectsHtml(P, this._mes, this._anio)}
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-${P}-recargar">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-${P}-setup" title="Configurar tipo y formatos contables">
              <i class="fa-solid fa-gears me-1"></i>Configurar ${cfg.setupCode}
            </button>
            <div class="pos-list-search flex-grow-1">
              <input type="search" class="form-control form-control-sm pos-search-glow" id="${id('list-search')}"
                placeholder="Buscar proveedor, factura…" value="${this.escapeHtml(this._listFilter)}">
            </div>
          </div>
          <p class="small text-muted mb-2">
            Formato contado: <code>${cfg.formatoCon}</code> · crédito: <code>${cfg.formatoCre}</code>
          </p>
          <div class="pos-pedido-cards" id="${id('list-cards')}">${this.renderListCardsHtml()}</div>
          <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-${P}-list-nuevo"
            aria-label="Nueva retención" title="Nueva retención">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>`;
    },

    renderEditorForm() {
      const d = this._doc || {};
      const editable = this.docEditable(d);
      const dis = editable ? '' : 'disabled';
      return `
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0">Documento</label>
            <input type="text" class="form-control form-control-sm" readonly
              value="${this.escapeHtml(`${d.CODDOC || ''} #${d.CORRELATIVO || ''}`)}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('fecha')}">Fecha</label>
            <input type="date" class="form-control form-control-sm" id="${id('fecha')}" ${dis}
              value="${this.escapeHtml(String(d.FECHA || '').slice(0, 10))}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('concre')}">Tipo pago</label>
            <select class="form-select form-select-sm" id="${id('concre')}" ${dis}>
              <option value="CON"${d.CONCRE === 'CON' ? ' selected' : ''}>Contado</option>
              <option value="CRE"${d.CONCRE === 'CRE' ? ' selected' : ''}>Crédito</option>
            </select>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-12">
            <label class="form-label small mb-0" for="${id('codprov')}">Proveedor</label>
            <select class="form-select form-select-sm" id="${id('codprov')}" ${dis}>
              ${this.proveedorSelectHtml(d.CODPROV)}
            </select>
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('serie')}">Serie factura ref.</label>
            <input type="text" class="form-control form-control-sm" id="${id('serie')}" ${dis}
              value="${this.escapeHtml(d.SERIEFAC || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('numero')}">Número factura ref.</label>
            <input type="text" class="form-control form-control-sm" id="${id('numero')}" ${dis}
              value="${this.escapeHtml(d.NOFAC || '')}">
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('fel')}">ID electrónico (FEL)</label>
            <input type="text" class="form-control form-control-sm" id="${id('fel')}" ${dis}
              value="${this.escapeHtml(d.FEL_UUDI || '')}">
          </div>
        </div>
        <div class="row g-2 mb-2">
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('base')}">${cfg.baseLabel}</label>
            ${this.moneyInput(id('base'), d.TOTALSINIVA ?? '', { readonly: !editable })}
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('retencion')}">${cfg.retencionLabel}</label>
            ${this.moneyInput(id('retencion'), d.TOTALIVA ?? d.TOTALPRECIO ?? '', { readonly: !editable })}
          </div>
          <div class="col-md-4">
            <label class="form-label small mb-0" for="${id('total-doc')}">Total documento</label>
            ${this.moneyInput(id('total-doc'), '', {
              readonly: true,
              extraClass: ' ret-doc-total-field',
            })}
          </div>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-0" for="${id('obs')}">Observaciones</label>
          <textarea class="form-control form-control-sm" id="${id('obs')}" rows="2" ${dis}>${this.escapeHtml(d.OBS || '')}</textarea>
        </div>
        ${editable ? `
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm btn-primary" id="btn-${P}-guardar">
              <i class="fa-solid fa-floppy-disk me-1"></i>Guardar
            </button>
          </div>` : ''}`;
    },

    renderEditorShell() {
      const d = this._doc;
      const editable = this.docEditable(d);
      return `
        <div class="pos-vista-wrap ret-doc-editor-wrap">
          <div class="pos-header card shadow-sm mb-2">
            <div class="card-body py-2 d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-${P}-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <span class="pos-header-doc-label fw-semibold">${this.escapeHtml(cfg.title)} · ${this.escapeHtml(d?.CODDOC || '')} #${this.escapeHtml(d?.CORRELATIVO || '')}</span>
            </div>
          </div>
          <div class="card shadow-sm mx-2 mb-5">
            <div class="card-body" id="${id('editor-body')}">${this.renderEditorForm()}</div>
          </div>
          ${editable ? `
            <div class="pos-fab-bar" id="${id('fab-bar')}">
              <button type="button" class="pos-fab-finalizar" id="btn-${P}-finalizar">
                <i class="fa-solid fa-check me-2"></i>Finalizar
              </button>
            </div>` : ''}
        </div>`;
    },

    syncTotalDocumento() {
      const baseEl = document.getElementById(id('base'));
      const retEl = document.getElementById(id('retencion'));
      const totalEl = document.getElementById(id('total-doc'));
      if (!baseEl || !retEl || !totalEl) return;
      const base = Number(baseEl.value) || 0;
      const ret = Number(retEl.value) || 0;
      const net = this.roundMoney(base - ret);
      totalEl.value = Number.isFinite(net) ? net : '';
    },

    readEditorPayload() {
      const retencion = Number(document.getElementById(id('retencion'))?.value) || 0;
      const base = Number(document.getElementById(id('base'))?.value) || 0;
      return {
        FECHA: document.getElementById(id('fecha'))?.value || null,
        CODPROV: document.getElementById(id('codprov'))?.value || null,
        CONCRE: document.getElementById(id('concre'))?.value || 'CON',
        SERIEFAC: document.getElementById(id('serie'))?.value?.trim() || '',
        NOFAC: document.getElementById(id('numero'))?.value?.trim() || '',
        FEL_UUDI: document.getElementById(id('fel'))?.value?.trim() || '',
        TOTALSINIVA: base,
        TOTALIVA: retencion,
        TOTALPRECIO: retencion,
        OBS: document.getElementById(id('obs'))?.value?.trim() || '',
      };
    },

    refreshListDom() {
      const grid = this._container?.querySelector(`#${id('list-cards')}`);
      if (grid) grid.innerHTML = this.renderListCardsHtml();
    },

    async showList() {
      this._screen = 'list';
      this._doc = null;
      await this.fetchList();
      this._container.innerHTML = this.renderListScreen();
      this.bindListEvents();
    },

    async showEditor(coddoc, correlativo) {
      this._screen = 'editor';
      if (!this._proveedores.length) await this.fetchProveedores();
      this._doc = await F.fetchJson(this.apiBase(`/${encodeURIComponent(coddoc)}/${correlativo}`), {
        cache: 'no-store',
      });
      this._container.innerHTML = this.renderEditorShell();
      this.bindEditorEvents();
      this.syncTotalDocumento();
    },

    async reloadListOnly() {
      await this.fetchList();
      this.refreshListDom();
    },

    async runSetup() {
      const data = await F.fetchJson(this.apiBase('/setup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      this._setup = data;
      const warns = (data.warnings || []).join(' ');
      F.toast(
        warns ? `${cfg.setupCode} configurado. ${warns}` : `Tipo ${cfg.setupCode} y formatos contables listos`,
        'success'
      );
    },

    async onNuevo() {
      const user = F.session('user');
      const doc = await F.fetchJson(this.apiBase(''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ USUARIO: user?.usuario || user?.nombre || 'SISTEMA' }),
      });
      await this.showEditor(doc.CODDOC, doc.CORRELATIVO);
      F.toast(`${cfg.labelNueva} creada`, 'success');
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
        if (!payload.SERIEFAC || !payload.NOFAC) {
          F.toast('Indique serie y número de factura referencia', 'warning');
          return;
        }
        if (payload.TOTALIVA <= 0) {
          F.toast('El monto de retención debe ser mayor a cero', 'warning');
          return;
        }
        await F.fetchJson(
          this.apiBase(`/${encodeURIComponent(CODDOC)}/${CORRELATIVO}/finalizar`),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        F.toast('Retención finalizada', 'success');
        this._doc = null;
        await this.showList();
      } finally {
        this._saving = false;
      }
    },

    async eliminarRetencion(coddoc, correlativo) {
      const label = `${coddoc} #${correlativo}`;
      const pass = await CatalogosUI.confirmEliminarDocumento({
        label,
        tipo: cfg.labelSingular,
      });
      if (!pass) return;
      const url = `/api/documentos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
      await F.fetchJson(url, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: String(pass) }),
      });
      F.toast('Retención eliminada', 'success');
      if (
        this._doc &&
        String(this._doc.CODDOC) === String(coddoc) &&
        Number(this._doc.CORRELATIVO) === Number(correlativo)
      ) {
        await this.showList();
      } else {
        await this.reloadListOnly();
      }
    },

    async imprimirRetencion(coddoc, correlativo) {
      const doc = await F.fetchJson(this.apiBase(`/${encodeURIComponent(coddoc)}/${correlativo}`), {
        cache: 'no-store',
      });
      const base = Number(doc.TOTALSINIVA) || 0;
      const ret = Number(doc.TOTALIVA) || Number(doc.TOTALPRECIO) || 0;
      const neto = this.roundMoney(base - ret);
      await PrintReport.openAndPrint(
        () =>
          PrintReport.wrapDocument({
            title: cfg.title,
            bodyHtml: `
              ${PrintReport.reportHeaderHtml({
                title: cfg.title,
                subtitleHtml: `
                  <p><strong>${PrintReport.escapeHtml(doc.CODDOC)} #${doc.CORRELATIVO}</strong> · ${PrintReport.escapeHtml(this.formatDate(doc.FECHA))}</p>
                  <p><strong>Proveedor:</strong> ${PrintReport.escapeHtml(doc.DOC_NOMCLIE || '—')} · NIT ${PrintReport.escapeHtml(doc.DOC_NIT || '—')}</p>
                  <p><strong>Factura ref.:</strong> ${PrintReport.escapeHtml(doc.SERIEFAC || '—')} ${PrintReport.escapeHtml(doc.NOFAC || '')}</p>
                  <p><strong>Pago:</strong> ${doc.CONCRE === 'CRE' ? 'Crédito' : 'Contado'}</p>
                `,
              })}
              <table class="table table-sm">
                <tbody>
                  <tr><td>${PrintReport.escapeHtml(cfg.baseLabel)}</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(base))}</td></tr>
                  <tr><td>${PrintReport.escapeHtml(cfg.retencionLabel)}</td><td class="text-end">${PrintReport.escapeHtml(this.formatMoney(ret))}</td></tr>
                  <tr><td><strong>Total documento</strong></td><td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(neto))}</strong></td></tr>
                </tbody>
              </table>
              ${doc.OBS ? `<p><em>${PrintReport.escapeHtml(doc.OBS)}</em></p>` : ''}
            `,
          }),
        'width=720,height=640'
      );
    },

    bindListEvents() {
      const c = this._container;
      c?.querySelector(`#${P}-mes`)?.addEventListener('change', (e) => {
        this._mes = Number(e.target.value);
        this.reloadListOnly().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#${P}-anio`)?.addEventListener('change', (e) => {
        this._anio = Number(e.target.value);
        this.reloadListOnly().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#btn-${P}-recargar`)?.addEventListener('click', () => {
        this.reloadListOnly().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#btn-${P}-setup`)?.addEventListener('click', () => {
        this.runSetup().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#btn-${P}-list-nuevo`)?.addEventListener('click', () => {
        this.onNuevo().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#${id('list-search')}`)?.addEventListener('input', (e) => {
        this._listFilter = e.target.value;
        this.refreshListDom();
      });
      c?.querySelector(`#${id('list-cards')}`)?.addEventListener('click', async (e) => {
        const btn = e.target.closest('.inv-card-btn');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.inv-doc-card');
        const coddoc = card?.getAttribute('data-coddoc');
        const correlativo = card?.getAttribute('data-correlativo');
        const action = btn.getAttribute('data-action');
        if (!coddoc || !correlativo) return;
        if (action === 'editar') await this.showEditor(coddoc, correlativo);
        else if (action === 'imprimir') await this.imprimirRetencion(coddoc, correlativo);
        else if (action === 'eliminar') await this.eliminarRetencion(coddoc, correlativo);
      });
    },

    bindEditorEvents() {
      const c = this._container;
      c?.querySelector(`#btn-${P}-atras`)?.addEventListener('click', () => this.showList());
      c?.querySelector(`#btn-${P}-guardar`)?.addEventListener('click', () => {
        this.onGuardar().catch((err) => F.toast(err.message, 'error'));
      });
      c?.querySelector(`#btn-${P}-finalizar`)?.addEventListener('click', () => {
        this.onFinalizar().catch((err) => F.toast(err.message, 'error'));
      });
      document.getElementById(id('base'))?.addEventListener('input', () => this.syncTotalDocumento());
      document.getElementById(id('retencion'))?.addEventListener('input', () => this.syncTotalDocumento());
    },

    async load(container) {
      this._container = container;
      const period = this.defaultPeriod();
      this._mes = period.mes;
      this._anio = period.anio;
      container.classList.remove('align-items-center', 'justify-content-center');
      container.classList.add('align-items-stretch', 'justify-content-start', 'ret-doc-main-host');
      container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;
      try {
        const config = await F.fetchJson(this.apiBase('/config'), { cache: 'no-store' });
        this._setup = config.setup;
        await this.fetchProveedores();
        await this.showList();
      } catch (err) {
        container.innerHTML = `<div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
        F.toast(err.message, 'error');
      }
    },
  };
}
