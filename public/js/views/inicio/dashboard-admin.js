/**
 * Dashboard de inicio — Administrador.
 */
const DASHBOARD_MESES = [
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

const DASHBOARD_ANIOS = [];
for (let y = 2020; y <= 2027; y += 1) {
  DASHBOARD_ANIOS.push({ value: y, label: String(y) });
}

const DashboardAdminView = {
  _container: null,
  _mes: null,
  _anio: null,
  _data: null,
  _charts: [],
  _loading: false,

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

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

  mesLabel(mes) {
    const found = DASHBOARD_MESES.find((m) => m.value === Number(mes));
    return found ? found.label : String(mes ?? '');
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

  apiUrl() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    return `/api/dashboard/admin?${params}`;
  },

  renderFilters() {
    const mesOpts = DASHBOARD_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = DASHBOARD_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');
    return `
      <div class="card dashboard-admin-filters shadow-sm mb-3">
        <div class="card-body py-2 px-3">
          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label for="dashboard-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="dashboard-mes">${mesOpts}</select>
            </div>
            <div>
              <label for="dashboard-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="dashboard-anio">${anioOpts}</select>
            </div>
            <div class="small text-muted pb-1">
              ${this.escapeHtml(this.mesLabel(this._mes))} ${this.escapeHtml(this._anio)}
              · ${this.escapeHtml(F.getEmpNitNombre() || F.getEmpNit() || '')}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderKpis() {
    const r = this._data?.resumen || {};
    const inv = this._data?.inventario || {};
    const sinStock = this._data?.sinStock?.total ?? 0;
    return `
      <div class="row g-2 mb-3 dashboard-admin-kpis">
        <div class="col-6 col-lg-3">
          <div class="card dashboard-kpi-card shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <p class="dashboard-kpi-label mb-0">Ventas netas</p>
              <p class="dashboard-kpi-value mb-0">${this.escapeHtml(this.formatMoney(r.ventasNetas))}</p>
              <p class="small text-muted mb-0">${r.documentosVenta ?? 0} facturas</p>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card dashboard-kpi-card shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <p class="dashboard-kpi-label mb-0">Devoluciones</p>
              <p class="dashboard-kpi-value text-danger mb-0">${this.escapeHtml(this.formatMoney(r.devoluciones))}</p>
              <p class="small text-muted mb-0">${r.documentosDevolucion ?? 0} documentos</p>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <div class="card dashboard-kpi-card shadow-sm h-100">
            <div class="card-body py-2 px-3">
              <p class="dashboard-kpi-label mb-0">Inventario (costo)</p>
              <p class="dashboard-kpi-value mb-0">${this.escapeHtml(this.formatMoney(inv.valorTotalCosto))}</p>
              <p class="small text-muted mb-0">${inv.marcas ?? 0} marcas</p>
            </div>
          </div>
        </div>
        <div class="col-6 col-lg-3">
          <button type="button" class="card dashboard-kpi-card dashboard-kpi-card--click shadow-sm h-100 w-100 text-start border-0"
            id="dashboard-btn-sin-stock" title="Ver productos habilitados sin existencia">
            <div class="card-body py-2 px-3">
              <p class="dashboard-kpi-label mb-0">Sin existencia</p>
              <p class="dashboard-kpi-value text-warning mb-0">${sinStock}</p>
              <p class="small text-muted mb-0">Habilitados · clic para listar</p>
            </div>
          </button>
        </div>
      </div>
    `;
  },

  renderTopProductosTable() {
    const rows = this._data?.topProductos || [];
    if (!rows.length) {
      return '<p class="text-muted small text-center mb-0 py-3">Sin ventas de productos en el periodo</p>';
    }
    const body = rows
      .map(
        (p) => `<tr>
          <td class="text-muted dashboard-top-rank">${p.rank}</td>
          <td class="dashboard-top-cod">${this.escapeHtml(p.CODPROD)}</td>
          <td class="dashboard-top-desc">${this.escapeHtml(p.DESPROD)}</td>
          <td class="text-end">${this.escapeHtml(String(p.totalUnidades))}</td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(p.totalPrecio))}</td>
        </tr>`
      )
      .join('');
    return `
      <div class="table-responsive dashboard-top-table-wrap">
        <table class="table table-sm table-hover table-striped mb-0 dashboard-top-table">
          <thead class="table-light">
            <tr>
              <th scope="col" class="dashboard-top-rank">#</th>
              <th scope="col">Cód.</th>
              <th scope="col">Producto</th>
              <th scope="col" class="text-end">Unid.</th>
              <th scope="col" class="text-end">Total</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },

  renderCharts() {
    return `
      <div class="row g-2 mb-2">
        <div class="col-12 col-xl-8">
          <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm h-100">
            <div class="card-header py-1 px-3">
              <h3 class="h6 mb-0">Ventas netas por día</h3>
              <p class="small text-muted mb-0">FAC, FEF, FEC, FES menos DEV y FNC (operados)</p>
            </div>
            <div class="card-body py-2">
              <canvas id="dashboard-chart-ventas-dia" class="dashboard-chart-canvas" aria-label="Ventas por día"></canvas>
            </div>
          </div>
        </div>
        <div class="col-12 col-xl-4">
          <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm h-100">
            <div class="card-header py-1 px-3">
              <h3 class="h6 mb-0">Ventas vs compras</h3>
              <p class="small text-muted mb-0">FAC/FEL vs COM/COP del mes</p>
            </div>
            <div class="card-body py-2">
              <canvas id="dashboard-chart-ventas-compras" class="dashboard-chart-canvas" aria-label="Ventas vs compras del mes"></canvas>
            </div>
          </div>
        </div>
      </div>
      <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm mb-2">
        <div class="card-header py-1 px-3">
          <h3 class="h6 mb-0">Proyección de cierre de mes</h3>
          <p class="small text-muted mb-0">
            Promedio diario neto (${this._data?.proyeccion?.diasTranscurridos ?? 0} día(s) transcurridos):
            <strong>${this.escapeHtml(this.formatMoney(this._data?.proyeccion?.promedioDiario))}</strong>
            · Total proyectado al cierre:
            <strong>${this.escapeHtml(this.formatMoney(this._data?.proyeccion?.totalProyectadoMes))}</strong>
          </p>
        </div>
        <div class="card-body py-2">
          <canvas id="dashboard-chart-proyeccion" class="dashboard-chart-canvas dashboard-chart-canvas--line" aria-label="Proyección de cierre de mes"></canvas>
        </div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-12 col-lg-6">
          <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm h-100">
            <div class="card-header py-1 px-3">
              <h3 class="h6 mb-0">Ventas y devoluciones por vendedor</h3>
              <p class="small text-muted mb-0">Documentos operados del periodo</p>
            </div>
            <div class="card-body py-2">
              <canvas id="dashboard-chart-vendedor" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor" aria-label="Ventas por vendedor"></canvas>
            </div>
          </div>
        </div>
        <div class="col-12 col-lg-6">
          <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm h-100">
            <div class="card-header py-1 px-3">
              <h3 class="h6 mb-0">Top 10 productos vendidos</h3>
              <p class="small text-muted mb-0">Suma de DOCPRODUCTOS.TOTALPRECIO · facturas del mes</p>
            </div>
            <div class="card-body py-2">
              ${this.renderTopProductosTable()}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  render() {
    return `
      <div class="dashboard-admin-wrap w-100">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h2 class="h5 mb-0"><i class="fa-solid fa-chart-line me-2 text-primary"></i>Dashboard administrador</h2>
        </div>
        ${this.renderFilters()}
        ${this.renderKpis()}
        ${this.renderCharts()}
      </div>
    `;
  },

  chartColors() {
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--onneb-primary').trim() || '#0d6efd';
    return {
      primary: primary || '#0d6efd',
      success: '#198754',
      danger: '#dc3545',
      warning: '#ffc107',
      muted: '#6c757d',
    };
  },

  buildVentasDiaChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('dashboard-chart-ventas-dia');
    if (!canvas) return;
    const rows = this._data?.ventasPorDia || [];
    const colors = this.chartColors();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((d) => String(d.dia)),
        datasets: [
          {
            label: 'Ventas',
            data: rows.map((d) => d.ventas),
            backgroundColor: `${colors.primary}99`,
            borderColor: colors.primary,
            borderWidth: 1,
            stack: 'v',
          },
          {
            label: 'Devoluciones',
            data: rows.map((d) => -d.devoluciones),
            backgroundColor: `${colors.danger}88`,
            borderColor: colors.danger,
            borderWidth: 1,
            stack: 'v',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = Math.abs(ctx.raw);
                return `${ctx.dataset.label}: ${v.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' })}`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, title: { display: true, text: 'Día del mes' } },
          y: {
            stacked: true,
            ticks: {
              callback: (v) =>
                Number(v).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }),
            },
          },
        },
      },
    });
    this._charts.push(chart);
  },

  buildVentasComprasChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('dashboard-chart-ventas-compras');
    if (!canvas) return;
    const vc = this._data?.ventasVsCompras || {};
    const ventas = Number(vc.ventas) || 0;
    const compras = Number(vc.compras) || 0;
    const colors = this.chartColors();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: ['Ventas', 'Compras'],
        datasets: [
          {
            label: 'Monto',
            data: [ventas, compras],
            backgroundColor: [colors.primary || '#0d6efd', colors.warning || '#fd7e14'],
            borderRadius: 6,
            maxBarThickness: 64,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = ctx.raw;
                const docs =
                  ctx.dataIndex === 0
                    ? Number(vc.documentosVenta) || 0
                    : Number(vc.documentosCompra) || 0;
                return ` ${Number(v).toLocaleString('es-GT', {
                  style: 'currency',
                  currency: 'GTQ',
                })} · ${docs} doc(s)`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback(v) {
                return Number(v).toLocaleString('es-GT', {
                  style: 'currency',
                  currency: 'GTQ',
                  maximumFractionDigits: 0,
                });
              },
            },
          },
        },
      },
    });
    this._charts.push(chart);
  },

  buildProyeccionChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('dashboard-chart-proyeccion');
    if (!canvas) return;
    const proj = this._data?.proyeccion || {};
    const historico = proj.historico || [];
    const futuro = proj.futuro || [];
    const colors = this.chartColors();
    const diasMes = proj.diasMes || historico.length + futuro.length || 30;
    const diaCorte = proj.diasTranscurridos ?? historico.length;
    const promedioDiario = Number(proj.promedioDiario) || 0;

    const netoPorDia = new Map();
    historico.forEach((d) => netoPorDia.set(d.dia, d.neto));
    futuro.forEach((d) => netoPorDia.set(d.dia, d.neto));

    const labels = [];
    const realData = [];
    const projData = [];
    for (let dia = 1; dia <= diasMes; dia += 1) {
      labels.push(String(dia));
      if (dia < diaCorte) {
        realData.push(netoPorDia.get(dia) ?? 0);
        projData.push(null);
      } else if (dia === diaCorte) {
        const neto = netoPorDia.get(dia) ?? 0;
        realData.push(diaCorte > 0 ? neto : null);
        projData.push(diaCorte > 0 ? neto : promedioDiario);
      } else {
        realData.push(null);
        projData.push(netoPorDia.get(dia) ?? promedioDiario);
      }
    }

    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ventas netas (real)',
            data: realData,
            borderColor: colors.primary,
            backgroundColor: `${colors.primary}22`,
            fill: true,
            tension: 0.25,
            pointRadius: 2,
          },
          {
            label: 'Proyección (restante del mes)',
            data: projData,
            borderColor: colors.warning,
            borderDash: [6, 4],
            fill: false,
            tension: 0.25,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.raw === null || ctx.raw === undefined) return null;
                return `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' })}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 20, font: { size: 10 } },
            title: { display: true, text: 'Día del mes' },
          },
          y: {
            ticks: {
              callback: (v) =>
                Number(v).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }),
            },
          },
        },
      },
    });
    this._charts.push(chart);
  },

  buildVendedorChart() {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById('dashboard-chart-vendedor');
    if (!canvas) return;
    const rows = (this._data?.ventasPorVendedor || []).slice(0, 12);
    if (!rows.length) {
      canvas.parentElement.innerHTML = '<p class="text-muted small text-center mb-0">Sin ventas por vendedor en el periodo</p>';
      return;
    }
    const colors = this.chartColors();
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.VENDEDOR),
        datasets: [
          {
            label: 'Ventas',
            data: rows.map((r) => r.ventas),
            backgroundColor: `${colors.primary}99`,
            borderColor: colors.primary,
            borderWidth: 1,
          },
          {
            label: 'Devoluciones',
            data: rows.map((r) => r.devoluciones),
            backgroundColor: `${colors.danger}88`,
            borderColor: colors.danger,
            borderWidth: 1,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label(ctx) {
                const v = Math.abs(ctx.raw);
                return `${ctx.dataset.label}: ${v.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' })}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: {
              callback: (v) =>
                Number(v).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }),
            },
          },
          y: {
            ticks: { font: { size: 11 }, autoSkip: false },
          },
        },
      },
    });
    this._charts.push(chart);
  },

  renderChartsAll() {
    this.destroyCharts();
    this.buildVentasDiaChart();
    this.buildVentasComprasChart();
    this.buildProyeccionChart();
    this.buildVendedorChart();
  },

  async showSinStockModal() {
    const items = this._data?.sinStock?.items || [];
    if (!items.length) {
      F.toast('No hay productos habilitados sin existencia', 'info');
      return;
    }
    const rows = items
      .map(
        (p) => `<tr>
          <td>${this.escapeHtml(p.CODPROD)}</td>
          <td>${this.escapeHtml(p.DESPROD)}</td>
          <td>${this.escapeHtml(p.DESMARCA || '—')}</td>
          <td class="text-end">${p.SALDO}</td>
        </tr>`
      )
      .join('');
    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `Productos habilitados sin existencia (${items.length})`,
      html: `
        <div class="table-responsive text-start" style="max-height: 360px">
          <table class="table table-sm table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr><th>Cód.</th><th>Producto</th><th>Marca</th><th class="text-end">Saldo</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `,
      width: 640,
      confirmButtonText: CatalogosUI.cancelButtonHtml('Cerrar'),
      showCancelButton: false,
    });
  },

  syncPeriodFromUi() {
    const mesEl = document.getElementById('dashboard-mes');
    const anioEl = document.getElementById('dashboard-anio');
    if (mesEl) this._mes = parseInt(mesEl.value, 10);
    if (anioEl) this._anio = parseInt(anioEl.value, 10);
  },

  bindEvents() {
    const refresh = () => {
      this.syncPeriodFromUi();
      this.reload();
    };
    document.getElementById('dashboard-mes')?.addEventListener('change', refresh);
    document.getElementById('dashboard-anio')?.addEventListener('change', refresh);
    document.getElementById('dashboard-btn-sin-stock')?.addEventListener('click', () => {
      this.showSinStockModal();
    });
  },

  async fetchData() {
    this._data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
    this._mes = this._data?.periodo?.mes ?? this._mes;
    this._anio = this._data?.periodo?.anio ?? this._anio;
  },

  async reload() {
    if (!this._container || this._loading) return;
    this._loading = true;
    this.destroyCharts();
    const wrap = this._container.querySelector('.dashboard-admin-wrap');
    if (wrap) {
      wrap.innerHTML = `<div class="text-center text-muted py-5"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando dashboard…</div>`;
    }
    try {
      await this.fetchData();
      this._container.innerHTML = this.render();
      this.bindEvents();
      this.renderChartsAll();
    } catch (err) {
      this._container.innerHTML = `
        <div class="alert alert-danger m-0 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar dashboard', 'error');
    } finally {
      this._loading = false;
    }
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

    const period = this.defaultPeriod();
    this._mes = period.mes;
    this._anio = period.anio;

    container.innerHTML = `<div class="text-center text-muted py-5 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;
    await this.reload();
  },
};
