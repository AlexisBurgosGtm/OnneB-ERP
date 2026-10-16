/**
 * Reportes → Pendientes Facturar (FAC normales con saldo pendiente en fraccionamiento FEL).
 */
const RPF_MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

const ReportesPendientesFacturarView = {
  _container: null,
  _mes: 0,
  _anio: 0,
  _tab: 'facturas',
  _loading: false,
  _data: null,
  _filters: { facturas: '', productos: '' },
  _modal: null,
  _modalTab: 'trazabilidad',
  _delegationBound: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).trim();
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

  labelEstado(code) {
    const map = {
      EN_COLA: 'En cola FEL',
      FRACCIONADA: 'Fraccionada',
      PARCIAL: 'Parcial FEL',
      SIN_FEL: 'Sin FEL',
    };
    return map[String(code || '').trim()] || code || '—';
  },

  readPeriod() {
    const m = this._container?.querySelector('#rpf-mes');
    const a = this._container?.querySelector('#rpf-anio');
    if (m) this._mes = parseInt(m.value, 10);
    if (a) this._anio = parseInt(a.value, 10);
  },

  async fetchData() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    this._data = await F.fetchJson(`/api/reportes-pendientes-facturar?${params}`);
    return this._data;
  },

  filterRows(rows, keys, q) {
    const query = String(q || '')
      .trim()
      .toLowerCase();
    if (!query) return rows || [];
    return (rows || []).filter((r) =>
      keys
        .map((k) => String(r[k] ?? '').toLowerCase())
        .join(' ')
        .includes(query)
    );
  },

  tabClass(id) {
    return this._tab === id ? 'nav-link active' : 'nav-link';
  },

  resumen() {
    return (
      this._data?.resumen || {
        docs: 0,
        totalFac: 0,
        totalEmitidoFel: 0,
        pendienteFel: 0,
      }
    );
  },

  renderResumenCards() {
    const r = this.resumen();
    return `
      <div class="repven-resumen d-flex flex-wrap justify-content-end gap-2">
        <div class="repven-card">
          <div class="repven-card-label">Facturas</div>
          <div class="repven-card-value">${this.escapeHtml(String(r.docs))}</div>
        </div>
        <div class="repven-card">
          <div class="repven-card-label">Total FAC</div>
          <div class="repven-card-value">${this.escapeHtml(this.formatMoney(r.totalFac))}</div>
        </div>
        <div class="repven-card">
          <div class="repven-card-label">Emitido FEL</div>
          <div class="repven-card-value text-success">${this.escapeHtml(this.formatMoney(r.totalEmitidoFel))}</div>
        </div>
        <div class="repven-card repven-card-neto">
          <div class="repven-card-label">Pendiente FEL</div>
          <div class="repven-card-value text-warning">${this.escapeHtml(this.formatMoney(r.pendienteFel))}</div>
        </div>
      </div>`;
  },

  renderFacturas() {
    const q = this._filters.facturas;
    const rows = this.filterRows(this._data?.facturas || [], [
      'FECHA',
      'CODDOC',
      'CORRELATIVO',
      'CLIENTE',
      'DOC_NIT',
      'TOTAL_FAC',
      'TOTAL_EMITIDO_FEL',
      'PENDIENTE_FEL',
      'ESTADO_FRACC',
      'STATUS',
    ], q);
    const totalPend = rows.reduce((s, r) => s + (Number(r.PENDIENTE_FEL) || 0), 0);
    const body = !rows.length
      ? `<tr><td colspan="9" class="text-center text-muted py-3">Sin facturas pendientes</td></tr>`
      : rows
          .map(
            (r) => `
          <tr class="rpf-row-fac" style="cursor:pointer" role="button" tabindex="0"
            data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${this.escapeHtml(r.CORRELATIVO)}"
            title="Ver detalle">
            <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
            <td>${this.escapeHtml(r.CODDOC || '—')}</td>
            <td class="text-end">${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
            <td>${this.escapeHtml(r.CLIENTE || '—')}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTAL_FAC))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTAL_EMITIDO_FEL))}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.PENDIENTE_FEL))}</td>
            <td class="text-nowrap">${this.escapeHtml(this.labelEstado(r.ESTADO_FRACC))}</td>
            <td class="text-center">${this.escapeHtml(r.STATUS || '—')}</td>
          </tr>`
          )
          .join('');

    return `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-success" id="rpf-export-facturas">
          <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
        </button>
        <input type="search" class="form-control form-control-sm repven-search ms-auto" style="max-width: 280px;"
          data-tab="facturas" placeholder="Buscar facturas…" value="${this.escapeHtml(q)}">
      </div>
      <div class="table-responsive repven-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0 repven-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Coddoc</th>
              <th class="text-end">Correlativo</th>
              <th>Cliente</th>
              <th class="text-end">Total FAC</th>
              <th class="text-end">Emitido FEL</th>
              <th class="text-end">Pendiente FEL</th>
              <th>Estado</th>
              <th class="text-center">Status</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="6" class="text-end fw-semibold">Total pendiente FEL</td>
              <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(totalPend))}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p class="small text-muted mb-0 mt-1">Clic en una fila para ver trazabilidad y detalle de líneas.</p>`;
  },

  renderProductos() {
    const q = this._filters.productos;
    const rows = this.filterRows(this._data?.productos || [], [
      'CODPROD',
      'DESPROD',
      'CANTIDAD',
      'TOTALPRECIO',
    ], q);
    const totalU = rows.reduce((s, r) => s + (Number(r.CANTIDAD) || 0), 0);
    const totalI = rows.reduce((s, r) => s + (Number(r.TOTALPRECIO) || 0), 0);
    const body = !rows.length
      ? `<tr><td colspan="4" class="text-center text-muted py-3">Sin productos pendientes</td></tr>`
      : rows
          .map(
            (r) => `
          <tr>
            <td>${this.escapeHtml(r.CODPROD || '—')}</td>
            <td>${this.escapeHtml(r.DESPROD || '—')}</td>
            <td class="text-end">${this.escapeHtml(this.formatQty(r.CANTIDAD))}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          </tr>`
          )
          .join('');

    return `
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <button type="button" class="btn btn-sm btn-outline-success" id="rpf-export-productos">
          <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
        </button>
        <input type="search" class="form-control form-control-sm repven-search ms-auto" style="max-width: 280px;"
          data-tab="productos" placeholder="Buscar productos…" value="${this.escapeHtml(q)}">
      </div>
      <div class="table-responsive repven-table-scroll">
        <table class="table table-sm table-hover align-middle mb-0 repven-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th class="text-end">Unidades pend.</th>
              <th class="text-end">Monto pend. FEL</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="text-end fw-semibold">Totales</td>
              <td class="text-end fw-semibold">${this.escapeHtml(this.formatQty(totalU))}</td>
              <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(totalI))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  renderTabBody() {
    if (this._loading) {
      return `<div class="text-center text-muted py-5"><i class="fa-solid fa-spinner fa-spin me-1"></i>Consultando…</div>`;
    }
    if (!this._data) {
      return `<div class="text-center text-muted py-5">Seleccione mes/año y pulse Consultar</div>`;
    }
    if (this._tab === 'productos') return this.renderProductos();
    return this.renderFacturas();
  },

  renderModalShell() {
    return `
      <div class="modal fade rpf-doc-modal" id="rpf-doc-modal" tabindex="-1" aria-labelledby="rpf-doc-modal-title" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header py-2">
              <h5 class="modal-title" id="rpf-doc-modal-title">Factura</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body pt-2">
              <ul class="nav nav-tabs mb-2" id="rpf-modal-tabs">
                <li class="nav-item">
                  <button type="button" class="nav-link active" data-rpf-modal-tab="trazabilidad">Trazabilidad</button>
                </li>
                <li class="nav-item">
                  <button type="button" class="nav-link" data-rpf-modal-tab="detalle">Detalle factura</button>
                </li>
              </ul>
              <div id="rpf-modal-pane-trazabilidad"></div>
              <div id="rpf-modal-pane-detalle" class="d-none"></div>
            </div>
            <div class="modal-footer py-2">
              <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Cerrar</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  renderTrazabilidadHtml(rows) {
    if (!rows?.length) {
      return '<p class="text-muted small mb-0">No hay documentos asociados (SERIEFAC / NOFAC).</p>';
    }
    return `
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>Fecha</th>
              <th>Doc.</th>
              <th>Tipo</th>
              <th class="text-end">Correlativo</th>
              <th>Cliente</th>
              <th class="text-end">Total</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr>
                  <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA))}</td>
                  <td>${this.escapeHtml(r.CODDOC || '—')}</td>
                  <td>${this.escapeHtml(r.TIPODOC || r.DESDOC || '—')}</td>
                  <td class="text-end">${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
                  <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
                  <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
                  <td>${this.escapeHtml(r.STATUS || '—')}</td>
                </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>`;
  },

  renderDetalleLineasHtml(lineas, header) {
    const rows = lineas || [];
    const body = !rows.length
      ? `<tr><td colspan="7" class="text-center text-muted py-3">Sin líneas</td></tr>`
      : rows
          .map(
            (ln) => `<tr>
              <td>${this.escapeHtml(ln.CODPROD || '—')}</td>
              <td>${this.escapeHtml(ln.DESPROD || '—')}</td>
              <td class="text-center">${this.escapeHtml(ln.CODMEDIDA || '—')}</td>
              <td class="text-end">${this.escapeHtml(this.formatQty(ln.CANTIDAD_PEDIDA))}</td>
              <td class="text-end">${this.escapeHtml(this.formatQty(ln.CANTIDAD_FACTURADA_FEL))}</td>
              <td class="text-end fw-semibold">${this.escapeHtml(this.formatQty(ln.CANTIDAD_PENDIENTE_FEL))}</td>
              <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTAL_PENDIENTE_FEL))}</td>
            </tr>`
          )
          .join('');
    const totPed = rows.reduce((s, ln) => s + (Number(ln.CANTIDAD_PEDIDA) || 0), 0);
    const totPend = rows.reduce((s, ln) => s + (Number(ln.CANTIDAD_PENDIENTE_FEL) || 0), 0);
    const totMonto = rows.reduce((s, ln) => s + (Number(ln.TOTAL_PENDIENTE_FEL) || 0), 0);
    const h = header || {};
    return `
      <p class="small text-muted mb-2">
        Pendiente FEL documento:
        <strong>${this.escapeHtml(this.formatMoney(h.PENDIENTE_FEL))}</strong>
        · Total FAC: ${this.escapeHtml(this.formatMoney(h.TOTAL_FAC))}
      </p>
      <div class="table-responsive">
        <table class="table table-sm table-hover mb-0">
          <thead class="table-light">
            <tr>
              <th>Código</th>
              <th>Producto</th>
              <th class="text-center">Medida</th>
              <th class="text-end">Cant. pedida</th>
              <th class="text-end">Cant. fact. FEL</th>
              <th class="text-end">Cant. pend. FEL</th>
              <th class="text-end">Monto pend. FEL</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          <tfoot>
            <tr class="table-secondary fw-semibold">
              <td colspan="3" class="text-end">Totales</td>
              <td class="text-end">${this.escapeHtml(this.formatQty(totPed))}</td>
              <td></td>
              <td class="text-end">${this.escapeHtml(this.formatQty(totPend))}</td>
              <td class="text-end">${this.escapeHtml(this.formatMoney(totMonto))}</td>
            </tr>
          </tfoot>
        </table>
      </div>`;
  },

  ensureModal() {
    let el = document.getElementById('rpf-doc-modal');
    if (!el) {
      const wrap = document.createElement('div');
      wrap.innerHTML = this.renderModalShell().trim();
      el = wrap.firstElementChild;
      document.body.appendChild(el);
      if (el.dataset.rpfTabsBound !== '1') {
        el.dataset.rpfTabsBound = '1';
        el.addEventListener('click', (e) => {
          const tabBtn = e.target.closest('[data-rpf-modal-tab]');
          if (tabBtn) this.setModalTab(tabBtn.dataset.rpfModalTab);
        });
      }
    }
    if (!this._modal && window.bootstrap?.Modal) {
      this._modal = window.bootstrap.Modal.getOrCreateInstance(el);
    }
    return el;
  },

  setModalTab(tab) {
    this._modalTab = tab;
    const modal = document.getElementById('rpf-doc-modal');
    if (!modal) return;
    modal.querySelectorAll('[data-rpf-modal-tab]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.rpfModalTab === tab);
    });
    modal.querySelector('#rpf-modal-pane-trazabilidad')?.classList.toggle('d-none', tab !== 'trazabilidad');
    modal.querySelector('#rpf-modal-pane-detalle')?.classList.toggle('d-none', tab !== 'detalle');
  },

  async openFacturaModal(coddoc, correlativo) {
    const modalEl = this.ensureModal();
    const row = (this._data?.facturas || []).find(
      (r) => String(r.CODDOC) === String(coddoc) && String(r.CORRELATIVO) === String(correlativo)
    );
    const label = `${coddoc} #${correlativo}${row?.CLIENTE ? ` — ${row.CLIENTE}` : ''}`;
    const titleEl = modalEl.querySelector('#rpf-doc-modal-title');
    if (titleEl) titleEl.textContent = label;

    const paneTraz = modalEl.querySelector('#rpf-modal-pane-trazabilidad');
    const paneDet = modalEl.querySelector('#rpf-modal-pane-detalle');
    if (paneTraz) {
      paneTraz.innerHTML =
        '<div class="text-center text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…</div>';
    }
    if (paneDet) paneDet.innerHTML = '';
    this.setModalTab('trazabilidad');

    this._modal?.show();

    const empnit = encodeURIComponent(F.getEmpNit());
    const trazUrl =
      `/api/documentos/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/trazabilidad` +
      `?empnit=${empnit}&_=${Date.now()}`;
    const detUrl =
      `/api/reportes-pendientes-facturar/${encodeURIComponent(coddoc)}/${encodeURIComponent(correlativo)}/detalle` +
      `?empnit=${empnit}&_=${Date.now()}`;

    try {
      const [trazData, detData] = await Promise.all([F.fetchJson(trazUrl), F.fetchJson(detUrl)]);
      if (paneTraz) paneTraz.innerHTML = this.renderTrazabilidadHtml(trazData?.rows || []);
      if (paneDet) paneDet.innerHTML = this.renderDetalleLineasHtml(detData?.lineas || [], detData?.header);
    } catch (err) {
      const msg = this.escapeHtml(err.message || 'Error al cargar');
      if (paneTraz) paneTraz.innerHTML = `<p class="text-danger small mb-0">${msg}</p>`;
      if (paneDet) paneDet.innerHTML = `<p class="text-danger small mb-0">${msg}</p>`;
    }
  },

  async exportExcel(kind) {
    if (!this._data) {
      F.toast('Consulte el reporte primero', 'warning');
      return;
    }
    this.readPeriod();
    const path =
      kind === 'productos'
        ? '/api/reportes-pendientes-facturar/export/productos'
        : '/api/reportes-pendientes-facturar/export/facturas';
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
    });
    const res = await fetch(`${path}?${params}`, { cache: 'no-store' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText);
    }
    const blob = await res.blob();
    const disp = res.headers.get('Content-Disposition') || '';
    const match = disp.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `pendientes_facturar_${kind}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  anioOptions() {
    const yMax = new Date().getFullYear() + 1;
    const out = [];
    for (let y = 2020; y <= yMax; y += 1) out.push(y);
    return out;
  },

  renderHtml() {
    const mesOpts = RPF_MESES.map(
      (m) =>
        `<option value="${m.value}"${m.value === this._mes ? ' selected' : ''}>${this.escapeHtml(m.label)}</option>`
    ).join('');
    const anioOpts = this.anioOptions()
      .map((y) => `<option value="${y}"${y === this._anio ? ' selected' : ''}>${y}</option>`)
      .join('');

    return `
      <div class="pos-list-wrap repven-wrap">
        <div class="pos-list-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title mb-0">Reporte de Pendientes Facturar</h2>
            <p class="pos-list-sub text-muted mb-0">
              Facturas normales (FAC, REPORTES=SI) con saldo pendiente de facturación electrónica (FEF/FEC vía fraccionamiento)
            </p>
          </div>
        </div>

        <div class="repven-toolbar d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3 mt-2">
          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label class="form-label form-label-sm mb-0" for="rpf-mes">Mes</label>
              <select id="rpf-mes" class="form-select form-select-sm">${mesOpts}</select>
            </div>
            <div>
              <label class="form-label form-label-sm mb-0" for="rpf-anio">Año</label>
              <select id="rpf-anio" class="form-select form-select-sm">${anioOpts}</select>
            </div>
            <button type="button" class="btn btn-sm btn-primary" id="rpf-consultar">
              <i class="fa-solid fa-magnifying-glass me-1"></i>Consultar
            </button>
          </div>
          ${this._data ? this.renderResumenCards() : '<div class="repven-resumen"></div>'}
        </div>

        <ul class="nav nav-tabs repven-tabs mb-2">
          <li class="nav-item">
            <button type="button" class="${this.tabClass('facturas')}" data-tab="facturas">
              Facturas${this._data ? ` (${(this._data.facturas || []).length})` : ''}
            </button>
          </li>
          <li class="nav-item">
            <button type="button" class="${this.tabClass('productos')}" data-tab="productos">
              Productos${this._data ? ` (${(this._data.productos || []).length})` : ''}
            </button>
          </li>
        </ul>

        <div id="rpf-tab-body" class="repven-tab-body">
          ${this.renderTabBody()}
        </div>
      </div>`;
  },

  bindSearch() {
    this._container?.querySelectorAll('.repven-search').forEach((inp) => {
      inp.addEventListener('input', () => {
        const tab = inp.dataset.tab || 'facturas';
        this._filters[tab] = inp.value;
        const body = this._container.querySelector('#rpf-tab-body');
        if (body) {
          body.innerHTML = this.renderTabBody();
          this.bindSearch();
        }
      });
    });
  },

  bindDelegation() {
    if (this._delegationBound || !this._container) return;
    this._delegationBound = true;

    this._container.addEventListener('click', async (e) => {
      if (e.target.closest('#rpf-export-facturas')) {
        try {
          await this.exportExcel('facturas');
        } catch (err) {
          F.toast(err.message || 'Error al exportar', 'error');
        }
        return;
      }
      if (e.target.closest('#rpf-export-productos')) {
        try {
          await this.exportExcel('productos');
        } catch (err) {
          F.toast(err.message || 'Error al exportar', 'error');
        }
        return;
      }

      const tr = e.target.closest('tr.rpf-row-fac');
      if (tr?.dataset.coddoc) {
        await this.openFacturaModal(tr.dataset.coddoc, tr.dataset.correlativo);
      }
    });

    this._container.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const tr = e.target.closest('tr.rpf-row-fac');
      if (!tr?.dataset.coddoc) return;
      e.preventDefault();
      this.openFacturaModal(tr.dataset.coddoc, tr.dataset.correlativo);
    });
  },

  bindEvents() {
    const consultar = async () => {
      this.readPeriod();
      this._loading = true;
      const body = this._container.querySelector('#rpf-tab-body');
      if (body) body.innerHTML = this.renderTabBody();
      try {
        await this.fetchData();
      } catch (err) {
        this._data = null;
        if (typeof F !== 'undefined' && F.toastError) F.toastError(err.message || 'Error al consultar');
      } finally {
        this._loading = false;
        this._container.innerHTML = this.renderHtml();
        this.bindEvents();
      }
    };

    this._container.querySelector('#rpf-consultar')?.addEventListener('click', consultar);

    this._container.querySelectorAll('.repven-tabs [data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab || tab === this._tab) return;
        this._tab = tab;
        this._container.querySelectorAll('.repven-tabs .nav-link').forEach((el) => {
          el.classList.toggle('active', el.dataset.tab === tab);
        });
        const body = this._container.querySelector('#rpf-tab-body');
        if (body) {
          body.innerHTML = this.renderTabBody();
          this.bindSearch();
        }
      });
    });

    this.bindSearch();
    this.bindDelegation();
  },

  load(container) {
    this._container = container;
    this._delegationBound = false;
    const def = this.defaultPeriod();
    this._mes = def.mes;
    this._anio = def.anio;
    this._tab = 'facturas';
    this._data = null;
    this._filters = { facturas: '', productos: '' };
    this._modalTab = 'trazabilidad';
    container.innerHTML = this.renderHtml();
    this.bindEvents();
  },
};
