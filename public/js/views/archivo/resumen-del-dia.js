/**
 * Archivo → Resumen del día
 * Calendario + lista de productos netos del día (filtro por clasificación y texto).
 */
const ResumenDelDiaView = {
  _container: null,
  _calYear: null,
  _calMonth: null,
  /** @type {'calendario'|'detalle'} */
  _screen: 'calendario',
  _selectedFecha: null,
  _data: null,
  _loading: false,
  _filterClase: '',
  _filterConcre: '',
  _filterQ: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  },

  formatQty(n) {
    const v = Number(n) || 0;
    return v.toLocaleString('es-GT', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    });
  },

  formatFechaLabel(iso) {
    const s = String(iso || '').slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s || '—';
    return `${m[3]}-${m[2]}-${m[1]}`;
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  initCalMonth() {
    const d = new Date();
    if (this._calYear == null) {
      this._calYear = d.getFullYear();
      this._calMonth = d.getMonth();
    }
  },

  monthNames() {
    return [
      'Enero',
      'Febrero',
      'Marzo',
      'Abril',
      'Mayo',
      'Junio',
      'Julio',
      'Agosto',
      'Septiembre',
      'Octubre',
      'Noviembre',
      'Diciembre',
    ];
  },

  monthLabel(year, monthIndex) {
    return `${this.monthNames()[monthIndex]} ${year}`;
  },

  async load(container) {
    this._container = container;
    this._screen = 'calendario';
    this._selectedFecha = null;
    this._data = null;
    this._filterClase = '';
    this._filterConcre = '';
    this._filterQ = '';
    this.initCalMonth();
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    this.render();
  },

  apiUrl(fecha) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({
      empnit: emp,
      fecha: String(fecha).slice(0, 10),
      _: String(Date.now()),
    });
    return `/api/resumen-del-dia?${params}`;
  },

  allRows() {
    return this._data?.rows || [];
  },

  amountsForFilter(r) {
    const mode = String(this._filterConcre || '').trim().toUpperCase();
    if (mode === 'CON') {
      return {
        totalunidades: Number(r.totalunidadesCon) || 0,
        totalprecio: Number(r.totalprecioCon) || 0,
      };
    }
    if (mode === 'CRE') {
      return {
        totalunidades: Number(r.totalunidadesCre) || 0,
        totalprecio: Number(r.totalprecioCre) || 0,
      };
    }
    return {
      totalunidades: Number(r.totalunidades) || 0,
      totalprecio: Number(r.totalprecio) || 0,
    };
  },

  filteredRows() {
    const clase = String(this._filterClase ?? '').trim();
    const q = String(this._filterQ ?? '').trim().toLowerCase();
    const mode = String(this._filterConcre || '').trim().toUpperCase();
    return this.allRows()
      .filter((r) => {
        if (clase !== '' && String(r.CODCLATRES) !== clase) return false;
        if (q && !String(r.desprod ?? '').toLowerCase().includes(q)) return false;
        if (mode === 'CON' || mode === 'CRE') {
          const amt = this.amountsForFilter(r);
          return Math.abs(amt.totalunidades) > 0.0001 || Math.abs(amt.totalprecio) > 0.0001;
        }
        return true;
      })
      .map((r) => ({ ...r, ...this.amountsForFilter(r) }));
  },

  filteredTotales(rows) {
    return rows.reduce(
      (acc, r) => {
        acc.productos += 1;
        acc.totalunidades += Number(r.totalunidades) || 0;
        acc.totalprecio += Number(r.totalprecio) || 0;
        return acc;
      },
      { productos: 0, totalunidades: 0, totalprecio: 0 }
    );
  },

  async openDay(iso) {
    if (this._loading) return;
    this._selectedFecha = iso;
    this._screen = 'detalle';
    this._filterClase = '';
    this._filterConcre = '';
    this._filterQ = '';
    this._loading = true;
    this._data = null;
    this.render();
    try {
      this._data = await F.fetchJson(this.apiUrl(iso), { cache: 'no-store' });
    } catch (err) {
      F.toast(err.message || 'No se pudo cargar el resumen', 'error');
      this._screen = 'calendario';
      this._selectedFecha = null;
    } finally {
      this._loading = false;
      this.render();
    }
  },

  backToCalendar() {
    this._screen = 'calendario';
    this._selectedFecha = null;
    this._data = null;
    this._filterClase = '';
    this._filterConcre = '';
    this._filterQ = '';
    this.render();
  },

  render() {
    if (!this._container) return;
    this._container.innerHTML = `
      <div class="resumen-dia-wrap w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Resumen del día</h2>
            <p class="text-muted small mb-0">
              Ventas (FAC, FEF, FEC, FES) menos devoluciones (DEV, FNC, FNA).
            </p>
          </div>
          ${
            this._screen === 'detalle'
              ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="resumen-dia-volver">
                   <i class="fa-solid fa-arrow-left me-1" aria-hidden="true"></i> Calendario
                 </button>`
              : ''
          }
        </div>
        ${this._screen === 'detalle' ? this.renderDetalleHtml() : this.renderCalendarHtml()}
      </div>
    `;
    this.bindEvents();
  },

  renderCalendarHtml() {
    this.initCalMonth();
    const year = this._calYear;
    const month = this._calMonth;
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startWeekday = firstDay.getDay();
    startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;
    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const today = this.todayIsoDate();
    let cells = '';

    for (let i = 0; i < startWeekday; i += 1) {
      cells += '<div class="cxp-cal-cell cxp-cal-cell--muted"></div>';
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const isToday = iso === today;
      const isFuture = iso > today;
      const cls = [
        'cxp-cal-cell',
        isToday ? 'cxp-cal-cell--today' : '',
        !isFuture ? 'cxp-cal-cell--clickable resumen-dia-cal-day' : 'cxp-cal-cell--muted',
      ]
        .filter(Boolean)
        .join(' ');
      cells += `
        <div class="${cls}" data-cal-date="${iso}"${!isFuture ? ' role="button" tabindex="0"' : ''}>
          <div class="cxp-cal-day">${day}</div>
          ${isToday ? '<div class="cxp-cal-meta"><span class="cxp-cal-count">Hoy</span></div>' : ''}
        </div>`;
    }

    const totalCells = startWeekday + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < trailing; i += 1) {
      cells += '<div class="cxp-cal-cell cxp-cal-cell--muted"></div>';
    }

    return `
      <div class="cxp-cal-wrap card shadow-sm">
        <div class="card-body">
          <div class="cxp-cal-toolbar d-flex align-items-center justify-content-between gap-2 mb-3">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="resumen-dia-cal-prev" title="Mes anterior">
              <i class="fa-solid fa-chevron-left"></i>
            </button>
            <h3 class="h6 mb-0 fw-semibold text-center flex-grow-1">${this.escapeHtml(
              this.monthLabel(year, month)
            )}</h3>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="resumen-dia-cal-next" title="Mes siguiente">
              <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
          <div class="cxp-cal-grid">
            ${weekDays.map((d) => `<div class="cxp-cal-weekday">${d}</div>`).join('')}
            ${cells}
          </div>
          <p class="small text-muted mt-3 mb-0">Seleccione un día para ver el resumen de productos.</p>
        </div>
      </div>`;
  },

  renderDetalleHtml() {
    if (this._loading) {
      return `<div class="text-muted small py-4 text-center">Cargando resumen del ${this.escapeHtml(
        this.formatFechaLabel(this._selectedFecha)
      )}…</div>`;
    }
    const data = this._data;
    if (!data) {
      return `<div class="alert alert-warning mb-0">No hay datos para mostrar.</div>`;
    }
    const clases = data.clasificaciones || [];
    const claseOpts = [
      `<option value="">Todas las clasificaciones</option>`,
      ...clases.map((c) => {
        const val = String(c.CODCLATRES);
        const sel = String(this._filterClase) === val ? ' selected' : '';
        return `<option value="${this.escapeHtml(val)}"${sel}>${this.escapeHtml(c.DESCLATRES)}</option>`;
      }),
    ].join('');
    const filtered = this.filteredRows();
    const tot = this.filteredTotales(filtered);

    return `
      <div class="resumen-dia-detalle">
        <div class="resumen-dia-summary d-flex flex-wrap gap-2 mb-3">
          <div class="card shadow-sm flex-grow-1">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Fecha</div>
              <div class="fw-semibold">${this.escapeHtml(this.formatFechaLabel(data.fecha))}</div>
            </div>
          </div>
          <div class="card shadow-sm flex-grow-1">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Productos</div>
              <div class="fw-semibold" id="resumen-dia-tot-productos">${tot.productos}</div>
            </div>
          </div>
          <div class="card shadow-sm flex-grow-1">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Total unidades</div>
              <div class="fw-semibold" id="resumen-dia-tot-unidades">${this.escapeHtml(
                this.formatQty(tot.totalunidades)
              )}</div>
            </div>
          </div>
          <div class="card shadow-sm flex-grow-1">
            <div class="card-body py-2 px-3">
              <div class="small text-muted">Total precio</div>
              <div class="fw-semibold text-primary" id="resumen-dia-tot-precio">${this.escapeHtml(
                this.formatMoney(tot.totalprecio)
              )}</div>
            </div>
          </div>
        </div>

        <div class="resumen-dia-filters row g-2 align-items-end mb-3">
          <div class="col-md-4 col-lg-3">
            <label class="form-label small mb-1" for="resumen-dia-filtro-clase">Clasificación</label>
            <select class="form-select form-select-sm" id="resumen-dia-filtro-clase">${claseOpts}</select>
          </div>
          <div class="col-md-3 col-lg-3">
            <label class="form-label small mb-1" for="resumen-dia-filtro-concre">Forma de pago</label>
            <select class="form-select form-select-sm" id="resumen-dia-filtro-concre">
              <option value=""${this._filterConcre === '' ? ' selected' : ''}>TODOS</option>
              <option value="CON"${this._filterConcre === 'CON' ? ' selected' : ''}>CONTADO</option>
              <option value="CRE"${this._filterConcre === 'CRE' ? ' selected' : ''}>CREDITO</option>
            </select>
          </div>
          <div class="col-md-5 col-lg-6">
            <label class="form-label small mb-1" for="resumen-dia-filtro-q">Buscar</label>
            <input type="search" class="form-control form-control-sm" id="resumen-dia-filtro-q"
              placeholder="Buscar por descripción…"
              value="${this.escapeHtml(this._filterQ)}">
          </div>
        </div>

        <div class="card shadow-sm">
          <div class="table-responsive">
            <table class="table table-sm table-striped table-hover mb-0 resumen-dia-table">
              <thead class="table-light sticky-top">
                <tr>
                  <th>Clasificación</th>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th class="text-end">Total unidades</th>
                  <th class="text-end">Total precio</th>
                </tr>
              </thead>
              <tbody id="resumen-dia-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
              <tfoot class="table-light">
                <tr>
                  <td colspan="3" class="text-end fw-semibold">Totales (filtro)</td>
                  <td class="text-end fw-semibold" id="resumen-dia-foot-unidades">${this.escapeHtml(
                    this.formatQty(tot.totalunidades)
                  )}</td>
                  <td class="text-end fw-semibold" id="resumen-dia-foot-precio">${this.escapeHtml(
                    this.formatMoney(tot.totalprecio)
                  )}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      return `<tr><td colspan="5" class="text-muted text-center py-3">Sin productos para el filtro actual.</td></tr>`;
    }
    return rows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.DESCLATRES || 'Sin clase tres')}</td>
        <td class="font-monospace">${this.escapeHtml(r.codigo)}</td>
        <td>${this.escapeHtml(r.desprod || '—')}</td>
        <td class="text-end">${this.escapeHtml(this.formatQty(r.totalunidades))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.totalprecio))}</td>
      </tr>`
      )
      .join('');
  },

  refreshFilteredTable() {
    const filtered = this.filteredRows();
    const tot = this.filteredTotales(filtered);
    const tbody = this._container?.querySelector('#resumen-dia-tbody');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(filtered);
    const setText = (id, text) => {
      const el = this._container?.querySelector(id);
      if (el) el.textContent = text;
    };
    setText('#resumen-dia-tot-productos', String(tot.productos));
    setText('#resumen-dia-tot-unidades', this.formatQty(tot.totalunidades));
    setText('#resumen-dia-tot-precio', this.formatMoney(tot.totalprecio));
    setText('#resumen-dia-foot-unidades', this.formatQty(tot.totalunidades));
    setText('#resumen-dia-foot-precio', this.formatMoney(tot.totalprecio));
  },

  bindEvents() {
    this._container?.querySelector('#resumen-dia-volver')?.addEventListener('click', () => {
      this.backToCalendar();
    });

    this._container?.querySelector('#resumen-dia-cal-prev')?.addEventListener('click', () => {
      this.initCalMonth();
      this._calMonth -= 1;
      if (this._calMonth < 0) {
        this._calMonth = 11;
        this._calYear -= 1;
      }
      this.render();
    });

    this._container?.querySelector('#resumen-dia-cal-next')?.addEventListener('click', () => {
      this.initCalMonth();
      this._calMonth += 1;
      if (this._calMonth > 11) {
        this._calMonth = 0;
        this._calYear += 1;
      }
      this.render();
    });

    this._container?.querySelectorAll('.resumen-dia-cal-day[data-cal-date]').forEach((el) => {
      const open = () => this.openDay(el.dataset.calDate);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });

    const claseEl = this._container?.querySelector('#resumen-dia-filtro-clase');
    claseEl?.addEventListener('change', () => {
      this._filterClase = claseEl.value || '';
      this.refreshFilteredTable();
    });

    const concreEl = this._container?.querySelector('#resumen-dia-filtro-concre');
    concreEl?.addEventListener('change', () => {
      this._filterConcre = String(concreEl.value || '').trim().toUpperCase();
      this.refreshFilteredTable();
    });

    const qEl = this._container?.querySelector('#resumen-dia-filtro-q');
    qEl?.addEventListener('input', () => {
      this._filterQ = qEl.value || '';
      this.refreshFilteredTable();
    });
  },
};
