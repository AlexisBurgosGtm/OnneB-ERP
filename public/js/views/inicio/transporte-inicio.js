/**
 * Pantalla de inicio — Transporte (CODTIPOEMPLEADO = 6).
 */
const TRANSPORTE_INICIO_MESES = [
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

const TRANSPORTE_INICIO_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  TRANSPORTE_INICIO_ANIOS.push({ value: y, label: String(y) });
}

const TransporteInicioView = {
  _container: null,
  _mes: null,
  _anio: null,
  _data: null,
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

  formatGalones(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 2 });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  mesLabel(mes) {
    const found = TRANSPORTE_INICIO_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
  },

  vehiculoLabel(row) {
    const placa = row?.PLACA || '';
    const extra = [row?.DESCRIPCION, row?.MARCA, row?.LINEA].filter(Boolean).join(' · ');
    if (placa && extra) return `${placa} — ${extra}`;
    return placa || extra || `Vehículo #${row?.CODVEHICULO ?? ''}`;
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

  resumenUrl() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    return `/api/dashboard/transporte?${params}`;
  },

  renderMesAnioOptions() {
    const mesOpts = TRANSPORTE_INICIO_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${this.escapeHtml(m.label)}</option>`
    ).join('');
    const anioOpts = TRANSPORTE_INICIO_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${this.escapeHtml(a.label)}</option>`
    ).join('');
    return { mesOpts, anioOpts };
  },

  renderKpis() {
    const t = this._data?.totales || {
      registros: 0,
      galones: 0,
      importe: 0,
      serviciosMecanica: 0,
      importeMecanica: 0,
    };
    return `
      <div class="row g-2 mb-3 dashboard-admin-kpis">
        <div class="col-6 col-lg-3">
          <div class="card shadow-sm dashboard-kpi-card h-100">
            <div class="card-body py-2 px-3">
              <div class="dashboard-kpi-label">Registros kilometraje</div>
              <div class="dashboard-kpi-value">${this.escapeHtml(String(t.registros))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card shadow-sm dashboard-kpi-card h-100">
            <div class="card-body py-2 px-3">
              <div class="dashboard-kpi-label">Galones combustible</div>
              <div class="dashboard-kpi-value">${this.escapeHtml(this.formatGalones(t.galones))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card shadow-sm dashboard-kpi-card h-100">
            <div class="card-body py-2 px-3">
              <div class="dashboard-kpi-label">Importe combustible</div>
              <div class="dashboard-kpi-value">${this.escapeHtml(this.formatMoney(t.importe))}</div>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card shadow-sm dashboard-kpi-card h-100">
            <div class="card-body py-2 px-3">
              <div class="dashboard-kpi-label">Servicios mecánica</div>
              <div class="dashboard-kpi-value">${this.escapeHtml(String(t.serviciosMecanica))}</div>
              <div class="small fw-semibold text-muted">${this.escapeHtml(this.formatMoney(t.importeMecanica))}</div>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderVehiculosTableBody() {
    const rows = this._data?.vehiculos || [];
    if (!rows.length) {
      return `<tr><td colspan="6" class="text-center text-muted py-4">Sin vehículos registrados</td></tr>`;
    }
    return rows
      .map(
        (r) => `<tr>
          <td>${this.escapeHtml(this.vehiculoLabel(r))}</td>
          <td class="text-center">${this.escapeHtml(String(r.registros))}</td>
          <td class="text-end">${this.escapeHtml(this.formatGalones(r.galones))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.importe))}</td>
          <td class="text-center">${this.escapeHtml(String(r.serviciosMecanica))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.importeMecanica))}</td>
        </tr>`
      )
      .join('');
  },

  renderVehiculosTableFooter() {
    const t = this._data?.totales || {
      registros: 0,
      galones: 0,
      importe: 0,
      serviciosMecanica: 0,
      importeMecanica: 0,
    };
    return `
      <tr class="fw-semibold">
        <td>Total</td>
        <td class="text-center">${this.escapeHtml(String(t.registros))}</td>
        <td class="text-end">${this.escapeHtml(this.formatGalones(t.galones))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(t.importe))}</td>
        <td class="text-center">${this.escapeHtml(String(t.serviciosMecanica))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(t.importeMecanica))}</td>
      </tr>`;
  },

  renderVehiculosTable() {
    return `
      <div class="card shadow-sm mb-3">
        <div class="card-header py-2">
          <h3 class="h6 mb-0"><i class="fa-solid fa-car me-2"></i>Vehículos — ${this.escapeHtml(this.mesLabel(this._mes))} ${this._anio}</h3>
        </div>
        <div class="card-body p-0">
          <div class="table-responsive transporte-inicio-table-wrap">
            <table class="table table-sm table-hover table-striped mb-0">
              <thead class="table-light">
                <tr>
                  <th>Vehículo</th>
                  <th class="text-center">Kmtrs. Reg</th>
                  <th class="text-end">Galones</th>
                  <th class="text-end">Imp. combustible</th>
                  <th class="text-center">Serv. mec.</th>
                  <th class="text-end">Imp. mecánica</th>
                </tr>
              </thead>
              <tbody id="transporte-inicio-vehiculos-tbody">${this.renderVehiculosTableBody()}</tbody>
              <tfoot class="table-light">${this.renderVehiculosTableFooter()}</tfoot>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderChartsRow() {
    return `
      <div class="row g-3">
        <div class="col-lg-6">
          <div class="card shadow-sm dashboard-chart-card h-100">
            <div class="card-header py-2">
              <h3 class="h6 mb-0"><i class="fa-solid fa-gas-pump me-2"></i>Consumo en galones por vehículo</h3>
            </div>
            <div class="card-body">
              <canvas id="transporte-inicio-chart-galones" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor"></canvas>
            </div>
          </div>
        </div>
        <div class="col-lg-6">
          <div class="card shadow-sm dashboard-chart-card h-100">
            <div class="card-header py-2">
              <h3 class="h6 mb-0"><i class="fa-solid fa-user me-2"></i>Importe combustible por empleado</h3>
            </div>
            <div class="card-body">
              <canvas id="transporte-inicio-chart-empleados" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor"></canvas>
            </div>
          </div>
        </div>
      </div>`;
  },

  render() {
    const { mesOpts, anioOpts } = this.renderMesAnioOptions();
    return `
      <div class="dashboard-admin-wrap transporte-inicio-wrap w-100">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 class="h5 mb-0"><i class="fa-solid fa-truck me-2 text-primary"></i>Inicio — Transporte</h2>
          <span class="small text-muted">${this.escapeHtml(F.getEmpNitNombre() || F.getEmpNit() || '')}</span>
        </div>
        <div class="card shadow-sm mb-3 dashboard-admin-filters">
          <div class="card-body py-2">
            <div class="row g-2 align-items-end">
              <div class="col-auto">
                <label for="transporte-inicio-mes" class="form-label small mb-1">Mes</label>
                <select class="form-select form-select-sm" id="transporte-inicio-mes">${mesOpts}</select>
              </div>
              <div class="col-auto">
                <label for="transporte-inicio-anio" class="form-label small mb-1">Año</label>
                <select class="form-select form-select-sm" id="transporte-inicio-anio">${anioOpts}</select>
              </div>
            </div>
          </div>
        </div>
        ${this.renderKpis()}
        ${this.renderVehiculosTable()}
        ${this.renderChartsRow()}
      </div>`;
  },

  chartColors() {
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--onneb-primary').trim() || '#0d6efd';
    return {
      primary: primary || '#0d6efd',
      warning: '#fd7e14',
    };
  },

  buildHorizontalBarChart(canvasId, labels, values, label, color, tooltipFormatter) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (!labels.length) {
      canvas.parentElement.innerHTML = '<p class="text-muted small text-center mb-0 py-3">Sin datos en el periodo</p>';
      return;
    }
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label,
            data: values,
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
              label: tooltipFormatter || ((ctx) => `${label}: ${ctx.raw}`),
            },
          },
        },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 11 } } },
          y: { ticks: { font: { size: 11 }, autoSkip: false } },
        },
      },
    });
    this._charts.push(chart);
  },

  renderChartsAll() {
    this.destroyCharts();
    const colors = this.chartColors();
    const galones = this._data?.galonesPorVehiculo || [];
    this.buildHorizontalBarChart(
      'transporte-inicio-chart-galones',
      galones.map((r) => r.vehiculo),
      galones.map((r) => r.galones),
      'Galones',
      colors.warning,
      (ctx) => {
        const val = galones[ctx.dataIndex];
        return `Galones: ${this.formatGalones(val?.galones)}`;
      }
    );

    const empleados = this._data?.importePorEmpleado || [];
    this.buildHorizontalBarChart(
      'transporte-inicio-chart-empleados',
      empleados.map((r) => r.empleado),
      empleados.map((r) => r.importe),
      'Importe',
      colors.primary,
      (ctx) => {
        const val = empleados[ctx.dataIndex];
        return `Importe: ${this.formatMoney(val?.importe)}`;
      }
    );
  },

  updateDom() {
    const kpis = this._container?.querySelector('.dashboard-admin-kpis');
    if (kpis) kpis.outerHTML = this.renderKpis();
    const tbody = this._container?.querySelector('#transporte-inicio-vehiculos-tbody');
    if (tbody) tbody.innerHTML = this.renderVehiculosTableBody();
    const tfoot = this._container?.querySelector('.transporte-inicio-table-wrap tfoot');
    if (tfoot) tfoot.innerHTML = this.renderVehiculosTableFooter();
    this.renderChartsAll();
  },

  async fetchResumen() {
    this._data = await F.fetchJson(this.resumenUrl(), { cache: 'no-store' });
  },

  async reloadResumen() {
    try {
      await this.fetchResumen();
      this.updateDom();
    } catch (err) {
      F.toast(err.message || 'Error al cargar dashboard', 'error');
    }
  },

  bindEvents() {
    const mesEl = document.getElementById('transporte-inicio-mes');
    const anioEl = document.getElementById('transporte-inicio-anio');
    const onPeriodChange = () => {
      this._mes = Number(mesEl?.value || this._mes);
      this._anio = Number(anioEl?.value || this._anio);
      this.reloadResumen();
    };
    mesEl?.addEventListener('change', onPeriodChange);
    anioEl?.addEventListener('change', onPeriodChange);
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

    container.innerHTML = `<div class="text-center text-muted py-5 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

    if (this._loading) return;
    this._loading = true;
    this.destroyCharts();
    try {
      await this.fetchResumen();
      container.innerHTML = this.render();
      this.bindEvents();
      this.renderChartsAll();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar el inicio de transporte', 'error');
    } finally {
      this._loading = false;
    }
  },
};
