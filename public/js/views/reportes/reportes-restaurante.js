/**
 * Reportes → Reportes de Restaurante
 */
const ReportesRestauranteView = {
  _container: null,
  _desde: '',
  _hasta: '',
  _loading: false,
  _resumen: null,
  _mesas: [],
  _serie: [],
  _selectedMesaId: null,
  _detalle: null,
  _chartGlobal: null,
  _chartMesa: null,
  _filterMesas: '',

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
    return { desde: `${y}-${m}-01`, hasta: hoy };
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
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

  formatPct(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return `${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })}%`;
  },

  utilidadOf(precio, costo) {
    return (Number(precio) || 0) - (Number(costo) || 0);
  },

  pctUtilidadSobreCosto(utilidad, costo) {
    const c = Number(costo) || 0;
    if (!(c > 0)) return 0;
    return ((Number(utilidad) || 0) / c) * 100;
  },

  formatHoraDoc(row) {
    const h = Number(row?.HORA);
    const m = Number(row?.MINUTO);
    if (!Number.isFinite(h)) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(h)}:${pad(Number.isFinite(m) ? m : 0)}`;
  },

  readDates() {
    const d = this._container?.querySelector('#represt-desde');
    const h = this._container?.querySelector('#represt-hasta');
    if (d) this._desde = String(d.value || '').trim();
    if (h) this._hasta = String(h.value || '').trim();
  },

  mesaLabel(m) {
    if (!m) return '—';
    const des = String(m.DESMESA || m.desmesa || '').trim();
    const cod = String(m.CODMESA || m.codmesa || '').trim();
    if (des && cod) return `${cod} — ${des}`;
    return des || cod || `Mesa ${m.MESA_ID ?? m.ID ?? ''}`;
  },

  filteredMesas() {
    const q = String(this._filterMesas || '').trim().toLowerCase();
    if (!q) return this._mesas;
    return this._mesas.filter((m) =>
      [m.CODMESA, m.DESMESA, m.MESA_ID, m.VENTAS_NETAS, m.NUM_FACTURAS]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ')
        .includes(q)
    );
  },

  async fetchResumen() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      desde: this._desde,
      hasta: this._hasta,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/reportes-restaurante?${params}`);
    this._resumen = data.resumen || null;
    this._mesas = data.mesas || [];
    this._serie = data.serie || [];
    return data;
  },

  async fetchDetalle(mesaId) {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      desde: this._desde,
      hasta: this._hasta,
      mesaId: String(mesaId),
      _: String(Date.now()),
    });
    this._detalle = await F.fetchJson(`/api/reportes-restaurante/detalle?${params}`);
    return this._detalle;
  },

  destroyCharts() {
    [this._chartGlobal, this._chartMesa].forEach((c) => {
      if (c) c.destroy();
    });
    this._chartGlobal = null;
    this._chartMesa = null;
  },

  buildLineChart(canvasId, serie, chartRef) {
    if (typeof Chart === 'undefined') return;
    const canvas = this._container?.querySelector(canvasId);
    if (!canvas || !serie?.length) return;
    if (chartRef === 'global' && this._chartGlobal) {
      this._chartGlobal.destroy();
      this._chartGlobal = null;
    }
    if (chartRef === 'mesa' && this._chartMesa) {
      this._chartMesa.destroy();
      this._chartMesa = null;
    }
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: serie.map((r) => this.formatFecha(r.FECHA)),
        datasets: [
          {
            label: 'Ventas',
            data: serie.map((r) => Number(r.VENTAS_NETAS) || 0),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            fill: true,
            tension: 0.3,
            yAxisID: 'yMoney',
          },
          {
            label: 'Facturas',
            data: serie.map((r) => Number(r.NUM_FACTURAS) || 0),
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            tension: 0.3,
            yAxisID: 'yCount',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          yMoney: {
            position: 'left',
            ticks: {
              callback: (v) =>
                Number(v).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }),
            },
          },
          yCount: { position: 'right', grid: { drawOnChartArea: false }, beginAtZero: true },
        },
      },
    });
    if (chartRef === 'global') this._chartGlobal = chart;
    else this._chartMesa = chart;
  },

  renderKpis() {
    const r = this._resumen || {};
    return `
      <div class="represt-kpi-grid">
        <div class="represt-kpi-card">
          <div class="represt-kpi-label">Comandas (CRS)</div>
          <div class="represt-kpi-value">${this.escapeHtml(r.comandas ?? 0)}</div>
        </div>
        <div class="represt-kpi-card">
          <div class="represt-kpi-label">Facturas restaurante</div>
          <div class="represt-kpi-value">${this.escapeHtml(r.facturas ?? 0)}</div>
        </div>
        <div class="represt-kpi-card">
          <div class="represt-kpi-label">Ventas netas</div>
          <div class="represt-kpi-value">${this.escapeHtml(this.formatMoney(r.ventasNetas))}</div>
        </div>
        <div class="represt-kpi-card represt-kpi-utilidad">
          <div class="represt-kpi-label">Utilidad</div>
          <div class="represt-kpi-value text-success">${this.escapeHtml(this.formatMoney(r.utilidad))}</div>
          <div class="represt-kpi-sub small text-muted">${this.escapeHtml(this.formatPct(r.pctUtilidad))} s/costo</div>
        </div>
        <div class="represt-kpi-card">
          <div class="represt-kpi-label">Ticket promedio</div>
          <div class="represt-kpi-value">${this.escapeHtml(this.formatMoney(r.ticketPromedio))}</div>
        </div>
        <div class="represt-kpi-card">
          <div class="represt-kpi-label">Clientes atendidos</div>
          <div class="represt-kpi-value">${this.escapeHtml(r.clientesAtendidos ?? 0)}</div>
        </div>
      </div>`;
  },

  renderMesaCards() {
    const rows = this.filteredMesas();
    if (!this._mesas.length) {
      return `<div class="represt-empty small">Sin ventas por mesa en el período</div>`;
    }
    if (!rows.length) {
      return `<div class="represt-empty small">Sin coincidencias</div>`;
    }
    return rows
      .map((m) => {
        const active = Number(m.MESA_ID) === Number(this._selectedMesaId) ? ' active' : '';
        return `
          <div class="represt-card${active}" data-mesa-id="${this.escapeHtml(m.MESA_ID)}">
            <div class="fw-semibold small">${this.escapeHtml(this.mesaLabel(m))}</div>
            <div class="d-flex justify-content-between small mt-1">
              <span class="text-muted">${this.escapeHtml(m.NUM_FACTURAS)} fact.</span>
              <span class="fw-semibold">${this.escapeHtml(this.formatMoney(m.VENTAS_NETAS))}</span>
            </div>
            <div class="small text-muted">Ticket prom. ${this.escapeHtml(this.formatMoney(m.TICKET_PROMEDIO))}
              · ${this.escapeHtml(m.CLIENTES)} cli.</div>
          </div>`;
      })
      .join('');
  },

  renderDetalle() {
    if (!this._selectedMesaId || !this._detalle) {
      return `
        <div class="represt-detail-panel">
          <div class="card shadow-sm">
            <div class="card-body py-2">
              <h3 class="h6 text-muted mb-2">Tendencia general</h3>
              <div class="represt-chart-wrap"><canvas id="represt-chart-global"></canvas></div>
              <p class="small text-muted mb-0">Seleccione una mesa para ver facturas y detalle.</p>
            </div>
          </div>
        </div>`;
    }
    const d = this._detalle;
    const docs = d.documentos || [];
    const prods = d.productos || [];
    const pt = d.productosTotales || {};
    return `
      <div class="represt-detail-panel">
        <div class="card shadow-sm">
          <div class="card-body py-2">
            <h3 class="h6 mb-1">${this.escapeHtml(this.mesaLabel(d.mesa))}</h3>
            <div class="small text-muted mb-2">
              ${this.escapeHtml(d.resumen?.facturas ?? 0)} facturas ·
              Ventas ${this.escapeHtml(this.formatMoney(d.resumen?.ventasNetas))} ·
              Ticket ${this.escapeHtml(this.formatMoney(d.resumen?.ticketPromedio))}
            </div>
            <div class="represt-chart-wrap"><canvas id="represt-chart-mesa"></canvas></div>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="card-header py-2 small fw-semibold">Facturas</div>
          <div class="card-body p-2">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Hora</th>
                <th>Documento</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              ${
                docs.length
                  ? docs
                      .map(
                        (r) => `
                <tr>
                  <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
                  <td class="text-nowrap">${this.escapeHtml(this.formatHoraDoc(r))}</td>
                  <td>${this.escapeHtml(r.TIPODOC || '')} ${this.escapeHtml(r.CODDOC || '')} #${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
                  <td class="small">${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
                  <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
                </tr>`
                      )
                      .join('')
                  : `<tr><td colspan="5" class="text-center text-muted py-3">Sin facturas</td></tr>`
              }
            </tbody>
          </table>
          </div>
        </div>
        <div class="card shadow-sm">
          <div class="card-header py-2 small fw-semibold">Productos vendidos (documentos operados)</div>
          <div class="card-body p-2">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light">
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th class="text-end">Unidades</th>
                <th class="text-end">Costo</th>
                <th class="text-end">Precio</th>
                <th class="text-end">Utilidad</th>
              </tr>
            </thead>
            <tbody>
              ${
                prods.length
                  ? prods
                      .map((p) => {
                        const util = p.UTILIDAD ?? this.utilidadOf(p.TOTALPRECIO, p.TOTALCOSTO);
                        return `
                <tr>
                  <td>${this.escapeHtml(p.CODPROD || '—')}</td>
                  <td class="small">${this.escapeHtml(p.DESPROD || '—')}</td>
                  <td class="text-end">${this.escapeHtml(this.formatQty(p.TOTALUNIDADES))}</td>
                  <td class="text-end">${this.escapeHtml(this.formatMoney(p.TOTALCOSTO))}</td>
                  <td class="text-end">${this.escapeHtml(this.formatMoney(p.TOTALPRECIO))}</td>
                  <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(util))}</td>
                </tr>`;
                      })
                      .join('')
                  : `<tr><td colspan="6" class="text-center text-muted py-2">Sin líneas de producto</td></tr>`
              }
            </tbody>
            ${
              prods.length
                ? `<tfoot class="table-light">
              <tr class="fw-semibold">
                <td colspan="2">Total</td>
                <td class="text-end">${this.escapeHtml(this.formatQty(pt.unidades))}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(pt.costo))}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(pt.precio))}</td>
                <td class="text-end">${this.escapeHtml(this.formatMoney(pt.utilidad ?? this.utilidadOf(pt.precio, pt.costo)))}</td>
              </tr>
            </tfoot>`
                : ''
            }
          </table>
          </div>
        </div>
      </div>`;
  },

  renderScreen() {
    const range = this.defaultRange();
    const desde = this._desde || range.desde;
    const hasta = this._hasta || range.hasta;
    return `
      <div class="represt-wrap w-100">
        <div class="represt-toolbar d-flex flex-wrap align-items-end gap-2 mb-2">
          <h2 class="h6 text-muted mb-0 me-auto fw-semibold">
            <i class="fa-solid fa-utensils me-1"></i>Reportes de Restaurante
          </h2>
          <div>
            <label class="form-label small mb-0" for="represt-desde">Desde</label>
            <input type="date" class="form-control form-control-sm" id="represt-desde" value="${this.escapeHtml(desde)}">
          </div>
          <div>
            <label class="form-label small mb-0" for="represt-hasta">Hasta</label>
            <input type="date" class="form-control form-control-sm" id="represt-hasta" value="${this.escapeHtml(hasta)}">
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="represt-refresh" ${this._loading ? 'disabled' : ''}>
            <i class="fa-solid fa-arrows-rotate me-1${this._loading ? ' fa-spin' : ''}"></i>Actualizar
          </button>
        </div>
        ${this.renderKpis()}
        <div class="represt-body">
          <div class="represt-list-col card shadow-sm">
            <div class="card-body py-2">
              <div class="small fw-semibold text-muted mb-1">Rendimiento por mesa</div>
              <input type="search" class="form-control form-control-sm mb-2" id="represt-filter-mesas"
                placeholder="Buscar mesa…" value="${this.escapeHtml(this._filterMesas)}">
              <div class="represt-list-scroll" id="represt-mesa-list">${this.renderMesaCards()}</div>
            </div>
          </div>
          <div id="represt-detail-wrap" class="represt-detail-wrap">${this.renderDetalle()}</div>
        </div>
      </div>`;
  },

  refreshPartial() {
    const grid = this._container?.querySelector('.represt-kpi-grid');
    if (grid) {
      const tmp = document.createElement('div');
      tmp.innerHTML = this.renderKpis();
      grid.replaceWith(tmp.firstElementChild);
    }
    const list = this._container?.querySelector('#represt-mesa-list');
    if (list) list.innerHTML = this.renderMesaCards();
    const detail = this._container?.querySelector('#represt-detail-wrap');
    if (detail) detail.innerHTML = this.renderDetalle();
    this.paintCharts();
  },

  paintCharts() {
    if (!this._selectedMesaId || !this._detalle) {
      this.buildLineChart('#represt-chart-global', this._serie, 'global');
    } else {
      this.buildLineChart('#represt-chart-mesa', this._detalle.serie || [], 'mesa');
    }
  },

  bindEvents() {
    if (!this._container) return;
    this._container.querySelector('#represt-refresh')?.addEventListener('click', () => {
      this.reload().catch((err) => F.alert('Error', err.message, 'error'));
    });
    this._container.querySelector('#represt-desde')?.addEventListener('change', () => this.readDates());
    this._container.querySelector('#represt-hasta')?.addEventListener('change', () => this.readDates());
    this._container.querySelector('#represt-filter-mesas')?.addEventListener('input', (ev) => {
      this._filterMesas = ev.target.value || '';
      const list = this._container.querySelector('#represt-mesa-list');
      if (list) list.innerHTML = this.renderMesaCards();
    });
    this._container.querySelector('#represt-mesa-list')?.addEventListener('click', (ev) => {
      const card = ev.target.closest('[data-mesa-id]');
      if (!card) return;
      const id = parseInt(card.getAttribute('data-mesa-id'), 10);
      if (!Number.isFinite(id)) return;
      this.selectMesa(id).catch((err) => F.alert('Error', err.message, 'error'));
    });
  },

  async selectMesa(mesaId) {
    this._selectedMesaId = mesaId;
    this.readDates();
    await this.fetchDetalle(mesaId);
    this.refreshPartial();
  },

  async reload() {
    this.readDates();
    this._loading = true;
    this.destroyCharts();
    try {
      await this.fetchResumen();
      if (this._selectedMesaId) {
        const still = this._mesas.some((m) => Number(m.MESA_ID) === Number(this._selectedMesaId));
        if (still) await this.fetchDetalle(this._selectedMesaId);
        else {
          this._selectedMesaId = null;
          this._detalle = null;
        }
      }
      this.refreshPartial();
    } finally {
      this._loading = false;
      const btn = this._container?.querySelector('#represt-refresh');
      if (btn) btn.disabled = false;
    }
  },

  async load(container) {
    this._container = container;
    const range = this.defaultRange();
    this._desde = range.desde;
    this._hasta = range.hasta;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start');
    container.innerHTML = `
      <div class="d-flex justify-content-center align-items-center py-5 w-100">
        <i class="fa-solid fa-spinner fa-spin fa-2x text-muted"></i>
      </div>`;
    try {
      await this.fetchResumen();
      container.innerHTML = this.renderScreen();
      this.bindEvents();
      this.paintCharts();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3">${this.escapeHtml(err.message)}</div>`;
    }
  },
};
