/**
 * Reportes → Reportes de Ventas
 * Tabs: Documentos | Productos | Marcas — rango de fechas.
 */
const ReportesVentasView = {
  _container: null,
  _desde: '',
  _hasta: '',
  _tab: 'documentos',
  _loading: false,
  _data: null,
  _filters: { documentos: '', productos: '', marcas: '' },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  defaultRange() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hoy = `${y}-${m}-${d}`;
    const primero = `${y}-${m}-01`;
    return { desde: primero, hasta: hoy };
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return this.escapeHtml(s);
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

  readFilters() {
    const d = this._container?.querySelector('#repven-desde');
    const h = this._container?.querySelector('#repven-hasta');
    if (d) this._desde = String(d.value || '').trim();
    if (h) this._hasta = String(h.value || '').trim();
  },

  async fetchData() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      desde: this._desde,
      hasta: this._hasta,
      _: String(Date.now()),
    });
    this._data = await F.fetchJson(`/api/reportes-ventas?${params}`);
    return this._data;
  },

  resumen() {
    return this._data?.resumen || {
      ventas: 0,
      devoluciones: 0,
      neto: 0,
      docsVenta: 0,
      docsDev: 0,
    };
  },

  filterRows(rows, keys, q) {
    const query = String(q || '')
      .trim()
      .toLowerCase();
    if (!query) return rows || [];
    return (rows || []).filter((r) =>
      keys
        .map((k) => String(r[k] ?? '').toLowerCase())
        .join(' ')
        .includes(query)
    );
  },

  tabClass(id) {
    return this._tab === id ? 'nav-link active' : 'nav-link';
  },

  renderResumenCards() {
    const r = this.resumen();
    return `
      <div class="repven-resumen d-flex flex-wrap justify-content-end gap-2">
        <div class="repven-card">
          <div class="repven-card-label">Ventas</div>
          <div class="repven-card-value">${this.escapeHtml(this.formatMoney(r.ventas))}</div>
          <div class="repven-card-sub text-muted">${r.docsVenta} doc(s)</div>
        </div>
        <div class="repven-card">
          <div class="repven-card-label">Devoluciones</div>
          <div class="repven-card-value text-danger">${this.escapeHtml(this.formatMoney(r.devoluciones))}</div>
          <div class="repven-card-sub text-muted">${r.docsDev} doc(s)</div>
        </div>
        <div class="repven-card repven-card-neto">
          <div class="repven-card-label">Neto</div>
          <div class="repven-card-value">${this.escapeHtml(this.formatMoney(r.neto))}</div>
          <div class="repven-card-sub text-muted">Ventas − Devoluciones</div>
        </div>
      </div>`;
  },

  renderDocumentos() {
    const q = this._filters.documentos;
    const rows = this.filterRows(this._data?.documentos || [], [
      'FECHA',
      'CODDOC',
      'CORRELATIVO',
      'CLIENTE',
      'TIPODOC',
      'DESDOC',
      'IMPORTE',
      'STATUS',
    ], q);
    const total = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
    const body = !rows.length
      ? `<tr><td colspan="7" class="text-center text-muted py-3">Sin documentos</td></tr>`
      : rows
          .map((r) => {
            const neg = Number(r.IMPORTE) < 0;
            return `
          <tr class="${neg ? 'repven-row-dev' : ''}">
            <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
            <td>${this.escapeHtml(r.TIPODOC || '—')}</td>
            <td>${this.escapeHtml(r.CODDOC || '—')}</td>
            <td class="text-end">${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
            <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
            <td class="text-center">${this.escapeHtml(r.STATUS || '—')}</td>
          </tr>`;
          })
          .join('');

    return `
      <div class="d-flex justify-content-end mb-2">
        <input type="search" class="form-control form-control-sm repven-search" data-tab="documentos"
          placeholder="Buscar documentos…" value="${this.escapeHtml(q)}">
      </div>
      <div class="table-responsive repven-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0 repven-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Coddoc</th>
              <th class="text-end">Correlativo</th>
              <th>Cliente</th>
              <th class="text-end">Importe</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="5" class="text-end fw-semibold">Total neto docs</td>
              <td class="text-end fw-semibold" id="repven-total-docs">${this.escapeHtml(this.formatMoney(total))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderProductos() {
    const q = this._filters.productos;
    const rows = this.filterRows(this._data?.productos || [], ['CODPROD', 'DESPROD', 'TOTALUNIDADES', 'IMPORTE'], q);
    const totalU = rows.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
    const totalI = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
    const body = !rows.length
      ? `<tr><td colspan="4" class="text-center text-muted py-3">Sin productos</td></tr>`
      : rows
          .map(
            (r) => `
          <tr>
            <td>${this.escapeHtml(r.CODPROD || '—')}</td>
            <td>${this.escapeHtml(r.DESPROD || '—')}</td>
            <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
          </tr>`
          )
          .join('');

    return `
      <div class="d-flex justify-content-end mb-2">
        <input type="search" class="form-control form-control-sm repven-search" data-tab="productos"
          placeholder="Buscar productos…" value="${this.escapeHtml(q)}">
      </div>
      <div class="table-responsive repven-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0 repven-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th class="text-end">Unidades</th>
              <th class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="text-end fw-semibold">Totales</td>
              <td class="text-end fw-semibold" id="repven-total-unid">${this.escapeHtml(this.formatQty(totalU))}</td>
              <td class="text-end fw-semibold" id="repven-total-prod">${this.escapeHtml(this.formatMoney(totalI))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderMarcas() {
    const q = this._filters.marcas;
    const rows = this.filterRows(this._data?.marcas || [], ['CODMARCA', 'DESMARCA', 'TOTALUNIDADES', 'IMPORTE'], q);
    const totalU = rows.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
    const totalI = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
    const body = !rows.length
      ? `<tr><td colspan="4" class="text-center text-muted py-3">Sin marcas</td></tr>`
      : rows
          .map(
            (r) => `
          <tr>
            <td class="text-end">${this.escapeHtml(r.CODMARCA ?? '—')}</td>
            <td>${this.escapeHtml(r.DESMARCA || 'Sin marca')}</td>
            <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
          </tr>`
          )
          .join('');

    return `
      <div class="d-flex justify-content-end mb-2">
        <input type="search" class="form-control form-control-sm repven-search" data-tab="marcas"
          placeholder="Buscar marcas…" value="${this.escapeHtml(q)}">
      </div>
      <div class="table-responsive repven-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0 repven-table">
          <thead>
            <tr>
              <th class="text-end">Cod. marca</th>
              <th>Marca</th>
              <th class="text-end">Unidades</th>
              <th class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="text-end fw-semibold">Totales</td>
              <td class="text-end fw-semibold" id="repven-total-munid">${this.escapeHtml(this.formatQty(totalU))}</td>
              <td class="text-end fw-semibold" id="repven-total-marca">${this.escapeHtml(this.formatMoney(totalI))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderTabBody() {
    if (this._loading) {
      return `<div class="text-center text-muted py-5"><i class="fa-solid fa-spinner fa-spin me-1"></i>Consultando…</div>`;
    }
    if (!this._data) {
      return `<div class="text-center text-muted py-5">Seleccione fechas y pulse Consultar</div>`;
    }
    if (this._tab === 'productos') return this.renderProductos();
    if (this._tab === 'marcas') return this.renderMarcas();
    return this.renderDocumentos();
  },

  renderHtml() {
    const r = this.resumen();
    return `
      <div class="pos-list-wrap repven-wrap">
        <div class="pos-list-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title mb-0">Reportes de Ventas</h2>
            <p class="pos-list-sub text-muted mb-0">
              Ventas (FAC/FEF/FEC/FES) − Devoluciones (DEV/FNC/FNA) · sin anulados · sin REPORTES=NO
            </p>
          </div>
        </div>

        <div class="repven-toolbar d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3 mt-2">
          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label class="form-label form-label-sm mb-0" for="repven-desde">Fecha inicial</label>
              <input type="date" id="repven-desde" class="form-control form-control-sm" value="${this.escapeHtml(this._desde)}">
            </div>
            <div>
              <label class="form-label form-label-sm mb-0" for="repven-hasta">Fecha final</label>
              <input type="date" id="repven-hasta" class="form-control form-control-sm" value="${this.escapeHtml(this._hasta)}">
            </div>
            <button type="button" class="btn btn-sm btn-primary" id="repven-consultar">
              <i class="fa-solid fa-magnifying-glass me-1"></i>Consultar
            </button>
          </div>
          ${this._data ? this.renderResumenCards() : '<div class="repven-resumen"></div>'}
        </div>

        <ul class="nav nav-tabs repven-tabs mb-2">
          <li class="nav-item">
            <button type="button" class="${this.tabClass('documentos')}" data-tab="documentos">
              Documentos${this._data ? ` (${(this._data.documentos || []).length})` : ''}
            </button>
          </li>
          <li class="nav-item">
            <button type="button" class="${this.tabClass('productos')}" data-tab="productos">
              Productos${this._data ? ` (${(this._data.productos || []).length})` : ''}
            </button>
          </li>
          <li class="nav-item">
            <button type="button" class="${this.tabClass('marcas')}" data-tab="marcas">
              Marcas${this._data ? ` (${(this._data.marcas || []).length})` : ''}
            </button>
          </li>
        </ul>

        <div id="repven-tab-body" class="repven-tab-body">
          ${this.renderTabBody()}
        </div>

        ${
          this._data
            ? `<div class="repven-footer-note text-muted mt-2">
                 Período ${this.escapeHtml(this.formatFecha(this._data.desde))}
                 — ${this.escapeHtml(this.formatFecha(this._data.hasta))}
                 · Neto ${this.escapeHtml(this.formatMoney(r.neto))}
               </div>`
            : ''
        }
      </div>`;
  },

  refreshTabBody() {
    const el = this._container?.querySelector('#repven-tab-body');
    if (!el || !this._data) return;

    const tbody = el.querySelector('tbody');
    if (!tbody) {
      el.innerHTML = this.renderTabBody();
      this.bindSearch();
      return;
    }

    if (this._tab === 'documentos') {
      const rows = this.filterRows(this._data.documentos || [], [
        'FECHA', 'CODDOC', 'CORRELATIVO', 'CLIENTE', 'TIPODOC', 'DESDOC', 'IMPORTE', 'STATUS',
      ], this._filters.documentos);
      const total = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
      tbody.innerHTML = !rows.length
        ? `<tr><td colspan="7" class="text-center text-muted py-3">Sin documentos</td></tr>`
        : rows
            .map((r) => {
              const neg = Number(r.IMPORTE) < 0;
              return `
            <tr class="${neg ? 'repven-row-dev' : ''}">
              <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
              <td>${this.escapeHtml(r.TIPODOC || '—')}</td>
              <td>${this.escapeHtml(r.CODDOC || '—')}</td>
              <td class="text-end">${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
              <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
              <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
              <td class="text-center">${this.escapeHtml(r.STATUS || '—')}</td>
            </tr>`;
            })
            .join('');
      const tot = el.querySelector('#repven-total-docs');
      if (tot) tot.textContent = this.formatMoney(total);
      return;
    }

    if (this._tab === 'productos') {
      const rows = this.filterRows(this._data.productos || [], ['CODPROD', 'DESPROD', 'TOTALUNIDADES', 'IMPORTE'], this._filters.productos);
      const totalU = rows.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
      const totalI = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
      tbody.innerHTML = !rows.length
        ? `<tr><td colspan="4" class="text-center text-muted py-3">Sin productos</td></tr>`
        : rows
            .map(
              (r) => `
            <tr>
              <td>${this.escapeHtml(r.CODPROD || '—')}</td>
              <td>${this.escapeHtml(r.DESPROD || '—')}</td>
              <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
              <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
            </tr>`
            )
            .join('');
      const u = el.querySelector('#repven-total-unid');
      const i = el.querySelector('#repven-total-prod');
      if (u) u.textContent = this.formatQty(totalU);
      if (i) i.textContent = this.formatMoney(totalI);
      return;
    }

    const rows = this.filterRows(this._data.marcas || [], ['CODMARCA', 'DESMARCA', 'TOTALUNIDADES', 'IMPORTE'], this._filters.marcas);
    const totalU = rows.reduce((s, r) => s + (Number(r.TOTALUNIDADES) || 0), 0);
    const totalI = rows.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
    tbody.innerHTML = !rows.length
      ? `<tr><td colspan="4" class="text-center text-muted py-3">Sin marcas</td></tr>`
      : rows
          .map(
            (r) => `
          <tr>
            <td class="text-end">${this.escapeHtml(r.CODMARCA ?? '—')}</td>
            <td>${this.escapeHtml(r.DESMARCA || 'Sin marca')}</td>
            <td class="text-end">${this.escapeHtml(this.formatQty(r.TOTALUNIDADES))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
          </tr>`
          )
          .join('');
    const u = el.querySelector('#repven-total-munid');
    const i = el.querySelector('#repven-total-marca');
    if (u) u.textContent = this.formatQty(totalU);
    if (i) i.textContent = this.formatMoney(totalI);
  },

  bindSearch() {
    this._container?.querySelectorAll('.repven-search').forEach((input) => {
      if (input.dataset.bound === '1') return;
      input.dataset.bound = '1';
      let timer = null;
      input.addEventListener('input', () => {
        const tab = input.getAttribute('data-tab');
        this._filters[tab] = input.value || '';
        clearTimeout(timer);
        timer = setTimeout(() => this.refreshTabBody(), 120);
      });
    });
  },

  bindEvents() {
    this._container.querySelector('#repven-consultar')?.addEventListener('click', () => this.consultar());
    this._container.querySelectorAll('.repven-tabs [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (!tab || tab === this._tab) return;
        this._tab = tab;
        this.render();
      });
    });
    this.bindSearch();
  },

  render() {
    if (!this._container) return;
    this._container.innerHTML = this.renderHtml();
    this.bindEvents();
  },

  async consultar() {
    this.readFilters();
    if (!this._desde || !this._hasta) {
      F.toast('Indique fecha inicial y final', 'warning');
      return;
    }
    this._loading = true;
    this._filters = { documentos: '', productos: '', marcas: '' };
    this.render();
    try {
      await this.fetchData();
    } catch (err) {
      F.toast(err.message || 'Error al consultar', 'error');
      this._data = null;
    } finally {
      this._loading = false;
      this.render();
    }
  },

  async load(container) {
    this._container = container;
    const def = this.defaultRange();
    this._desde = def.desde;
    this._hasta = def.hasta;
    this._tab = 'documentos';
    this._data = null;
    this._filters = { documentos: '', productos: '', marcas: '' };
    this._loading = false;
    this.render();
    await this.consultar();
  },
};

window.ReportesVentasView = ReportesVentasView;
