/**
 * Vista Cuentas por cobrar — facturas al crédito (FAC/FEL) con DOC_SALDO menos DOC_ABONO pendiente.
 */
const CuentasPorCobrarView = {
  _container: null,
  _rows: [],
  _total: 0,
  _sumSaldo: 0,
  _sumTotal: 0,
  _truncated: false,
  _filterQuery: '',
  _loading: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({ empnit: emp, limit: '500', ...extraParams });
    return `/api/cuentas-cobrar/documentos?${params}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  docLabel(row) {
    return `${row?.CODDOC || ''} #${row?.CORRELATIVO ?? ''}`;
  },

  isVencido(row) {
    const v = String(row?.VENCIMIENTO || '').slice(0, 10);
    if (!v) return false;
    const today = new Date();
    const t = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return v < t;
  },

  filteredRows() {
    return this._rows;
  },

  async fetchDocumentos() {
    const params = { _: String(Date.now()) };
    const q = this._filterQuery.trim();
    if (q) params.q = q;
    const data = await F.fetchJson(this.apiUrl(params), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._total = Number(data.total) || this._rows.length;
    this._sumSaldo = Number(data.sumSaldo) || 0;
    this._sumTotal = Number(data.sumTotal) || 0;
    this._truncated = Boolean(data.truncated);
    return this._rows;
  },

  renderTableBodyHtml() {
    const rows = this.filteredRows();
    if (!rows.length) {
      return `<tr><td colspan="11" class="text-center text-muted py-4">No hay facturas al crédito con saldo pendiente</td></tr>`;
    }
    return rows
      .map((r) => {
        const vencido = this.isVencido(r);
        const rowCls = vencido ? 'cxp-row-vencido' : '';
        return `<tr class="cxp-row ${rowCls}" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}" role="button" tabindex="0">
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="text-nowrap${vencido ? ' text-danger fw-semibold' : ''}">${this.escapeHtml(this.formatFecha(r.VENCIMIENTO))}</td>
          <td><span class="badge text-bg-secondary">${this.escapeHtml(r.TIPODOC || '')}</span></td>
          <td class="fw-semibold text-nowrap">${this.escapeHtml(r.CODDOC)} #${this.escapeHtml(r.CORRELATIVO)}</td>
          <td>${this.escapeHtml(r.DOC_NOMCLIE || r.NEGOCIO || '—')}</td>
          <td class="small text-muted">${this.escapeHtml(r.NEGOCIO || '—')}</td>
          <td class="small">${this.escapeHtml(r.VENDEDOR || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.DOC_SALDO))}</td>
          <td class="text-end text-success">${this.escapeHtml(this.formatMoney(r.DOC_ABONO))}</td>
          <td class="text-end fw-semibold text-primary">${this.escapeHtml(this.formatMoney(r.SALDO_PENDIENTE))}</td>
        </tr>`;
      })
      .join('');
  },

  renderShell() {
    const count = this.filteredRows().length;
  const truncHint = this._truncated
      ? `<p class="small text-warning mb-0 mt-1"><i class="fa-solid fa-triangle-exclamation me-1"></i>Mostrando ${count} de ${this._total} documento(s). Refine la búsqueda para ver más.</p>`
      : '';
    return `
      <div class="cxp-wrap w-100">
        <div class="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1"><i class="fa-solid fa-hand-holding-dollar me-2 text-primary"></i>Cuentas por cobrar</h2>
            <p class="text-muted small mb-0">Facturas FAC y FEL al crédito (CONCRE = CRE) con saldo pendiente: DOC_SALDO − DOC_ABONO &gt; 0</p>
          </div>
          <div class="cxp-summary card border-0 shadow-sm">
            <div class="card-body py-2 px-3 d-flex flex-wrap gap-3 align-items-center">
              <div class="small">
                <span class="text-muted">Documentos:</span>
                <strong class="ms-1">${count}</strong>
              </div>
              <div class="small">
                <span class="text-muted">Saldo total:</span>
                <strong class="ms-1 text-primary">${this.escapeHtml(this.formatMoney(this._sumSaldo))}</strong>
              </div>
            </div>
          </div>
        </div>
        <div class="card shadow-sm mb-3">
          <div class="card-body py-2">
            <div class="input-group input-group-sm">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="cxp-search"
                placeholder="Buscar documento, cliente, NIT, vendedor…"
                value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
            </div>
            ${truncHint}
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped mb-0 cxp-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Fecha</th>
                  <th>Vence</th>
                  <th>Tipo</th>
                  <th>Documento</th>
                  <th>Cliente</th>
                  <th>Negocio</th>
                  <th>Vendedor</th>
                  <th class="text-end">Total</th>
                  <th class="text-end">Doc. saldo</th>
                  <th class="text-end">Abonos</th>
                  <th class="text-end">Pendiente</th>
                </tr>
              </thead>
              <tbody id="cxp-tbody">${this.renderTableBodyHtml()}</tbody>
              <tfoot class="table-light">
                <tr>
                  <td colspan="10" class="text-end fw-semibold">Saldo pendiente (listado)</td>
                  <td class="text-end fw-bold text-primary">${this.escapeHtml(this.formatMoney(this._sumSaldo))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        <p class="small text-muted mt-2 mb-0">Clic en una fila para ver opciones del documento.</p>
      </div>`;
  },

  refreshDom() {
    const tbody = this._container?.querySelector('#cxp-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml();
    const search = this._container?.querySelector('#cxp-search');
    if (search && search.value !== this._filterQuery) search.value = this._filterQuery;
  },

  findRow(coddoc, correlativo) {
    return this._rows.find(
      (r) => String(r.CODDOC) === String(coddoc) && String(r.CORRELATIVO) === String(correlativo),
    );
  },

  async onRowAction(coddoc, correlativo) {
    if (typeof DocumentosView === 'undefined') {
      const row = this.findRow(coddoc, correlativo);
      if (row && typeof DocOpciones !== 'undefined') {
        await DocOpciones.imprimir(coddoc, correlativo, row);
      }
      return;
    }
    const savedRows = DocumentosView._rows;
    const savedReload = DocumentosView.reload;
    DocumentosView._rows = this._rows;
    DocumentosView.reload = async () => {
      await this.fetchDocumentos();
      this._container.innerHTML = this.renderShell();
      this.bindEvents();
    };
    try {
      await DocumentosView.showMenuDocumento(coddoc, correlativo);
    } finally {
      DocumentosView._rows = savedRows;
      DocumentosView.reload = savedReload;
    }
    await this.fetchDocumentos();
    this._container.innerHTML = this.renderShell();
    this.bindEvents();
  },

  bindEvents() {
    const search = this._container?.querySelector('#cxp-search');
    let searchTimer = null;
    search?.addEventListener('input', () => {
      this._filterQuery = search.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(async () => {
        try {
          this._loading = true;
          await this.fetchDocumentos();
          this._container.innerHTML = this.renderShell();
          this.bindEvents();
        } catch (err) {
          F.toast(err.message || 'Error al buscar', 'error');
        } finally {
          this._loading = false;
        }
      }, 350);
    });

    const onRowPick = (row) => {
      const coddoc = row.getAttribute('data-coddoc');
      const correlativo = row.getAttribute('data-correlativo');
      if (!coddoc || !correlativo) return;
      this.onRowAction(coddoc, correlativo).catch((err) => F.toast(err.message || 'Error', 'error'));
    };

    this._container?.querySelectorAll('.cxp-row').forEach((row) => {
      row.addEventListener('click', () => onRowPick(row));
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowPick(row);
        }
      });
    });
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-2', 'p-md-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando cuentas por cobrar…</div>`;
    try {
      await this.fetchDocumentos();
      container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
