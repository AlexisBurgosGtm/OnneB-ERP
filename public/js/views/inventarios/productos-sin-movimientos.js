/**
 * Productos sin ventas FAC/FEL en los últimos N meses.
 */
const ProductosSinMovimientosView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _filterMarca: '',
  _filterHabilitado: '',
  _filterMeses: 12,
  _marcas: [],
  _loading: false,
  _exporting: false,

  tableColumns: [
    { key: 'CODPROD', label: 'Código' },
    { key: 'DESPROD', label: 'Descripción', cellClass: 'inventario-col-desc' },
    { key: 'DESMARCA', label: 'Marca' },
    { key: 'EXISTENCIA', label: 'Existencia', type: 'qty' },
    { key: 'FISICO', label: 'Físico', type: 'qty' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'qty') {
      return `<span class="inventario-qty">${this.escapeHtml(this.formatQty(value))}</span>`;
    }
    return this.escapeHtml(value);
  },

  productoLabelFromRow(row) {
    const codprod = String(this.cellValue(row, 'CODPROD') || '').trim();
    const desc = String(this.cellValue(row, 'DESPROD') || '').trim();
    return desc ? `${codprod} — ${desc}` : codprod;
  },

  mesesOptionsHtml() {
    const sel = Number(this._filterMeses) || 12;
    return Array.from({ length: 36 }, (_, i) => {
      const n = i + 1;
      return `<option value="${n}"${n === sel ? ' selected' : ''}>${n}</option>`;
    }).join('');
  },

  badgeText() {
    const emp = F.getEmpNitNombre() || F.getEmpNit() || '';
    const extra = emp ? ` · ${emp}` : '';
    const mesLabel = `${this._filterMeses} mes(es)`;
    let countLabel = `${this._totalCount} producto(s) sin ventas FAC/FEL en ${mesLabel}`;
    if (this._listTruncated) {
      countLabel = `${this._rows.length} de ${this._totalCount} producto(s) (liste más con buscador)`;
    }
    return `<i class="fa-solid fa-box-open me-1"></i>${this.escapeHtml(countLabel)}${this.escapeHtml(extra)}`;
  },

  buildListParams(opts = {}) {
    const empNit = F.getEmpNit();
    const params = new URLSearchParams({ empnit: empNit || '', _: String(Date.now()) });
    params.set('meses', String(this._filterMeses || 12));
    if (this._filterQuery.trim()) params.set('q', this._filterQuery.trim());
    if (this._filterMarca) params.set('codmarca', this._filterMarca);
    if (this._filterHabilitado) params.set('habilitado', this._filterHabilitado);
    if (opts.limit != null) params.set('limit', String(opts.limit));
    return params;
  },

  apiUrlLista(opts) {
    return `/api/inventario/sin-movimientos?${this.buildListParams(opts).toString()}`;
  },

  exportUrl() {
    return `/api/inventario/sin-movimientos/export?${this.buildListParams().toString()}`;
  },

  renderMarcaOptions() {
    const opts = (this._marcas || [])
      .map((m) => {
        const val = String(m.CODMARCA);
        const label = m.DESMARCA || val;
        return `<option value="${this.escapeHtml(val)}"${this._filterMarca === val ? ' selected' : ''}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `<option value=""${!this._filterMarca ? ' selected' : ''}>TODAS</option>${opts}`;
  },

  renderTableBodyHtml(rows) {
    const cols = this.tableColumns;
    const colSpan = cols.length;
    if (!rows.length) {
      const msg =
        this._filterQuery.trim() || this._filterMarca || this._filterHabilitado
          ? 'Ningún producto coincide con los filtros'
          : `Ningún producto sin ventas en los últimos ${this._filterMeses} mes(es)`;
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const codprod = String(this.cellValue(row, 'CODPROD') || '').trim();
        const cells = cols
          .map((c) => {
            const align = c.type === 'qty' ? ' text-end' : '';
            const extra = c.cellClass ? ` ${c.cellClass}` : '';
            return `<td class="${`${align}${extra}`.trim()}">${this.formatCell(this.cellValue(row, c.key), c)}</td>`;
          })
          .join('');
        const attrs = codprod
          ? ` class="inventario-row-clickable" data-codprod="${this.escapeHtml(codprod)}" role="button" tabindex="0" title="Ver movimientos"`
          : '';
        return `<tr${attrs}>${cells}</tr>`;
      })
      .join('');
  },

  renderFiltersCard() {
    return `
      <div class="card relleno-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2 relleno-filters-row">
            <div class="relleno-filter-marca">
              <label for="psim-filter-meses" class="form-label small mb-1">Meses</label>
              <select class="form-select form-select-sm" id="psim-filter-meses">
                ${this.mesesOptionsHtml()}
              </select>
            </div>
            <div class="relleno-filter-marca">
              <label for="psim-filter-marca" class="form-label small mb-1">Marca</label>
              <select class="form-select form-select-sm" id="psim-filter-marca">
                ${this.renderMarcaOptions()}
              </select>
            </div>
            <div class="relleno-filter-habilitado">
              <label for="psim-filter-habilitado" class="form-label small mb-1">Habilitado</label>
              <select class="form-select form-select-sm" id="psim-filter-habilitado">
                <option value=""${!this._filterHabilitado ? ' selected' : ''}>TODOS</option>
                <option value="SI"${this._filterHabilitado === 'SI' ? ' selected' : ''}>SI</option>
                <option value="NO"${this._filterHabilitado === 'NO' ? ' selected' : ''}>NO</option>
              </select>
            </div>
            <div class="relleno-filter-search flex-grow-1">
              <label for="psim-search" class="form-label small mb-1">Buscar</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="psim-search"
                  placeholder="Código o descripción… (Enter)"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
                <button type="button" class="btn btn-outline-secondary" id="btn-psim-search-clear"
                  title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                  <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
              </div>
            </div>
            <div class="relleno-filter-export">
              <label class="form-label small mb-1 d-block relleno-export-label" aria-hidden="true">&nbsp;</label>
              <button type="button" class="btn btn-sm btn-outline-success" id="btn-psim-export">
                <i class="fa-solid fa-file-excel me-1" aria-hidden="true"></i>Exportar (xlsx)
              </button>
            </div>
          </div>
          <p class="small text-muted mb-0 mt-2">
            Productos sin líneas de venta en documentos <strong>FAC</strong> o <strong>FEL</strong> (factura electrónica, no anulados)
            en el periodo seleccionado.
          </p>
          <div class="inventario-badge small text-muted mt-2" id="psim-count">${this.badgeText()}</div>
        </div>
      </div>
    `;
  },

  renderTableCard() {
    const headers = this.tableColumns
      .map((c) => {
        const align = c.type === 'qty' ? ' text-end' : '';
        const extra = c.cellClass ? ` ${c.cellClass}` : '';
        return `<th scope="col" class="${`${align}${extra}`.trim()}">${this.escapeHtml(c.label)}</th>`;
      })
      .join('');
    return `
      <div class="card inventario-table-card shadow-sm">
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>${headers}</tr>
            </thead>
            <tbody id="psim-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="inventario-vista-wrap psim-vista-wrap w-100">
        ${this.renderFiltersCard()}
        ${this.renderTableCard()}
      </div>
    `;
  },

  syncFiltersFromUi() {
    const mesesEl = document.getElementById('psim-filter-meses');
    const marcaEl = document.getElementById('psim-filter-marca');
    const habilitadoEl = document.getElementById('psim-filter-habilitado');
    if (mesesEl) this._filterMeses = parseInt(mesesEl.value, 10) || 12;
    if (marcaEl) this._filterMarca = marcaEl.value;
    if (habilitadoEl) this._filterHabilitado = habilitadoEl.value;
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#psim-tbody');
    const badge = this._container?.querySelector('#psim-count');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    if (badge) badge.innerHTML = this.badgeText();
  },

  async fetchData() {
    const data = await F.fetchJson(this.apiUrlLista(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    if (data.meses) this._filterMeses = Number(data.meses) || this._filterMeses;
    return data;
  },

  async fetchMarcas() {
    const empNit = F.getEmpNit();
    if (!empNit) {
      this._marcas = [];
      return;
    }
    const params = new URLSearchParams({ empnit: empNit, _: String(Date.now()) });
    const data = await F.fetchJson(`/api/marcas?${params.toString()}`, { cache: 'no-store' });
    this._marcas = data.rows || [];
  },

  bindMesesFilter() {
    document.getElementById('psim-filter-meses')?.addEventListener('change', (e) => {
      this._filterMeses = parseInt(e.target.value, 10) || 12;
      this.reload();
    });
  },

  bindMarcaFilter() {
    document.getElementById('psim-filter-marca')?.addEventListener('change', (e) => {
      this._filterMarca = e.target.value;
      this.reload();
    });
  },

  bindHabilitadoFilter() {
    document.getElementById('psim-filter-habilitado')?.addEventListener('change', (e) => {
      this._filterHabilitado = e.target.value;
      this.reload();
    });
  },

  bindSearch() {
    const search = document.getElementById('psim-search');
    const clearBtn = document.getElementById('btn-psim-search-clear');
    if (!search) return;

    const applySearch = () => {
      this._filterQuery = search.value.trim();
      this.reload();
    };

    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applySearch();
      }
    });

    search.addEventListener('search', () => {
      if (!search.value.trim()) {
        this._filterQuery = '';
        this.reload();
      }
    });

    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.reload();
      search.focus();
    });
  },

  bindTableRows() {
    const tbody = this._container?.querySelector('#psim-tbody');
    if (!tbody || tbody.dataset.rowClickBound === '1') return;
    tbody.dataset.rowClickBound = '1';

    const openMovimientos = async (tr) => {
      const codprod = tr.getAttribute('data-codprod');
      if (!codprod || typeof ProductosView?.showReporteMovimientos !== 'function') return;
      const row = this._rows.find((r) => String(this.cellValue(r, 'CODPROD')).trim() === codprod);
      const label = row ? this.productoLabelFromRow(row) : codprod;
      try {
        await ProductosView.showReporteMovimientos(codprod, { label });
      } catch (err) {
        F.toast(err.message || 'Error al cargar movimientos', 'error');
      }
    };

    tbody.addEventListener('click', (e) => {
      const tr = e.target.closest('tr.inventario-row-clickable');
      if (!tr || !tbody.contains(tr)) return;
      openMovimientos(tr).catch(() => {});
    });

    tbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.inventario-row-clickable');
      if (!tr || !tbody.contains(tr)) return;
      e.preventDefault();
      openMovimientos(tr).catch(() => {});
    });
  },

  bindEvents() {
    this.bindMesesFilter();
    this.bindMarcaFilter();
    this.bindHabilitadoFilter();
    this.bindSearch();
    this.bindTableRows();
    document.getElementById('btn-psim-export')?.addEventListener('click', () => {
      this.onExportExcel();
    });
  },

  async onExportExcel() {
    if (this._exporting) return;
    const empNit = F.getEmpNit();
    if (!empNit) {
      F.toast('No hay empresa activa en la sesión', 'warning');
      return;
    }
    this.syncFiltersFromUi();
    const btn = document.getElementById('btn-psim-export');
    this._exporting = true;
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(this.exportUrl(), { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `productos_sin_movimientos_${empNit}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      F.toast('Exportación descargada', 'success');
    } catch (err) {
      F.toast(err.message || 'Error al exportar', 'error');
    } finally {
      this._exporting = false;
      if (btn) btn.disabled = false;
    }
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    try {
      await this.fetchData();
      this.updateTableView();
    } catch (err) {
      F.toast(err.message || 'Error al cargar productos', 'error');
    } finally {
      this._loading = false;
    }
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando productos sin movimientos…
      </div>
    `;
    try {
      await this.fetchMarcas();
      await this.fetchData();
      container.innerHTML = this.render();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          ${this.escapeHtml(err.message || 'Error al cargar la vista')}
        </div>
      `;
    }
  },
};
