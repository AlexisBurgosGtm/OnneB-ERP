/**
 * Pantalla de inicio — Vendedor (CODTIPOEMPLEADO = 3).
 * Gráficas de pedidos/facturas por vendedor + lista de documentos del día con filtros.
 */
const VENDEDOR_INICIO_MESES = [
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

const VENDEDOR_INICIO_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  VENDEDOR_INICIO_ANIOS.push({ value: y, label: String(y) });
}

const VENDEDOR_INICIO_GRUPOS = [
  { value: 'todos', label: 'Todos' },
  { value: 'facturas', label: 'Facturas (FAC, FEF, FEC, FES)' },
  { value: 'pedidos', label: 'Pedidos (ENV)' },
  { value: 'cotizaciones', label: 'Cotizaciones (COT)' },
];

const VendedorInicioView = {
  _container: null,
  _mes: null,
  _anio: null,
  _fecha: null,
  _codven: null,
  _grupo: 'todos',
  _resumen: null,
  _docData: null,
  _tareas: [],
  _charts: [],
  _loading: false,

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

  formatHora(hora, minuto) {
    const h = Number(hora);
    const m = Number(minuto);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  sessionCodEmpleado() {
    const user = F.session('user') || {};
    const n = parseInt(user.codempleado, 10);
    return Number.isNaN(n) ? null : n;
  },

  destroyCharts() {
    this._charts.forEach((c) => {
      try {
        c.destroy();
      } catch (_) {
        /* ignore */
      }
    });
    this._charts = [];
  },

  mesLabel(mes) {
    const found = VENDEDOR_INICIO_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
  },

  resumenUrl() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    return `/api/dashboard/vendedor/resumen?${params}`;
  },

  documentosUrl() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      fecha: String(this._fecha),
      grupo: this._grupo,
      _: String(Date.now()),
    });
    if (this._codven !== null && this._codven !== '') params.set('codven', String(this._codven));
    return `/api/dashboard/vendedor/documentos?${params}`;
  },

  tareasUrl() {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), _: String(Date.now()) });
    return `/api/tareas?${params}`;
  },

  renderCards() {
    const t = this._docData?.totales || {};
    const card = (label, icon, cls, data) => {
      const d = data || { documentos: 0, importe: 0 };
      return `
        <div class="col-6 col-lg-3">
          <div class="card dashboard-kpi-card shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <p class="dashboard-kpi-label mb-0"><i class="fa-solid ${icon} me-1 ${cls}"></i>${this.escapeHtml(label)}</p>
              <p class="dashboard-kpi-value mb-0">${this.escapeHtml(this.formatMoney(d.importe))}</p>
              <p class="small text-muted mb-0">${d.documentos ?? 0} documento(s)</p>
            </div>
          </div>
        </div>`;
    };
    return `
      <div class="row g-2 mb-3 dashboard-admin-kpis">
        ${card('Facturas', 'fa-file-invoice-dollar', 'text-primary', t.facturas)}
        ${card('Pedidos', 'fa-cart-shopping', 'text-success', t.pedidos)}
        ${card('Cotizaciones', 'fa-file-lines', 'text-info', t.cotizaciones)}
        ${card('Total', 'fa-coins', 'text-warning', t.total)}
      </div>`;
  },

  renderVendedorOptions() {
    const vendedores = this._resumen?.vendedores || [];
    const selected = this._codven;
    const opts = [`<option value="todos"${selected === null ? ' selected' : ''}>TODOS</option>`];
    vendedores.forEach((v) => {
      const isSel = selected !== null && String(selected) === String(v.CODEMPLEADO);
      opts.push(
        `<option value="${this.escapeHtml(v.CODEMPLEADO)}"${isSel ? ' selected' : ''}>${this.escapeHtml(v.NOMEMPLEADO)}</option>`
      );
    });
    return opts.join('');
  },

  renderGrupoOptions() {
    return VENDEDOR_INICIO_GRUPOS.map(
      (g) => `<option value="${g.value}"${this._grupo === g.value ? ' selected' : ''}>${this.escapeHtml(g.label)}</option>`
    ).join('');
  },

  renderDocumentosTableBody() {
    const rows = this._docData?.rows || [];
    if (!rows.length) {
      return '<tr><td colspan="4" class="text-center text-muted py-4">Sin documentos para los filtros seleccionados</td></tr>';
    }
    return rows
      .map((r) => {
        const docLabel = `${this.escapeHtml(r.CODDOC)}-${this.escapeHtml(r.CORRELATIVO)}`;
        return `<tr>
          <td class="small">${this.escapeHtml(r.VENDEDOR || '—')}</td>
          <td class="small">${this.escapeHtml(this.formatHora(r.HORA, r.MINUTO))}</td>
          <td class="small">${this.escapeHtml(r.DOC_NOMCLIE || '—')}<span class="text-muted d-block vendedor-inicio-doc-ref">${docLabel}</span></td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
        </tr>`;
      })
      .join('');
  },

  renderDocumentosTable() {
    return `
      <div class="table-responsive vendedor-inicio-docs-table-wrap">
        <table class="table table-sm table-hover table-striped mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col">Vendedor</th>
              <th scope="col">Hora</th>
              <th scope="col">Cliente</th>
              <th scope="col" class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody id="vendedor-inicio-docs-tbody">${this.renderDocumentosTableBody()}</tbody>
        </table>
      </div>`;
  },

  prioridadBadge(value) {
    const v = String(value ?? '').trim().toUpperCase();
    const cls =
      v === 'ALTA' ? 'tareas-prioridad-alta' : v === 'MEDIA' ? 'tareas-prioridad-media' : 'tareas-prioridad-baja';
    return `<span class="badge tareas-prioridad-badge ${cls}">${this.escapeHtml(v || '—')}</span>`;
  },

  renderTareasTableBody() {
    const rows = (this._tareas || []).filter(
      (t) => String(t.ST ?? '').trim().toUpperCase() !== 'FINALIZADA'
    );
    if (!rows.length) {
      return '<tr><td colspan="3" class="text-center text-muted py-3">Sin tareas pendientes</td></tr>';
    }
    return rows
      .map((t) => {
        const tarea = String(t.TAREA || '').trim();
        const short = tarea.length > 60 ? `${tarea.slice(0, 57)}…` : tarea;
        return `<tr>
          <td class="small" title="${this.escapeHtml(tarea)}">${this.escapeHtml(short || '—')}</td>
          <td class="small">${this.escapeHtml(String(t.RESPONSABLE || '—'))}</td>
          <td>${this.prioridadBadge(t.PRIORIDAD)}</td>
        </tr>`;
      })
      .join('');
  },

  renderTareasTable() {
    return `
      <div class="card shadow-sm vendedor-inicio-tareas-card">
        <div class="card-header py-1 px-3 d-flex align-items-center justify-content-between">
          <h3 class="h6 mb-0"><i class="fa-solid fa-list-check me-1 text-primary"></i>Tareas pendientes</h3>
        </div>
        <div class="card-body py-2 px-0">
          <div class="table-responsive vendedor-inicio-tareas-wrap">
            <table class="table table-sm table-hover mb-0">
              <thead class="table-light">
                <tr>
                  <th scope="col">Tarea</th>
                  <th scope="col">Responsable</th>
                  <th scope="col">Prioridad</th>
                </tr>
              </thead>
              <tbody id="vendedor-inicio-tareas-tbody">${this.renderTareasTableBody()}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderLeftColumn() {
    return `
      <div class="col-12 col-xl-7">
        <div class="card shadow-sm mb-3 vendedor-inicio-docs-card">
          <div class="card-header py-2 px-3">
            <h3 class="h6 mb-2"><i class="fa-solid fa-receipt me-1 text-primary"></i>Documentos del día</h3>
            <div class="row g-2 align-items-end">
              <div class="col-12 col-sm-4">
                <label for="vendedor-inicio-fecha" class="form-label small mb-1">Fecha</label>
                <input type="date" class="form-control form-control-sm" id="vendedor-inicio-fecha"
                  value="${this.escapeHtml(this._fecha)}">
              </div>
              <div class="col-12 col-sm-4">
                <label for="vendedor-inicio-vendedor" class="form-label small mb-1">Vendedor</label>
                <select class="form-select form-select-sm" id="vendedor-inicio-vendedor">${this.renderVendedorOptions()}</select>
              </div>
              <div class="col-12 col-sm-4">
                <label for="vendedor-inicio-grupo" class="form-label small mb-1">Documento</label>
                <select class="form-select form-select-sm" id="vendedor-inicio-grupo">${this.renderGrupoOptions()}</select>
              </div>
            </div>
          </div>
          <div class="card-body py-2 px-2" id="vendedor-inicio-docs-body">
            ${this.renderDocumentosTable()}
          </div>
        </div>
        ${this.renderTareasTable()}
      </div>`;
  },

  renderRightColumn() {
    const mesOpts = VENDEDOR_INICIO_MESES.map(
      (m) => `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = VENDEDOR_INICIO_ANIOS.map(
      (a) => `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');
    return `
      <div class="col-12 col-xl-5">
        <div class="card shadow-sm mb-3 vendedor-inicio-charts-filter">
          <div class="card-body py-2 px-3">
            <div class="d-flex flex-wrap align-items-end gap-2">
              <div>
                <label for="vendedor-inicio-mes" class="form-label small mb-1">Mes</label>
                <select class="form-select form-select-sm" id="vendedor-inicio-mes">${mesOpts}</select>
              </div>
              <div>
                <label for="vendedor-inicio-anio" class="form-label small mb-1">Año</label>
                <select class="form-select form-select-sm" id="vendedor-inicio-anio">${anioOpts}</select>
              </div>
              <div class="small text-muted pb-1">${this.escapeHtml(this.mesLabel(this._mes))} ${this.escapeHtml(this._anio)}</div>
            </div>
          </div>
        </div>
        <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm mb-3">
          <div class="card-header py-1 px-3">
            <h3 class="h6 mb-0">Pedidos por vendedor</h3>
            <p class="small text-muted mb-0">Pedidos (ENV) levantados en el periodo</p>
          </div>
          <div class="card-body py-2">
            <canvas id="vendedor-inicio-chart-pedidos" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor"></canvas>
          </div>
        </div>
        <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm mb-0">
          <div class="card-header py-1 px-3">
            <h3 class="h6 mb-0">Facturas por vendedor</h3>
            <p class="small text-muted mb-0">FAC, FEF, FEC, FES levantadas en el periodo</p>
          </div>
          <div class="card-body py-2">
            <canvas id="vendedor-inicio-chart-facturas" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor"></canvas>
          </div>
        </div>
      </div>`;
  },

  render() {
    return `
      <div class="dashboard-admin-wrap vendedor-inicio-wrap w-100">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 class="h5 mb-0"><i class="fa-solid fa-user-tag me-2 text-primary"></i>Inicio — Vendedor</h2>
          <span class="small text-muted">${this.escapeHtml(F.getEmpNitNombre() || F.getEmpNit() || '')}</span>
        </div>
        ${this.renderCards()}
        <div class="row g-3">
          ${this.renderLeftColumn()}
          ${this.renderRightColumn()}
        </div>
      </div>`;
  },

  chartColors() {
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--onneb-primary').trim() || '#0d6efd';
    return {
      primary: primary || '#0d6efd',
      success: '#198754',
    };
  },

  buildVendedorBarChart(canvasId, rows, label, color) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const data = (rows || []).slice(0, 12);
    if (!data.length) {
      canvas.parentElement.innerHTML = '<p class="text-muted small text-center mb-0 py-3">Sin datos en el periodo</p>';
      return;
    }
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: data.map((r) => r.VENDEDOR),
        datasets: [
          {
            label,
            data: data.map((r) => r.documentos),
            backgroundColor: `${color}99`,
            borderColor: color,
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const row = data[ctx.dataIndex] || {};
                const importe = Number(row.importe || 0).toLocaleString('es-GT', {
                  style: 'currency',
                  currency: 'GTQ',
                });
                return `${ctx.raw} documento(s) · ${importe}`;
              },
            },
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Cantidad' } },
          y: { ticks: { font: { size: 11 }, autoSkip: false } },
        },
      },
    });
    this._charts.push(chart);
  },

  renderChartsAll() {
    this.destroyCharts();
    const colors = this.chartColors();
    this.buildVendedorBarChart(
      'vendedor-inicio-chart-pedidos',
      this._resumen?.pedidosPorVendedor,
      'Pedidos',
      colors.success
    );
    this.buildVendedorBarChart(
      'vendedor-inicio-chart-facturas',
      this._resumen?.facturasPorVendedor,
      'Facturas',
      colors.primary
    );
  },

  updateCardsDom() {
    const cardsRow = this._container?.querySelector('.dashboard-admin-kpis');
    if (cardsRow) cardsRow.outerHTML = this.renderCards();
  },

  updateDocumentosDom() {
    const tbody = this._container?.querySelector('#vendedor-inicio-docs-tbody');
    if (tbody) tbody.innerHTML = this.renderDocumentosTableBody();
    this.updateCardsDom();
  },

  updateTareasDom() {
    const tbody = this._container?.querySelector('#vendedor-inicio-tareas-tbody');
    if (tbody) tbody.innerHTML = this.renderTareasTableBody();
  },

  async fetchResumen() {
    this._resumen = await F.fetchJson(this.resumenUrl(), { cache: 'no-store' });
  },

  async fetchDocumentos() {
    this._docData = await F.fetchJson(this.documentosUrl(), { cache: 'no-store' });
  },

  async fetchTareas() {
    try {
      const data = await F.fetchJson(this.tareasUrl(), { cache: 'no-store' });
      this._tareas = data.rows || [];
    } catch (_) {
      this._tareas = [];
    }
  },

  async reloadResumen() {
    try {
      await this.fetchResumen();
      this.renderChartsAll();
    } catch (err) {
      F.toast(err.message || 'Error al cargar gráficas', 'error');
    }
  },

  async reloadDocumentos() {
    try {
      await this.fetchDocumentos();
      this.updateDocumentosDom();
    } catch (err) {
      F.toast(err.message || 'Error al cargar documentos', 'error');
    }
  },

  bindEvents() {
    const fechaEl = document.getElementById('vendedor-inicio-fecha');
    fechaEl?.addEventListener('change', () => {
      const val = fechaEl.value?.trim();
      if (!val) return;
      this._fecha = val;
      this.reloadDocumentos();
    });

    const vendedorEl = document.getElementById('vendedor-inicio-vendedor');
    vendedorEl?.addEventListener('change', () => {
      const val = vendedorEl.value;
      this._codven = val === 'todos' || val === '' ? null : parseInt(val, 10);
      this.reloadDocumentos();
    });

    const grupoEl = document.getElementById('vendedor-inicio-grupo');
    grupoEl?.addEventListener('change', () => {
      this._grupo = grupoEl.value || 'todos';
      this.reloadDocumentos();
    });

    const mesEl = document.getElementById('vendedor-inicio-mes');
    const anioEl = document.getElementById('vendedor-inicio-anio');
    const refreshCharts = () => {
      if (mesEl) this._mes = parseInt(mesEl.value, 10);
      if (anioEl) this._anio = parseInt(anioEl.value, 10);
      this.reloadResumen();
    };
    mesEl?.addEventListener('change', refreshCharts);
    anioEl?.addEventListener('change', refreshCharts);
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning w-100" role="alert">
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    const now = new Date();
    this._mes = now.getMonth() + 1;
    this._anio = now.getFullYear();
    this._fecha = this.todayIsoDate();
    this._codven = this.sessionCodEmpleado();
    this._grupo = 'todos';

    container.innerHTML = `<div class="text-center text-muted py-5 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

    if (this._loading) return;
    this._loading = true;
    this.destroyCharts();
    try {
      await Promise.all([this.fetchResumen(), this.fetchDocumentos(), this.fetchTareas()]);
      container.innerHTML = this.render();
      this.bindEvents();
      this.renderChartsAll();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar el inicio del vendedor', 'error');
    } finally {
      this._loading = false;
    }
  },
};
