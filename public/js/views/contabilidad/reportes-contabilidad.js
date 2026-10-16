/**
 * Contabilidad → Reportes Contabilidad
 */
const ReportesContabilidadView = {
  _container: null,
  _desde: '',
  _hasta: '',
  _grupo: 'fel-facturas',
  _grupoLabel: '',
  _productos: [],
  _totales: { unidades: 0, precio: 0, costo: 0 },
  _filterQuery: '',
  _loading: false,
  _loadingDetalle: false,
  _modal: null,

  DOC_GROUPS: [
    { id: 'fel-facturas', label: 'FACTURAS FEL (TODAS LAS FEL)' },
    { id: 'fac', label: 'FACTURAS NO FISCALES (FAC)' },
    { id: 'compras', label: 'COMPRAS (COM Y COP)' },
    { id: 'fel-nc', label: 'NOTAS DE CREDITO FEL (FNC, FNA)' },
    { id: 'dev', label: 'NOTAS DE CREDITO NO FISCALES (DEV)' },
  ],

  todayIso() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  escapeHtml(value) {
    return String(value ?? '')
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

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 4 });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return this.escapeHtml(s);
  },

  modalHtml() {
    return `
      <div class="modal fade repcont-detalle-modal" id="repcont-detalle-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header py-2">
              <h5 class="modal-title" id="repcont-detalle-title">Documentos del producto</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body p-0">
              <p class="small text-muted px-3 pt-2 mb-2" id="repcont-detalle-meta"></p>
              <div class="table-responsive repcont-detalle-scroll">
                <table class="table table-sm table-striped table-hover mb-0 repcont-detalle-table">
                  <thead>
                    <tr>
                      <th>FECHA</th>
                      <th>CODDOC</th>
                      <th>CORRELATIVO</th>
                      <th>FEL_SERIE</th>
                      <th>FEL_NUMERO</th>
                      <th>CODMEDIDA</th>
                      <th class="text-end">CANTIDAD</th>
                      <th class="text-end">COSTO</th>
                      <th class="text-end">PRECIO</th>
                      <th class="text-end">TOTALCOSTO</th>
                      <th class="text-end">TOTALPRECIO</th>
                    </tr>
                  </thead>
                  <tbody id="repcont-detalle-tbody">
                    <tr><td colspan="11" class="text-center text-muted py-4">—</td></tr>
                  </tbody>
                  <tfoot id="repcont-detalle-tfoot" hidden>
                    <tr class="table-secondary fw-semibold">
                      <td colspan="6">Subtotales</td>
                      <td class="text-end" id="repcont-det-sub-cant"></td>
                      <td colspan="2"></td>
                      <td class="text-end" id="repcont-det-sub-costo"></td>
                      <td class="text-end" id="repcont-det-sub-precio"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderDetalleBody(lineas) {
    if (!lineas?.length) {
      return `<tr><td colspan="11" class="text-center text-muted py-4">Sin líneas en el rango</td></tr>`;
    }
    return lineas
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
        <td>${this.escapeHtml(r.CODDOC)}</td>
        <td>${this.escapeHtml(String(r.CORRELATIVO ?? ''))}</td>
        <td>${this.escapeHtml(r.FEL_SERIE || '—')}</td>
        <td>${this.escapeHtml(r.FEL_NUMERO || '—')}</td>
        <td>${this.escapeHtml(r.CODMEDIDA || '—')}</td>
        <td class="text-end">${this.escapeHtml(this.formatQty(r.CANTIDAD))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.COSTO))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.PRECIO))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
      </tr>`
      )
      .join('');
  },

  ensureModal() {
    let el = document.getElementById('repcont-detalle-modal');
    if (!el) {
      const wrap = document.createElement('div');
      wrap.innerHTML = this.modalHtml();
      el = wrap.firstElementChild;
      document.body.appendChild(el);
    }
    if (!this._modal && window.bootstrap?.Modal) {
      this._modal = window.bootstrap.Modal.getOrCreateInstance(el);
    }
    return el;
  },

  async openProductoDetalle(codprod, desprod) {
    if (!codprod || this._loadingDetalle) return;
    this.readHeaderFilters();
    const modalEl = this.ensureModal();
    const title = modalEl.querySelector('#repcont-detalle-title');
    const meta = modalEl.querySelector('#repcont-detalle-meta');
    const tbody = modalEl.querySelector('#repcont-detalle-tbody');
    const tfoot = modalEl.querySelector('#repcont-detalle-tfoot');
    if (title) {
      title.textContent = `${codprod} — ${desprod || 'Producto'}`;
    }
    if (meta) {
      meta.textContent = `${this._grupoLabel || this._grupo} · ${this.formatFecha(this._desde)} – ${this.formatFecha(this._hasta)}`;
    }
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-center text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…</td></tr>`;
    }
    if (tfoot) tfoot.hidden = true;
    this._modal?.show();

    this._loadingDetalle = true;
    try {
      const params = new URLSearchParams({
        empnit: F.getEmpNit(),
        codprod,
        desde: this._desde,
        hasta: this._hasta,
        grupo: this._grupo,
      });
      const data = await F.fetchJson(`/api/reportes-contabilidad/productos/documentos?${params}`);
      const lineas = data.lineas || [];
      if (tbody) tbody.innerHTML = this.renderDetalleBody(lineas);
      const tot = data.totales || {};
      if (tfoot && lineas.length) {
        tfoot.hidden = false;
        modalEl.querySelector('#repcont-det-sub-cant').textContent = this.formatQty(tot.cantidad);
        modalEl.querySelector('#repcont-det-sub-costo').textContent = this.formatMoney(tot.totalCosto);
        modalEl.querySelector('#repcont-det-sub-precio').textContent = this.formatMoney(tot.totalPrecio);
      }
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger py-4">${this.escapeHtml(err.message || 'Error')}</td></tr>`;
      }
    } finally {
      this._loadingDetalle = false;
    }
  },

  readHeaderFilters() {
    const d = this._container?.querySelector('#repcont-desde');
    const h = this._container?.querySelector('#repcont-hasta');
    const g = this._container?.querySelector('#repcont-grupo');
    if (d) this._desde = String(d.value || '').trim();
    if (h) this._hasta = String(h.value || '').trim();
    if (g) this._grupo = String(g.value || 'fel-facturas').trim();
  },

  filteredRows() {
    const q = String(this._filterQuery || '')
      .trim()
      .toLowerCase();
    let rows = this._productos || [];
    if (q) {
      rows = rows.filter((r) =>
        [r.CODPROD, r.DESPROD, r.TOTALUNIDADES, r.TOTALPRECIO, r.TOTALCOSTO]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ')
          .includes(q)
      );
    }
    return [...rows].sort((a, b) =>
      String(a.CODPROD || '').localeCompare(String(b.CODPROD || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      })
    );
  },

  groupOptionsHtml() {
    return this.DOC_GROUPS.map(
      (g) =>
        `<option value="${this.escapeHtml(g.id)}"${g.id === this._grupo ? ' selected' : ''}>${this.escapeHtml(g.label)}</option>`
    ).join('');
  },

  renderTableBody() {
    const rows = this.filteredRows();
    if (!rows.length) {
      return `<tr><td colspan="5" class="text-center text-muted py-4">Sin productos en el rango seleccionado</td></tr>`;
    }
    return rows
      .map(
        (r) => `
      <tr class="repcont-prod-row" role="button" tabindex="0"
        data-codprod="${this.escapeHtml(r.CODPROD)}"
        data-desprod="${this.escapeHtml(r.DESPROD)}"
        title="Ver documentos">
        <td>${this.escapeHtml(r.CODPROD)}</td>
        <td>${this.escapeHtml(r.DESPROD)}</td>
        <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
      </tr>`
      )
      .join('');
  },

  render() {
    const hoy = this.todayIso();
    this._desde = this._desde || hoy;
    this._hasta = this._hasta || hoy;
    return `
      <div class="repcont-view w-100 p-2 p-md-3">
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3 repcont-header-filters">
          <div class="flex-grow-1" style="min-width: 220px;">
            <label class="form-label small mb-1" for="repcont-grupo">Tipo de documentos</label>
            <select class="form-select form-select-sm" id="repcont-grupo">${this.groupOptionsHtml()}</select>
          </div>
          <div>
            <label class="form-label small mb-1" for="repcont-desde">Desde</label>
            <input type="date" class="form-control form-control-sm" id="repcont-desde" value="${this.escapeHtml(this._desde)}" />
          </div>
          <div>
            <label class="form-label small mb-1" for="repcont-hasta">Hasta</label>
            <input type="date" class="form-control form-control-sm" id="repcont-hasta" value="${this.escapeHtml(this._hasta)}" />
          </div>
          <button type="button" class="btn btn-sm btn-primary" id="btn-repcont-cargar">
            <i class="fa-solid fa-rotate me-1"></i>Cargar
          </button>
        </div>

        <ul class="nav nav-tabs repcont-tabs mb-3" role="tablist">
          <li class="nav-item" role="presentation">
            <button class="nav-link active" type="button" role="tab" aria-selected="true">
              REPORTES DE PRODUCTOS
            </button>
          </li>
        </ul>

        <div class="repcont-tab-pane">
          <div class="d-flex flex-wrap gap-2 align-items-center mb-2 repcont-toolbar">
            <div class="flex-grow-1 repcont-search-wrap">
              <input type="search" class="form-control form-control-sm" id="repcont-search"
                placeholder="Buscar código, descripción…" autocomplete="off" aria-label="Buscar" />
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-repcont-imprimir">
              <i class="fa-solid fa-print me-1"></i>Imprimir
            </button>
            <button type="button" class="btn btn-sm btn-outline-success" id="btn-repcont-export">
              <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
            </button>
          </div>

          <div class="table-responsive repcont-table-scroll">
            <table class="table table-sm table-striped table-hover repcont-table mb-0">
              <thead>
                <tr>
                  <th>CODPROD</th>
                  <th>DESPROD</th>
                  <th class="text-end">TOTALUNIDADES</th>
                  <th class="text-end">TOTALCOSTO</th>
                  <th class="text-end">TOTALPRECIO</th>
                </tr>
              </thead>
              <tbody id="repcont-tbody">${this.renderTableBody()}</tbody>
              <tfoot>
                <tr class="table-secondary fw-semibold">
                  <td colspan="2">Subtotales</td>
                  <td class="text-end" id="repcont-sub-unidades">${this.escapeHtml(this.formatQty(this._totales.unidades))}</td>
                  <td class="text-end" id="repcont-sub-costo">${this.escapeHtml(this.formatMoney(this._totales.costo))}</td>
                  <td class="text-end" id="repcont-sub-precio">${this.escapeHtml(this.formatMoney(this._totales.precio))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>`;
  },

  refreshTable() {
    const tbody = this._container?.querySelector('#repcont-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBody();
    const filtered = this.filteredRows();
    const subU = filtered.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
    const subC = filtered.reduce((s, r) => s + (Number(r.TOTALCOSTO) || 0), 0);
    const subP = filtered.reduce((s, r) => s + (Number(r.TOTALPRECIO) || 0), 0);
    this._container?.querySelector('#repcont-sub-unidades') &&
      (this._container.querySelector('#repcont-sub-unidades').textContent = this.formatQty(subU));
    this._container?.querySelector('#repcont-sub-costo') &&
      (this._container.querySelector('#repcont-sub-costo').textContent = this.formatMoney(subC));
    this._container?.querySelector('#repcont-sub-precio') &&
      (this._container.querySelector('#repcont-sub-precio').textContent = this.formatMoney(subP));
  },

  async fetchProductos() {
    this.readHeaderFilters();
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      desde: this._desde,
      hasta: this._hasta,
      grupo: this._grupo,
    });
    const data = await F.fetchJson(`/api/reportes-contabilidad/productos?${params}`);
    this._productos = data.productos || [];
    this._totales = data.totales || { unidades: 0, precio: 0, costo: 0 };
    this._grupoLabel = data.grupoLabel || this._grupo;
  },

  async imprimir() {
    if (typeof PrintReport === 'undefined') {
      F.toast('Imprimir no disponible', 'error');
      return;
    }
    await PrintReport.ensureLogo();
    const rows = this.filteredRows();
    const body = rows
      .map(
        (r) => `
      <tr>
        <td>${PrintReport.escapeHtml(r.CODPROD)}</td>
        <td>${PrintReport.escapeHtml(r.DESPROD)}</td>
        <td class="text-end">${PrintReport.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
        <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
        <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
      </tr>`
      )
      .join('');
    const subU = rows.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
    const subC = rows.reduce((s, r) => s + (Number(r.TOTALCOSTO) || 0), 0);
    const subP = rows.reduce((s, r) => s + (Number(r.TOTALPRECIO) || 0), 0);
    const html = PrintReport.wrapDocument({
      title: 'Reportes Contabilidad — Productos',
      extraStyles: `
        .repcont-print-totals { margin-top: 0; page-break-inside: avoid; break-inside: avoid; }
        .repcont-print-totals td, .repcont-print-totals th { border-top-width: 2px; }
      `,
      bodyHtml: `
        ${PrintReport.reportHeaderHtml({
          title: 'REPORTES DE PRODUCTOS',
          metaHtml: `
            <p><strong>Grupo:</strong> ${PrintReport.escapeHtml(this._grupoLabel)}</p>
            <p><strong>Desde:</strong> ${PrintReport.escapeHtml(this._desde)} &nbsp; <strong>Hasta:</strong> ${PrintReport.escapeHtml(this._hasta)}</p>
          `,
        })}
        <table class="table table-sm table-bordered repcont-print-data">
          <thead><tr>
            <th>CODPROD</th><th>DESPROD</th>
            <th class="text-end">TOTALUNIDADES</th>
            <th class="text-end">TOTALCOSTO</th>
            <th class="text-end">TOTALPRECIO</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table>
        <table class="table table-sm table-bordered repcont-print-totals">
          <tbody><tr>
            <td colspan="2"><strong>Subtotales</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatQty(subU))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(subC))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(subP))}</strong></td>
          </tr></tbody>
        </table>`,
    });
    await PrintReport.openAndPrint(() => html, 'width=900,height=700');
  },

  async exportExcel() {
    this.readHeaderFilters();
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      desde: this._desde,
      hasta: this._hasta,
      grupo: this._grupo,
    });
    const res = await fetch(`/api/reportes-contabilidad/productos/export?${params}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : 'rep_contab_productos.xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  bindEvents() {
    this._container?.querySelector('#btn-repcont-cargar')?.addEventListener('click', () => {
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#repcont-search')?.addEventListener('input', (e) => {
      this._filterQuery = e.target.value || '';
      this.refreshTable();
    });
    this._container?.querySelector('#btn-repcont-imprimir')?.addEventListener('click', () => {
      this.imprimir().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-repcont-export')?.addEventListener('click', () => {
      this.exportExcel().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#repcont-tbody')?.addEventListener('click', (e) => {
      const tr = e.target.closest('.repcont-prod-row');
      if (!tr || !this._container.contains(tr)) return;
      const cod = tr.getAttribute('data-codprod');
      const des = tr.getAttribute('data-desprod');
      if (!cod) return;
      this.openProductoDetalle(cod, des).catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#repcont-tbody')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('.repcont-prod-row');
      if (!tr) return;
      e.preventDefault();
      tr.click();
    });
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    const btn = this._container?.querySelector('#btn-repcont-cargar');
    if (btn) btn.disabled = true;
    try {
      await this.fetchProductos();
      this.refreshTable();
    } finally {
      this._loading = false;
      if (btn) btn.disabled = false;
    }
  },

  async load(container) {
    this._container = container;
    const hoy = this.todayIso();
    this._desde = hoy;
    this._hasta = hoy;
    this._grupo = 'fel-facturas';
    this._productos = [];
    this._totales = { unidades: 0, precio: 0, costo: 0 };
    this._filterQuery = '';
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = this.render();
    this.bindEvents();
    await this.reload();
  },
};
