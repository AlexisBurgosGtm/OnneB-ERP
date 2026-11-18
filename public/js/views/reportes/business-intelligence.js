/**
 * Vista exclusiva — tipo empleado BUSINESS INTELLIGENCE (9).
 */
const BusinessIntelligenceView = {
  _container: null,
  _charts: [],
  _pollId: null,
  _mes: null,
  _anio: null,
  _data: null,

  MES_LABELS: [
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
  ],

  escapeHtml(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  money(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  pct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toLocaleString('es-GT', { maximumFractionDigits: 1 })}%`;
  },

  defaultPeriod() {
    const d = new Date();
    return { mes: d.getMonth() + 1, anio: d.getFullYear() };
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

  unload() {
    if (this._pollId) {
      clearInterval(this._pollId);
      this._pollId = null;
    }
    this.destroyCharts();
    this._container = null;
  },

  mesOptions(selected) {
    return this.MES_LABELS.map((label, i) => {
      const v = i + 1;
      return `<option value="${v}"${v === selected ? ' selected' : ''}>${label}</option>`;
    }).join('');
  },

  anioOptions(selected) {
    const y = new Date().getFullYear();
    const out = [];
    for (let a = y; a >= y - 6; a -= 1) {
      out.push(`<option value="${a}"${a === selected ? ' selected' : ''}>${a}</option>`);
    }
    return out.join('');
  },

  chartColors() {
    return {
      sky: 'rgba(56, 189, 248, 0.85)',
      skySoft: 'rgba(56, 189, 248, 0.18)',
      indigo: 'rgba(129, 140, 248, 0.9)',
      emerald: 'rgba(52, 211, 153, 0.9)',
      amber: 'rgba(251, 191, 36, 0.9)',
      rose: 'rgba(251, 113, 133, 0.9)',
    };
  },

  defaultChartOpts() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', boxWidth: 12, font: { size: 11 } },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true },
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
        },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
        },
      },
    };
  },

  registerChart(cfg) {
    if (typeof Chart === 'undefined') return null;
    const chart = new Chart(cfg.ctx, cfg.config);
    this._charts.push(chart);
    return chart;
  },

  renderKpis(k) {
    const trendCls =
      Number(k.ventasVariacion) > 0 ? 'positive' : Number(k.ventasVariacion) < 0 ? 'negative' : 'neutral';
    return `
      <div class="bi-kpi-grid">
        <article class="bi-kpi-card">
          <div class="bi-kpi-label">Ventas netas</div>
          <div class="bi-kpi-value">${this.escapeHtml(this.money(k.ventas))}</div>
          <div class="bi-kpi-trend ${trendCls}">
            <i class="fa-solid fa-chart-line me-1"></i>
            ${this.escapeHtml(this.pct(k.ventasVariacion))} vs mes anterior
          </div>
        </article>
        <article class="bi-kpi-card">
          <div class="bi-kpi-label">Utilidad bruta</div>
          <div class="bi-kpi-value">${this.escapeHtml(this.money(k.utilidad))}</div>
          <div class="bi-kpi-trend neutral">Margen ${this.escapeHtml(String(k.margen))}%</div>
        </article>
        <article class="bi-kpi-card">
          <div class="bi-kpi-label">CXC pendiente</div>
          <div class="bi-kpi-value">${this.escapeHtml(this.money(k.cxcPendiente))}</div>
          <div class="bi-kpi-trend neutral">Cartera al día de hoy</div>
        </article>
        <article class="bi-kpi-card">
          <div class="bi-kpi-label">Compras del mes</div>
          <div class="bi-kpi-value">${this.escapeHtml(this.money(k.compras))}</div>
          <div class="bi-kpi-trend neutral">${this.escapeHtml(String(k.documentosVentas))} docs. venta</div>
        </article>
        <article class="bi-kpi-card">
          <div class="bi-kpi-label">Operaciones</div>
          <div class="bi-kpi-value">${this.escapeHtml(String(k.documentosOperados))}</div>
          <div class="bi-kpi-trend neutral">Documentos operados</div>
        </article>
      </div>`;
  },

  renderRankList(items, nameKey, subKey) {
    if (!items?.length) {
      return '<p class="text-secondary small mb-0">Sin datos en el período</p>';
    }
    return `<ul class="bi-rank-list">
      ${items
        .map(
          (r) => `
        <li class="bi-rank-item">
          <span class="name">${this.escapeHtml(r[nameKey] || '—')}</span>
          <span class="amt">${this.escapeHtml(this.money(r.importe))}</span>
          ${
            subKey && r[subKey]
              ? `<span class="meta">${this.escapeHtml(r[subKey])}</span>`
              : ''
          }
        </li>`
        )
        .join('')}
    </ul>`;
  },

  renderStockAlerts(items) {
    if (!items?.length) {
      return '<p class="text-secondary small mb-0">Sin alertas de inventario</p>';
    }
    return `<ul class="bi-rank-list">
      ${items
        .map(
          (r) => `
        <li class="bi-rank-item">
          <span class="name">${this.escapeHtml(r.desprod || r.codprod)}</span>
          <span class="amt bi-alert-pill"><i class="fa-solid fa-triangle-exclamation"></i> Bajo mínimo</span>
          <span class="meta">Exist: ${this.escapeHtml(String(r.existencia))} · Mín: ${this.escapeHtml(String(r.invminimo))}</span>
        </li>`
        )
        .join('')}
    </ul>`;
  },

  renderSkeleton() {
    const p = this.defaultPeriod();
    this._mes = this._mes || p.mes;
    this._anio = this._anio || p.anio;
    return `
      <div class="bi-dashboard w-100">
        <header class="bi-dash-head">
          <div>
            <h1><i class="fa-solid fa-brain me-2 text-info"></i>Centro de inteligencia OnneB</h1>
            <p class="bi-sub mb-0">Pulse del negocio en tiempo casi real — ventas, cartera, compras e inventario.</p>
          </div>
          <div class="bi-period-controls">
            <select id="bi-sel-mes" class="form-select form-select-sm" aria-label="Mes">${this.mesOptions(this._mes)}</select>
            <select id="bi-sel-anio" class="form-select form-select-sm" aria-label="Año">${this.anioOptions(this._anio)}</select>
            <button type="button" class="btn btn-sm btn-info text-dark fw-semibold" id="bi-btn-refresh">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar
            </button>
          </div>
        </header>
        <div id="bi-kpi-host">${this._data ? this.renderKpis(this._data.kpis) : '<div class="bi-loading"><span class="spinner-border spinner-border-sm"></span>Cargando…</div>'}</div>
        <div class="bi-chart-grid" id="bi-charts-host">
          <div class="bi-loading w-100"><span class="spinner-border spinner-border-sm"></span>Preparando gráficas…</div>
        </div>
      </div>`;
  },

  bindEvents() {
    const root = this._container;
    if (!root || root.dataset.biBound === '1') return;
    root.dataset.biBound = '1';
    root.addEventListener('click', (e) => {
      if (e.target.closest('#bi-btn-refresh')) {
        const mesSel = root.querySelector('#bi-sel-mes');
        const anioSel = root.querySelector('#bi-sel-anio');
        if (mesSel) this._mes = parseInt(mesSel.value, 10) || this._mes;
        if (anioSel) this._anio = parseInt(anioSel.value, 10) || this._anio;
        this.fetchAndRender().catch((err) => F.toast(err.message, 'error'));
      }
    });
  },

  buildChartsHost() {
    return `
      <section class="bi-panel bi-panel--wide bi-panel--8">
        <h2>Tendencia 12 meses — ventas y utilidad</h2>
        <canvas id="bi-chart-trend" height="120"></canvas>
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Contado vs crédito</h2>
        <canvas id="bi-chart-concre" height="160"></canvas>
      </section>
      <section class="bi-panel bi-panel--6">
        <h2>Ventas por día</h2>
        <canvas id="bi-chart-daily" height="140"></canvas>
      </section>
      <section class="bi-panel bi-panel--6">
        <h2>Ritmo por hora</h2>
        <canvas id="bi-chart-hour" height="140"></canvas>
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Top marcas</h2>
        <canvas id="bi-chart-brands" height="200"></canvas>
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Antigüedad CXC</h2>
        <canvas id="bi-chart-aging" height="200"></canvas>
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Top productos</h2>
        ${this.renderRankList(this._data?.rankings?.productos, 'desprod', 'codprod')}
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Mejores clientes</h2>
        ${this.renderRankList(this._data?.rankings?.clientes, 'cliente')}
      </section>
      <section class="bi-panel bi-panel--4">
        <h2>Stock crítico</h2>
        ${this.renderStockAlerts(this._data?.alertas?.stockBajo)}
      </section>`;
  },

  paintCharts() {
    if (typeof Chart === 'undefined' || !this._data) return;
    this.destroyCharts();
    const c = this.chartColors();
    const opts = this.defaultChartOpts();
    const trend = this._data.series?.ventas12Meses || [];
    const trendCtx = document.getElementById('bi-chart-trend');
    if (trendCtx) {
      this.registerChart({
        ctx: trendCtx,
        config: {
          type: 'bar',
          data: {
            labels: trend.map((r) => r.label),
            datasets: [
              {
                type: 'bar',
                label: 'Ventas',
                data: trend.map((r) => r.importe),
                backgroundColor: c.skySoft,
                borderColor: c.sky,
                borderWidth: 1.5,
                borderRadius: 6,
                yAxisID: 'y',
              },
              {
                type: 'line',
                label: 'Utilidad',
                data: trend.map((r) => r.utilidad),
                borderColor: c.emerald,
                backgroundColor: 'transparent',
                tension: 0.35,
                pointRadius: 3,
                yAxisID: 'y',
              },
            ],
          },
          options: {
            ...opts,
            scales: {
              ...opts.scales,
              y: { ...opts.scales.y, beginAtZero: true },
            },
          },
        },
      });
    }

    const cartera = this._data.cartera || {};
    const conCtx = document.getElementById('bi-chart-concre');
    if (conCtx) {
      this.registerChart({
        ctx: conCtx,
        config: {
          type: 'doughnut',
          data: {
            labels: ['Contado', 'Crédito'],
            datasets: [
              {
                data: [cartera.contado || 0, cartera.credito || 0],
                backgroundColor: [c.indigo, c.amber],
                borderWidth: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1' } } },
          },
        },
      });
    }

    const daily = this._data.series?.ventasPorDia || [];
    const dayCtx = document.getElementById('bi-chart-daily');
    if (dayCtx) {
      this.registerChart({
        ctx: dayCtx,
        config: {
          type: 'line',
          data: {
            labels: daily.map((r) => {
              const s = String(r.dia || '');
              const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
              return m ? `${m[3]}/${m[2]}` : s;
            }),
            datasets: [
              {
                label: 'Importe',
                data: daily.map((r) => r.importe),
                fill: true,
                borderColor: c.sky,
                backgroundColor: c.skySoft,
                tension: 0.3,
              },
            ],
          },
          options: opts,
        },
      });
    }

    const hours = Array.from({ length: 24 }, (_, h) => h);
    const hourMap = new Map((this._data.series?.ventasPorHora || []).map((r) => [Number(r.hora), r.importe]));
    const hourCtx = document.getElementById('bi-chart-hour');
    if (hourCtx) {
      this.registerChart({
        ctx: hourCtx,
        config: {
          type: 'bar',
          data: {
            labels: hours.map((h) => `${String(h).padStart(2, '0')}h`),
            datasets: [
              {
                label: 'Ventas',
                data: hours.map((h) => hourMap.get(h) || 0),
                backgroundColor: c.indigo,
                borderRadius: 4,
              },
            ],
          },
          options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } },
        },
      });
    }

    const marcas = this._data.rankings?.marcas || [];
    const brandCtx = document.getElementById('bi-chart-brands');
    if (brandCtx) {
      this.registerChart({
        ctx: brandCtx,
        config: {
          type: 'polarArea',
          data: {
            labels: marcas.map((r) => r.marca),
            datasets: [
              {
                data: marcas.map((r) => r.importe),
                backgroundColor: [c.sky, c.indigo, c.emerald, c.amber, c.rose, '#a78bfa', '#f472b6', '#38bdf8'],
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { color: '#cbd5e1', font: { size: 10 } } } },
          },
        },
      });
    }

    const aging = this._data.cartera?.antiguedad || {};
    const ageCtx = document.getElementById('bi-chart-aging');
    if (ageCtx) {
      this.registerChart({
        ctx: ageCtx,
        config: {
          type: 'bar',
          data: {
            labels: ['0-30', '31-60', '61-90', '90+'],
            datasets: [
              {
                label: 'Saldo',
                data: [aging.d0_30, aging.d31_60, aging.d61_90, aging.d90_plus],
                backgroundColor: [c.emerald, c.amber, c.rose, '#fb7185'],
                borderRadius: 6,
              },
            ],
          },
          options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } },
        },
      });
    }
  },

  async fetchAndRender() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    this._data = await F.fetchJson(`/api/business-intelligence/dashboard?${params}`, {
      cache: 'no-store',
    });
    const kpiHost = this._container?.querySelector('#bi-kpi-host');
    if (kpiHost) kpiHost.innerHTML = this.renderKpis(this._data.kpis);
    const chartsHost = this._container?.querySelector('#bi-charts-host');
    if (chartsHost) {
      chartsHost.innerHTML = this.buildChartsHost();
      this.paintCharts();
    }
  },

  load(container) {
    this.unload();
    this._container = container;
    const p = this.defaultPeriod();
    this._mes = p.mes;
    this._anio = p.anio;
    container.innerHTML = this.renderSkeleton();
    this.bindEvents();
    this.fetchAndRender().catch((err) => {
      F.toast(err.message || 'No se pudo cargar el tablero', 'error');
      const host = container.querySelector('#bi-charts-host');
      if (host) host.innerHTML = `<p class="text-danger small">${this.escapeHtml(err.message)}</p>`;
    });
    this._pollId = setInterval(() => {
      this.fetchAndRender().catch(() => {});
    }, 5 * 60 * 1000);
  },
};