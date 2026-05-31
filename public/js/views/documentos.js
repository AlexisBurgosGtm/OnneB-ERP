/**
 * Vista Documentos — listado por mes, año y tipo (TIPODOC).
 */
const DOCUMENTOS_MESES = [
  { value: 1, label: 'ENERO' },
  { value: 2, label: 'FEBRERO' },
  { value: 3, label: 'MARZO' },
  { value: 4, label: 'ABRIL' },
  { value: 5, label: 'MAYO' },
  { value: 6, label: 'JUNIO' },
  { value: 7, label: 'JULIO' },
  { value: 8, label: 'AGOSTO' },
  { value: 9, label: 'SEPTIEMBRE' },
  { value: 10, label: 'OCTUBRE' },
  { value: 11, label: 'NOVIEMBRE' },
  { value: 12, label: 'DICIEMBRE' },
];

const DOCUMENTOS_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  DOCUMENTOS_ANIOS.push({ value: y, label: String(y) });
}

function documentosFormatDateDdMmYyyy(value) {
  if (value === null || value === undefined || value === '') return '—';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '—';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const year = dt.getFullYear();
  return `${day}/${month}/${year}`;
}

const DocumentosView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _mes: null,
  _anio: null,
  _tipodoc: '',
  _tipos: [],
  _loading: false,

  tableColumns: [
    { key: 'FECHA', label: 'Fecha doc.', type: 'date' },
    { key: 'CORRELATIVO', label: 'Correlativo' },
    { key: 'CODDOC', label: 'Cod. doc.' },
    { key: 'DESDOC', label: 'Descripción', cellClass: 'documentos-col-desc' },
    { key: 'DOC_NOMCLIE', label: 'Cliente' },
    { key: 'NEGOCIO', label: 'Negocio' },
    { key: 'VENDEDOR', label: 'Vendedor', cellClass: 'documentos-col-vendedor' },
    { key: 'TOTALPRECIO', label: 'Total', type: 'money' },
    { key: 'STATUS', label: 'Estado', type: 'status' },
    { key: 'CONCRE', label: 'Pago' },
  ],

  defaultPeriod() {
    const now = new Date();
    let anio = now.getFullYear();
    if (anio < 2020) anio = 2020;
    if (anio > 2027) anio = 2027;
    return { mes: now.getMonth() + 1, anio };
  },

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  buildListParams() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      tipodoc: this._tipodoc,
    });
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    return params;
  },

  apiUrlLista() {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const params = this.buildListParams();
    params.set('_', String(Date.now()));
    return `/api/documentos/lista?${params.toString()}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  cellValue(row, key) {
    if (!row) return null;
    const k = String(key);
    let val = row[k];
    if (val === undefined) val = row[k.toUpperCase()];
    if (val === undefined) val = row[k.toLowerCase()];
    return val;
  },

  formatCell(value, col) {
    if (col?.type === 'date') {
      return this.escapeHtml(documentosFormatDateDdMmYyyy(value));
    }
    if (col?.type === 'status') {
      const s = String(value ?? '').trim() || '—';
      return `<span class="documentos-status badge text-bg-light border">${this.escapeHtml(s)}</span>`;
    }
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'money') {
      return `<span class="documentos-money">${this.escapeHtml(this.formatMoney(value))}</span>`;
    }
    return this.escapeHtml(value);
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColumns.length;
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún documento coincide con la búsqueda'
        : 'Sin documentos para el periodo y tipo seleccionados';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = this.tableColumns
          .map((c) => {
            const align = c.type === 'money' ? ' text-end' : '';
            const extra = c.cellClass ? ` ${c.cellClass}` : '';
            const val = this.cellValue(row, c.key);
            return `<td class="${`${align}${extra}`.trim()}">${this.formatCell(val, c)}</td>`;
          })
          .join('');
        return `<tr>${cells}</tr>`;
      })
      .join('');
  },

  mesLabel(mes) {
    const found = DOCUMENTOS_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
  },

  tipodocLabel() {
    const found = this._tipos.find((t) => String(t.TIPODOC).toUpperCase() === String(this._tipodoc).toUpperCase());
    if (found) return `${found.TIPODOC} — ${found.ETIQUETA || found.TIPODOC}`;
    return this._tipodoc || '—';
  },

  badgeText() {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    const shown = this._rows.length;
    const total = this._totalCount;
    let countLabel;
    if (this._listTruncated && shown < total) {
      countLabel = `Mostrando ${shown} de ${total}`;
    } else {
      countLabel = `${total}`;
    }
    return `<i class="fa-solid fa-file-lines me-1"></i>${countLabel} documento(s) — ${this.mesLabel(this._mes)} ${this._anio} · ${this.escapeHtml(this.tipodocLabel())}${this.escapeHtml(extra)}`;
  },

  renderFiltersCard() {
    const mesOpts = DOCUMENTOS_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = DOCUMENTOS_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');
    const tipoOpts = this._tipos
      .map((t) => {
        const code = String(t.TIPODOC || '').toUpperCase();
        const label = t.ETIQUETA ? `${code} — ${t.ETIQUETA}` : code;
        return `<option value="${this.escapeHtml(code)}"${this._tipodoc === code ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
      })
      .join('');

    return `
      <div class="card documentos-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 documentos-filters-row">
            <div class="documentos-filter-mes">
              <label for="documentos-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="documentos-mes">
                ${mesOpts}
              </select>
            </div>
            <div class="documentos-filter-anio">
              <label for="documentos-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="documentos-anio">
                ${anioOpts}
              </select>
            </div>
            <div class="documentos-filter-tipodoc">
              <label for="documentos-tipodoc" class="form-label small mb-1">Tipo documento</label>
              <select class="form-select form-select-sm" id="documentos-tipodoc">
                ${tipoOpts || '<option value="">Sin tipos</option>'}
              </select>
            </div>
            <div class="documentos-filter-search flex-grow-1">
              <label for="documentos-search" class="form-label small mb-1">Buscar</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="documentos-search"
                  placeholder="Correlativo, cliente, negocio, vendedor, estado…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
                <button type="button" class="btn btn-outline-secondary" id="btn-documentos-search-clear"
                  title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            </div>
          </div>
          <div class="documentos-badge small text-muted mt-2" id="documentos-count">${this.badgeText()}</div>
        </div>
      </div>
    `;
  },

  renderTableCard() {
    const headers = this.tableColumns
      .map((c) => {
        const align = c.type === 'money' ? ' text-end' : '';
        const extra = c.cellClass ? ` ${c.cellClass}` : '';
        return `<th scope="col" class="${`${align}${extra}`.trim()}">${this.escapeHtml(c.label)}</th>`;
      })
      .join('');
    return `
      <div class="card documentos-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>${headers}</tr>
            </thead>
            <tbody id="documentos-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="documentos-vista-wrap">
        ${this.renderFiltersCard()}
        ${this.renderTableCard()}
      </div>
    `;
  },

  syncFiltersFromUi() {
    const mesEl = document.getElementById('documentos-mes');
    const anioEl = document.getElementById('documentos-anio');
    const searchEl = document.getElementById('documentos-search');
    const tipodocEl = document.getElementById('documentos-tipodoc');
    if (mesEl) this._mes = parseInt(mesEl.value, 10);
    if (anioEl) this._anio = parseInt(anioEl.value, 10);
    if (searchEl) this._filterQuery = searchEl.value;
    if (tipodocEl) this._tipodoc = String(tipodocEl.value || '').trim().toUpperCase();
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#documentos-tbody');
    const badge = this._container?.querySelector('#documentos-count');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    if (badge) badge.innerHTML = this.badgeText();
  },

  async fetchTipos() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/documentos/tipos?${params}`);
    this._tipos = data.rows || [];
    if (!this._tipodoc && this._tipos.length) {
      const fac = this._tipos.find((t) => String(t.TIPODOC).toUpperCase() === 'FAC');
      this._tipodoc = String((fac || this._tipos[0]).TIPODOC).toUpperCase();
    }
  },

  async fetchData() {
    if (!this._tipodoc) {
      this._rows = [];
      this._totalCount = 0;
      this._listTruncated = false;
      return null;
    }
    const data = await F.fetchJson(this.apiUrlLista(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    this._mes = data.mes ?? this._mes;
    this._anio = data.anio ?? this._anio;
    this._tipodoc = data.tipodoc ?? this._tipodoc;
    return data;
  },

  bindSearch() {
    const search = document.getElementById('documentos-search');
    const clearBtn = document.getElementById('btn-documentos-search-clear');
    if (!search) return;
    const applySearch = F.debounce(() => {
      this._filterQuery = search.value;
      this.reload();
    }, 350);
    search.addEventListener('input', applySearch);
    search.addEventListener('search', applySearch);
    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.reload();
      search.focus();
    });
  },

  bindEvents() {
    const refresh = () => {
      this.syncFiltersFromUi();
      this.reload();
    };
    document.getElementById('documentos-mes')?.addEventListener('change', refresh);
    document.getElementById('documentos-anio')?.addEventListener('change', refresh);
    document.getElementById('documentos-tipodoc')?.addEventListener('change', refresh);
    this.bindSearch();
  },

  async reload() {
    if (!this._container || this._loading) return;
    this.syncFiltersFromUi();
    if (!this._tipodoc) {
      this.updateTableView();
      return;
    }
    this._loading = true;
    const tbody = this._container.querySelector('#documentos-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${this.tableColumns.length}" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    try {
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      this._rows = [];
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${this.tableColumns.length}" class="text-center text-danger py-4">${this.escapeHtml(err.message)}</td></tr>`;
      }
      F.toast('Error al cargar documentos', 'error');
    } finally {
      this._loading = false;
    }
  },

  async load(container) {
    this._container = container;
    this._filterQuery = '';
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>
      `;
      return;
    }

    const period = this.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando documentos…
      </div>
    `;

    try {
      await this.fetchTipos();
      container.innerHTML = this.render();
      this.bindEvents();
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          ${this.escapeHtml(err.message)}
        </div>
      `;
    }
  },
};
