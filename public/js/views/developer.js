/**
 * Vista Developer / Inicio — documentos FAC por mes/año.
 */
const DEVELOPER_MESES = [
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

const DEVELOPER_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  DEVELOPER_ANIOS.push({ value: y, label: String(y) });
}

const DEVELOPER_CONCRE_OPTIONS = [
  { value: '', label: 'TODOS' },
  { value: 'CON', label: 'CONTADO' },
  { value: 'CRE', label: 'CREDITO' },
];

function developerFormatDateDdMmYyyy(value) {
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

const DeveloperView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _filterConcre: '',
  _mes: null,
  _anio: null,
  _loading: false,
  _exporting: false,

  tableColumns: [
    { key: 'CODEMBARQUE', label: 'Cod. embarque' },
    { key: 'VENDEDOR', label: 'Vendedor', cellClass: 'developer-col-vendedor' },
    { key: 'FECHA_EMBARQUE', label: 'Fecha embarque', type: 'date' },
    { key: 'FECHA', label: 'Fecha doc.', type: 'date' },
    { key: 'CODDOC', label: 'Cod. doc.' },
    { key: 'CORRELATIVO', label: 'Correlativo' },
    { key: 'NEGOCIO', label: 'Negocio' },
    { key: 'NOMBRECLIENTE', label: 'Nombre cliente' },
    { key: 'DIRCLIENTE', label: 'Dirección' },
    { key: 'TOTALPRECIO', label: 'Total', type: 'money' },
  ],

  tableColSpan() {
    return this.tableColumns.length + 1;
  },

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
    });
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    if (this._filterConcre) params.set('concre', this._filterConcre);
    return params;
  },

  apiUrl() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    }
    const params = this.buildListParams();
    params.set('_', String(Date.now()));
    return `/api/developer/documentos-fac?${params.toString()}`;
  },

  exportUrl() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    }
    const params = this.buildListParams();
    params.set('_', String(Date.now()));
    return `/api/developer/documentos-fac/export?${params.toString()}`;
  },

  normalizeConcre(value) {
    const s = String(value || '').trim().toUpperCase();
    return s === 'CRE' ? 'CRE' : 'CON';
  },

  toggleConcreValue(current) {
    return this.normalizeConcre(current) === 'CON' ? 'CRE' : 'CON';
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
      return this.escapeHtml(developerFormatDateDdMmYyyy(value));
    }
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'money') {
      return `<span class="developer-money">${this.escapeHtml(this.formatMoney(value))}</span>`;
    }
    return this.escapeHtml(value);
  },

  renderConcreButton(row) {
    const coddoc = this.cellValue(row, 'CODDOC');
    const correlativo = this.cellValue(row, 'CORRELATIVO');
    const concre = this.normalizeConcre(this.cellValue(row, 'CONCRE'));
    const cls =
      concre === 'CRE' ? 'btn-developer-concre btn-developer-cre' : 'btn-developer-concre btn-developer-con';
    return `<button type="button" class="btn btn-sm ${cls}"
      data-action="toggle-concre"
      data-coddoc="${this.escapeHtml(coddoc)}"
      data-correlativo="${this.escapeHtml(correlativo)}"
      data-concre="${concre}"
      title="Cambiar entre contado y crédito">${concre}</button>`;
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColSpan();
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún documento coincide con la búsqueda'
        : 'Sin documentos para el periodo seleccionado';
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
        const pagoCell = `<td class="developer-col-pago">${this.renderConcreButton(row)}</td>`;
        return `<tr>${cells}${pagoCell}</tr>`;
      })
      .join('');
  },

  mesLabel(mes) {
    const found = DEVELOPER_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
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
    return `<i class="fa-solid fa-code me-1"></i>${countLabel} documento(s) — ${this.mesLabel(this._mes)} ${this._anio}${this.escapeHtml(extra)}`;
  },

  renderFiltersCard() {
    const mesOpts = DEVELOPER_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = DEVELOPER_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');
    const concreOpts = DEVELOPER_CONCRE_OPTIONS.map(
      (o) =>
        `<option value="${o.value}"${this._filterConcre === o.value ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');

    return `
      <div class="card developer-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 developer-filters-row">
            <div class="developer-filter-mes">
              <label for="developer-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="developer-mes">
                ${mesOpts}
              </select>
            </div>
            <div class="developer-filter-anio">
              <label for="developer-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="developer-anio">
                ${anioOpts}
              </select>
            </div>
            <div class="developer-filter-concre">
              <label for="developer-concre" class="form-label small mb-1">Pago</label>
              <select class="form-select form-select-sm" id="developer-concre">
                ${concreOpts}
              </select>
            </div>
            <div class="developer-filter-search flex-grow-1">
              <label for="developer-search" class="form-label small mb-1">Buscar</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="developer-search"
                  placeholder="Correlativo, vendedor, cliente, negocio, dirección…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
                <button type="button" class="btn btn-outline-secondary" id="btn-developer-search-clear"
                  title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="developer-filter-actions pb-1">
              <button type="button" class="btn btn-sm btn-outline-success" id="btn-developer-export">
                <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
              </button>
            </div>
          </div>
          <div class="developer-badge small text-muted mt-2" id="developer-count">${this.badgeText()}</div>
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
      <div class="card developer-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>${headers}<th scope="col" class="developer-col-pago">Pago</th></tr>
            </thead>
            <tbody id="developer-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="developer-vista-wrap">
        ${this.renderFiltersCard()}
        ${this.renderTableCard()}
      </div>
    `;
  },

  syncPeriodFromUi() {
    const mesEl = document.getElementById('developer-mes');
    const anioEl = document.getElementById('developer-anio');
    const searchEl = document.getElementById('developer-search');
    const concreEl = document.getElementById('developer-concre');
    if (mesEl) this._mes = parseInt(mesEl.value, 10);
    if (anioEl) this._anio = parseInt(anioEl.value, 10);
    if (searchEl) this._filterQuery = searchEl.value;
    if (concreEl) this._filterConcre = concreEl.value;
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#developer-tbody');
    const badge = this._container?.querySelector('#developer-count');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    if (badge) badge.innerHTML = this.badgeText();
  },

  findRowIndex(coddoc, correlativo) {
    const cod = String(coddoc ?? '').trim();
    const corr = Number(correlativo);
    return this._rows.findIndex(
      (r) =>
        String(this.cellValue(r, 'CODDOC') ?? '').trim() === cod &&
        Number(this.cellValue(r, 'CORRELATIVO')) === corr
    );
  },

  async fetchData() {
    const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    this._mes = data.mes ?? this._mes;
    this._anio = data.anio ?? this._anio;
    return data;
  },

  async onExportExcel() {
    if (this._exporting) return;
    this.syncPeriodFromUi();
    const btn = document.getElementById('btn-developer-export');
    this._exporting = true;
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(this.exportUrl(), { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : `documentos_fac_${F.getEmpNit()}.xlsx`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      F.toast('Excel exportado', 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    } finally {
      this._exporting = false;
      if (btn) btn.disabled = false;
    }
  },

  async onToggleConcre(btn) {
    const coddoc = btn.getAttribute('data-coddoc');
    const correlativo = parseInt(btn.getAttribute('data-correlativo'), 10);
    const current = btn.getAttribute('data-concre');
    const next = this.toggleConcreValue(current);
    const empNit = F.getEmpNit();
    if (!empNit || !coddoc || Number.isNaN(correlativo)) return;

    btn.disabled = true;
    try {
      await F.fetchJson(`/api/developer/documentos-fac/concre?empnit=${encodeURIComponent(empNit)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          CODDOC: coddoc,
          CORRELATIVO: correlativo,
          CONCRE: next,
        }),
      });
      const idx = this.findRowIndex(coddoc, correlativo);
      if (idx >= 0) {
        this._rows[idx].CONCRE = next;
      }
      btn.setAttribute('data-concre', next);
      btn.textContent = next;
      btn.classList.remove('btn-developer-con', 'btn-developer-cre');
      btn.classList.add(next === 'CRE' ? 'btn-developer-cre' : 'btn-developer-con');
      F.toast(`Pago actualizado a ${next}`, 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  },

  bindSearch() {
    const search = document.getElementById('developer-search');
    const clearBtn = document.getElementById('btn-developer-search-clear');
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

  bindRowActions() {
    const tbody = this._container?.querySelector('#developer-tbody');
    if (!tbody) return;
    tbody.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="toggle-concre"]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      this.onToggleConcre(btn);
    });
  },

  bindEvents() {
    const refreshPeriod = () => {
      this.syncPeriodFromUi();
      this.reload();
    };
    document.getElementById('btn-developer-export')?.addEventListener('click', () => this.onExportExcel());
    document.getElementById('developer-mes')?.addEventListener('change', refreshPeriod);
    document.getElementById('developer-anio')?.addEventListener('change', refreshPeriod);
    document.getElementById('developer-concre')?.addEventListener('change', refreshPeriod);
    this.bindSearch();
    this.bindRowActions();
  },

  async reload() {
    if (!this._container || this._loading) return;
    this._loading = true;
    this.syncPeriodFromUi();
    const tbody = this._container.querySelector('#developer-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${this.tableColSpan()}" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    try {
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      this._rows = [];
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="${this.tableColSpan()}" class="text-center text-danger py-4">${this.escapeHtml(err.message)}</td></tr>`;
      }
      F.toast('Error al cargar documentos', 'error');
    } finally {
      this._loading = false;
    }
  },

  async load(container) {
    this._container = container;
    this._filterQuery = '';
    this._filterConcre = '';
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
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…
      </div>
    `;

    try {
      await this.fetchData();
      container.innerHTML = this.render();
      this.bindEvents();
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

