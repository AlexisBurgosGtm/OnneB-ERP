/**
 * Pantalla de inicio — Cajero (CODTIPOEMPLEADO = 8).
 * Facturas del día, formas de pago, compras al crédito por vencer y gráfica de productos vendidos.
 */
const CajeroInicioView = {
  _container: null,
  _fecha: null,
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

  formatFecha(value) {
    const s = String(value || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
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

  dashboardUrl() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      fecha: String(this._fecha),
      _: String(Date.now()),
    });
    return `/api/dashboard/cajero?${params}`;
  },

  renderFormasPagoCards() {
    const fp = this._data?.formasPago || {};
    const card = (label, icon, cls, amount) => `
      <div class="col-6 col-lg-4 col-xl">
        <div class="card dashboard-kpi-card shadow-sm h-100">
          <div class="card-body py-2 px-3">
            <p class="dashboard-kpi-label mb-0"><i class="fa-solid ${icon} me-1 ${cls}"></i>${this.escapeHtml(label)}</p>
            <p class="dashboard-kpi-value mb-0">${this.escapeHtml(this.formatMoney(amount))}</p>
          </div>
        </div>
      </div>`;
    return `
      <div class="row g-2 mb-3 dashboard-admin-kpis">
        ${card('Efectivo', 'fa-money-bill-wave', 'text-success', fp.efectivo)}
        ${card('Tarjeta', 'fa-credit-card', 'text-primary', fp.tarjeta)}
        ${card('Depósito', 'fa-building-columns', 'text-info', fp.deposito)}
        ${card('Cheque', 'fa-money-check', 'text-secondary', fp.cheque)}
        ${card('Crédito', 'fa-clock', 'text-warning', fp.credito)}
        ${card('Total facturas', 'fa-file-invoice-dollar', 'text-dark', fp.total)}
      </div>`;
  },

  renderFacturasTableBody() {
    const rows = this._data?.facturas || [];
    if (!rows.length) {
      return '<tr><td colspan="5" class="text-center text-muted py-4">Sin facturas en esta fecha</td></tr>';
    }
    return rows
      .map((r) => {
        const docLabel = `${this.escapeHtml(r.CODDOC)}-${this.escapeHtml(r.CORRELATIVO)}`;
        const pago =
          r.CONCRE === 'CRE'
            ? 'Crédito'
            : [
                r.FPAGO_EFECTIVO > 0 ? 'Efectivo' : '',
                r.FPAGO_TARJETA > 0 ? 'Tarjeta' : '',
                r.FPAGO_DEPOSITO > 0 ? 'Depósito' : '',
                r.FPAGO_CHEQUE > 0 ? 'Cheque' : '',
              ]
                .filter(Boolean)
                .join(', ') || '—';
        return `<tr>
          <td class="small">${this.escapeHtml(this.formatHora(r.HORA, r.MINUTO))}</td>
          <td class="small">${docLabel}<span class="text-muted d-block">${this.escapeHtml(r.TIPODOC || '')}</span></td>
          <td class="small">${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
          <td class="small">${this.escapeHtml(pago)}</td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
        </tr>`;
      })
      .join('');
  },

  renderFacturasTable() {
    const fp = this._data?.formasPago || {};
    return `
      <div class="table-responsive cajero-inicio-facturas-wrap">
        <table class="table table-sm table-hover table-striped mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col">Hora</th>
              <th scope="col">Documento</th>
              <th scope="col">Cliente</th>
              <th scope="col">Forma pago</th>
              <th scope="col" class="text-end">Importe</th>
            </tr>
          </thead>
          <tbody id="cajero-inicio-facturas-tbody">${this.renderFacturasTableBody()}</tbody>
          <tfoot class="table-light">
            <tr>
              <th colspan="4" class="text-end small">${fp.documentos ?? 0} factura(s)</th>
              <th class="text-end">${this.escapeHtml(this.formatMoney(fp.total))}</th>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderComprasTableBody() {
    const rows = this._data?.comprasVencimiento || [];
    if (!rows.length) {
      return '<tr><td colspan="5" class="text-center text-muted py-4">Sin compras al crédito con vencimiento en esta fecha</td></tr>';
    }
    return rows
      .map((r) => {
        const proveedor = r.NEGOCIO || r.DOC_NOMCLIE || '—';
        const docLabel = `${this.escapeHtml(r.CODDOC)}-${this.escapeHtml(r.CORRELATIVO)}`;
        return `<tr>
          <td class="small">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
          <td class="small">${docLabel}</td>
          <td class="small">${this.escapeHtml(proveedor)}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.SALDO_PENDIENTE))}</td>
        </tr>`;
      })
      .join('');
  },

  renderComprasTable() {
    const t = this._data?.totalesComprasVencimiento || {};
    return `
      <div class="table-responsive cajero-inicio-compras-wrap">
        <table class="table table-sm table-hover table-striped mb-0">
          <thead class="table-light">
            <tr>
              <th scope="col">Fecha compra</th>
              <th scope="col">Documento</th>
              <th scope="col">Proveedor</th>
              <th scope="col" class="text-end">Total</th>
              <th scope="col" class="text-end">Saldo pendiente</th>
            </tr>
          </thead>
          <tbody id="cajero-inicio-compras-tbody">${this.renderComprasTableBody()}</tbody>
          <tfoot class="table-light">
            <tr>
              <th colspan="4" class="text-end small">${t.documentos ?? 0} compra(s)</th>
              <th class="text-end">${this.escapeHtml(this.formatMoney(t.saldoPendiente))}</th>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  chartColors() {
    return {
      primary: 'rgba(13, 110, 253, 0.75)',
      primaryBorder: 'rgb(13, 110, 253)',
    };
  },

  buildProductosChart() {
    const canvas = document.getElementById('cajero-inicio-chart-productos');
    if (!canvas || typeof Chart === 'undefined') return;
    const data = this._data?.productosVendidos || [];
    const colors = this.chartColors();
    const labels = data.map((r) => {
      const desc = String(r.DESPROD || r.CODPROD || '').trim();
      return desc.length > 28 ? `${desc.slice(0, 25)}…` : desc || r.CODPROD;
    });
    const values = data.map((r) => r.totalPrecio || 0);
    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Importe vendido',
            data: values,
            backgroundColor: colors.primary,
            borderColor: colors.primaryBorder,
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
                const importe = Number(ctx.raw || 0).toLocaleString('es-GT', {
                  style: 'currency',
                  currency: 'GTQ',
                });
                const unidades = Number(row.totalUnidades || 0).toLocaleString('es-GT');
                return `${importe} · ${unidades} uds.`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (v) =>
                Number(v).toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 0 }),
            },
            title: { display: true, text: 'Importe (Q)' },
          },
          y: { ticks: { font: { size: 11 }, autoSkip: false } },
        },
      },
    });
    this._charts.push(chart);
  },

  renderCharts() {
    this.destroyCharts();
    this.buildProductosChart();
  },

  render() {
    const fechaLabel = this.formatFecha(this._fecha);
    return `
      <div class="cajero-inicio-wrap w-100">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-0"><i class="fa-solid fa-cash-register me-2 text-primary"></i>Dashboard cajero</h2>
            <p class="small text-muted mb-0">Resumen operativo del día</p>
          </div>
          <div class="d-flex align-items-end gap-2">
            <div>
              <label for="cajero-inicio-fecha" class="form-label small mb-1">Fecha del día</label>
              <input type="date" class="form-control form-control-sm" id="cajero-inicio-fecha"
                value="${this.escapeHtml(this._fecha)}">
            </div>
            <span class="small text-muted pb-1 d-none d-md-inline">${this.escapeHtml(fechaLabel)}</span>
          </div>
        </div>

        ${this.renderFormasPagoCards()}

        <div class="row g-3">
          <div class="col-12 col-xl-7">
            <div class="card shadow-sm mb-3">
              <div class="card-header py-2 px-3">
                <h3 class="h6 mb-0"><i class="fa-solid fa-file-invoice-dollar me-1 text-primary"></i>Facturas del día</h3>
              </div>
              <div class="card-body py-2 px-2" id="cajero-inicio-facturas-body">
                ${this.renderFacturasTable()}
              </div>
            </div>

            <div class="card shadow-sm mb-0">
              <div class="card-header py-2 px-3">
                <h3 class="h6 mb-0"><i class="fa-solid fa-truck-field me-1 text-warning"></i>Compras al crédito — vencen hoy</h3>
                <p class="small text-muted mb-0">Documentos con fecha de vencimiento igual a la fecha seleccionada</p>
              </div>
              <div class="card-body py-2 px-2" id="cajero-inicio-compras-body">
                ${this.renderComprasTable()}
              </div>
            </div>
          </div>

          <div class="col-12 col-xl-5">
            <div class="card dashboard-chart-card dashboard-chart-card--compact shadow-sm mb-0 h-100">
              <div class="card-header py-2 px-3">
                <h3 class="h6 mb-0">Productos vendidos</h3>
                <p class="small text-muted mb-0">Importe por producto en facturas del día</p>
              </div>
              <div class="card-body py-2 cajero-inicio-chart-body">
                <canvas id="cajero-inicio-chart-productos" class="dashboard-chart-canvas dashboard-chart-canvas--vendedor"></canvas>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  },

  updateDom() {
    const kpis = this._container?.querySelector('.dashboard-admin-kpis');
    if (kpis) kpis.outerHTML = this.renderFormasPagoCards();
    const facturasBody = this._container?.querySelector('#cajero-inicio-facturas-body');
    if (facturasBody) facturasBody.innerHTML = this.renderFacturasTable();
    const comprasBody = this._container?.querySelector('#cajero-inicio-compras-body');
    if (comprasBody) comprasBody.innerHTML = this.renderComprasTable();
    this.renderCharts();
  },

  async fetchDashboard() {
    this._data = await F.fetchJson(this.dashboardUrl(), { cache: 'no-store' });
  },

  async reload() {
    try {
      await this.fetchDashboard();
      this.updateDom();
    } catch (err) {
      F.toast(err.message || 'Error al cargar el dashboard', 'error');
    }
  },

  bindEvents() {
    const fechaEl = document.getElementById('cajero-inicio-fecha');
    fechaEl?.addEventListener('change', () => {
      const val = fechaEl.value?.trim();
      if (!val) return;
      this._fecha = val;
      this.reload();
    });
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

    this._fecha = this.todayIsoDate();
    container.innerHTML = `<div class="text-center text-muted py-5 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

    if (this._loading) return;
    this._loading = true;
    this.destroyCharts();
    try {
      await this.fetchDashboard();
      container.innerHTML = this.render();
      this.bindEvents();
      this.renderCharts();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-0 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar el inicio del cajero', 'error');
    } finally {
      this._loading = false;
    }
  },
};
