/**
 * Historial de compras por proveedor (productos + documentos).
 * Usado en Compras y Órdenes de compra.
 */
const ProveedorHistorialComprasUI = {
  _state: null,
  _searchTimer: null,

  buttonHtml(id) {
    const btnId = String(id || 'proveedor-historial').trim() || 'proveedor-historial';
    return `<button type="button" class="btn btn-outline-secondary d-none" id="${btnId}"
      title="Historial de compras del proveedor"
      aria-label="Historial de compras del proveedor">
      <i class="fa-solid fa-clock-rotate-left me-1" aria-hidden="true"></i>Historial
    </button>`;
  },

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

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  },

  formatFecha(iso) {
    if (!iso) return '—';
    if (typeof DocFecha !== 'undefined' && DocFecha.formatDisplay) {
      return DocFecha.formatDisplay({ FECHA: iso });
    }
    return String(iso).slice(0, 10);
  },

  apiPath(apiBase, codprov, segment, params = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const base = String(apiBase || '/api/compras').replace(/\/$/, '');
    const qs = new URLSearchParams({ empnit: emp, ...params, _: String(Date.now()) });
    return `${base}/proveedores/${encodeURIComponent(codprov)}/historial-compras/${segment}?${qs}`;
  },

  ensureModalHost() {
    let el = document.getElementById('proveedor-hist-compras-modal');
    if (!el) {
      el = document.createElement('div');
      el.className = 'modal fade proveedor-hist-compras-modal';
      el.id = 'proveedor-hist-compras-modal';
      el.tabIndex = -1;
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header py-2">
              <h5 class="modal-title" id="proveedor-hist-compras-title">Historial de compras</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body py-2" id="proveedor-hist-compras-body"></div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>`;
      document.body.appendChild(el);
    } else if (el.parentElement !== document.body) {
      document.body.appendChild(el);
    }
    return el;
  },

  bindModalEvents() {
    const el = this.ensureModalHost();
    if (el.dataset.provHistBound === '1') return;
    el.dataset.provHistBound = '1';
    el.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-prov-hist-op-tab]');
      if (tabBtn) {
        const tab = tabBtn.getAttribute('data-prov-hist-op-tab') || 'productos';
        if (this._state) this._state.tab = tab;
        this.renderBody();
        if (tab === 'compras' && this._state && !this._state.documentosLoaded) {
          this.loadDocumentos().catch((err) => F.toast(err.message, 'error'));
        }
        return;
      }
      const prodBtn = e.target.closest('[data-prov-hist-codprod]');
      if (prodBtn && this._state) {
        const cod = prodBtn.getAttribute('data-prov-hist-codprod') || '';
        this._state.selectedCodprod = cod;
        this.renderBody();
        this.loadLineas(cod).catch((err) => F.toast(err.message, 'error'));
      }
    });
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'prov-hist-prod-search' || !this._state) return;
      clearTimeout(this._searchTimer);
      const q = e.target.value;
      this._searchTimer = setTimeout(() => {
        this._state.prodQ = q;
        this.fetchCatalogo(q).catch((err) => F.toast(err.message, 'error'));
      }, 350);
    });
  },

  renderCatalogRows() {
    const st = this._state;
    const rows = st?.catalogo || [];
    if (!rows.length) {
      return `<tr><td colspan="3" class="text-center text-muted py-3 small">Sin productos en el historial</td></tr>`;
    }
    return rows
      .map((r) => {
        const cod = String(r.CODPROD || '').trim();
        const active = st.selectedCodprod === cod ? 'table-active' : '';
        return `
          <tr role="button" class="${active}" data-prov-hist-codprod="${this.escapeHtml(cod)}">
            <td class="text-nowrap">${this.escapeHtml(cod)}</td>
            <td class="small">${this.escapeHtml(r.DESPROD || '—')}</td>
            <td class="small text-muted">${this.escapeHtml(r.DESMARCA || '—')}</td>
          </tr>`;
      })
      .join('');
  },

  renderLineasRows() {
    const st = this._state;
    if (!st?.selectedCodprod) {
      return `<tr><td colspan="7" class="text-center text-muted py-3 small">Seleccione un producto</td></tr>`;
    }
    if (st.lineasLoading) {
      return `<tr><td colspan="7" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
    }
    const rows = st.lineas || [];
    if (!rows.length) {
      return `<tr><td colspan="7" class="text-center text-muted py-3 small">Sin líneas</td></tr>`;
    }
    return rows
      .map(
        (r) => `
        <tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td>${this.escapeHtml(r.CODDOC || '')}</td>
          <td>${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
          <td>${this.escapeHtml(r.CODMEDIDA || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatQty(r.CANTIDAD))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.COSTO))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
        </tr>`
      )
      .join('');
  },

  renderDocsRows() {
    const st = this._state;
    if (st?.docsLoading) {
      return `<tr><td colspan="7" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin"></i></td></tr>`;
    }
    const rows = st?.documentos || [];
    if (!rows.length) {
      return `<tr><td colspan="7" class="text-center text-muted py-3 small">Sin compras registradas</td></tr>`;
    }
    return rows
      .map(
        (r) => `
        <tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td>${this.escapeHtml(r.CODDOC || '')}</td>
          <td>${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
          <td>${this.escapeHtml(r.SERIEFAC || '—')}</td>
          <td>${this.escapeHtml(r.NOFAC || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
          <td class="text-center">${this.escapeHtml(r.STATUS || '—')}</td>
        </tr>`
      )
      .join('');
  },

  renderBody() {
    const body = document.getElementById('proveedor-hist-compras-body');
    const title = document.getElementById('proveedor-hist-compras-title');
    const st = this._state;
    if (!body || !st) return;
    if (title) {
      title.textContent = `Historial de compras — ${st.proveedorNombre || st.codprov}`;
    }
    const tabProd = st.tab === 'productos' ? 'active' : '';
    const tabCompras = st.tab === 'compras' ? 'active' : '';
    const paneProd = st.tab === 'productos' ? 'show active' : '';
    const paneCompras = st.tab === 'compras' ? 'show active' : '';
    body.innerHTML = `
      <div class="text-start">
        <ul class="nav nav-tabs nav-tabs-sm mb-2" role="tablist">
          <li class="nav-item">
            <button type="button" class="nav-link ${tabProd}" data-prov-hist-op-tab="productos">Productos</button>
          </li>
          <li class="nav-item">
            <button type="button" class="nav-link ${tabCompras}" data-prov-hist-op-tab="compras">Compras</button>
          </li>
        </ul>
        <div class="tab-content">
          <div class="tab-pane fade ${paneProd}" id="prov-hist-pane-productos">
            <div class="row g-2">
              <div class="col-md-5">
                <input type="search" class="form-control form-control-sm mb-2" id="prov-hist-prod-search"
                  placeholder="Buscar código, producto, marca…" value="${this.escapeHtml(st.prodQ || '')}" autocomplete="off">
                <div class="table-responsive border rounded" style="max-height: 58vh;">
                  <table class="table table-sm table-hover mb-0 align-middle">
                    <thead class="table-light sticky-top">
                      <tr>
                        <th>Cód.</th>
                        <th>Producto</th>
                        <th>Marca</th>
                      </tr>
                    </thead>
                    <tbody>${this.renderCatalogRows()}</tbody>
                  </table>
                </div>
              </div>
              <div class="col-md-7">
                <span class="small text-muted mb-1 d-block">Detalle del producto seleccionado</span>
                <div class="table-responsive border rounded" style="max-height: 62vh;">
                  <table class="table table-sm table-hover mb-0 align-middle">
                    <thead class="table-light sticky-top">
                      <tr>
                        <th>Fecha</th>
                        <th>Coddoc</th>
                        <th>Correl.</th>
                        <th>Med.</th>
                        <th class="text-end">Cant.</th>
                        <th class="text-end">Costo</th>
                        <th class="text-end">Total</th>
                      </tr>
                    </thead>
                    <tbody id="prov-hist-lineas-tbody">${this.renderLineasRows()}</tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
          <div class="tab-pane fade ${paneCompras}" id="prov-hist-pane-compras">
            <div class="table-responsive border rounded" style="max-height: 62vh;">
              <table class="table table-sm table-hover mb-0 align-middle">
                <thead class="table-light sticky-top">
                  <tr>
                    <th>Fecha</th>
                    <th>Coddoc</th>
                    <th>Correl.</th>
                    <th>Serie FEL</th>
                    <th>Número FEL</th>
                    <th class="text-end">Total costo</th>
                    <th class="text-center">Status</th>
                  </tr>
                </thead>
                <tbody id="prov-hist-docs-tbody">${this.renderDocsRows()}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
  },

  async fetchCatalogo(q) {
    const st = this._state;
    if (!st) return;
    const url = this.apiPath(st.apiBase, st.codprov, 'catalogo-productos', {
      q: String(q ?? st.prodQ ?? '').trim(),
      tipodocs: st.tipodocs,
    });
    const data = await F.fetchJson(url, { cache: 'no-store' });
    st.catalogo = data.rows || [];
    const catBody = document.querySelector('#prov-hist-pane-productos table tbody');
    if (catBody) catBody.innerHTML = this.renderCatalogRows();
    else this.renderBody();
  },

  async loadLineas(codprod) {
    const st = this._state;
    if (!st || !codprod) return;
    st.lineasLoading = true;
    const tbody = document.getElementById('prov-hist-lineas-tbody');
    if (tbody) tbody.innerHTML = this.renderLineasRows();
    const url = this.apiPath(st.apiBase, st.codprov, 'lineas', {
      codprod,
      tipodocs: st.tipodocs,
    });
    const data = await F.fetchJson(url, { cache: 'no-store' });
    st.lineas = data.rows || [];
    st.lineasLoading = false;
    const tb = document.getElementById('prov-hist-lineas-tbody');
    if (tb) tb.innerHTML = this.renderLineasRows();
  },

  async loadDocumentos() {
    const st = this._state;
    if (!st) return;
    st.docsLoading = true;
    st.documentosLoaded = true;
    const tbody = document.getElementById('prov-hist-docs-tbody');
    if (tbody) tbody.innerHTML = this.renderDocsRows();
    const url = this.apiPath(st.apiBase, st.codprov, 'documentos', { tipodocs: st.tipodocs });
    const data = await F.fetchJson(url, { cache: 'no-store' });
    st.documentos = data.rows || [];
    st.docsLoading = false;
    const tb = document.getElementById('prov-hist-docs-tbody');
    if (tb) tb.innerHTML = this.renderDocsRows();
  },

  /**
   * @param {{ codprov: number, proveedorNombre?: string, apiBase?: string, tipodocs?: string }} opts
   */
  async open(opts = {}) {
    const codprov = Number(opts.codprov);
    if (!Number.isFinite(codprov) || codprov <= 0) {
      F.toast('Seleccione un proveedor primero', 'warning');
      return;
    }
    if (typeof bootstrap === 'undefined') {
      F.toast('No se pudo abrir el modal', 'error');
      return;
    }
    this._state = {
      codprov,
      proveedorNombre: String(opts.proveedorNombre || '').trim() || `Proveedor ${codprov}`,
      apiBase: opts.apiBase || '/api/compras',
      tipodocs: opts.tipodocs || 'COM,COP',
      tab: 'productos',
      prodQ: '',
      catalogo: [],
      selectedCodprod: '',
      lineas: [],
      lineasLoading: false,
      documentos: [],
      docsLoading: false,
      documentosLoaded: false,
    };
    this.bindModalEvents();
    this.renderBody();
    const el = this.ensureModalHost();
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    modal.show();
    try {
      await this.fetchCatalogo('');
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar el historial', 'error');
    }
  },

  /** Mostrar u ocultar el botón según haya proveedor en el documento. */
  syncButton(container, buttonId, hasProveedor) {
    const btn = container?.querySelector(`#${buttonId}`);
    if (!btn) return;
    btn.classList.toggle('d-none', !hasProveedor);
    btn.disabled = !hasProveedor;
  },
};