/**
 * Vista Inventario Fiscal — saldo por producto con documentos CONTABLE=SI, por mes/año.
 */
const INV_FISCAL_MESES = [
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

const INV_FISCAL_ANIOS = [];
(() => {
  const yNow = new Date().getFullYear();
  for (let y = yNow + 1; y >= yNow - 10; y -= 1) {
    INV_FISCAL_ANIOS.push({ value: y, label: String(y) });
  }
})();

const InventarioFiscalView = {
  _container: null,
  _rows: [],
  _totals: { INICIAL: 0, COMPRAS: 0, VENTAS: 0, SALDO: 0, TOTALCOSTO: 0, TOTALCOSTO_SIN_IVA: 0 },
  _mes: null,
  _anio: null,
  _filterQuery: '',
  _loading: false,
  _truncated: false,

  tableColumns: [
    { key: 'CODPROD', label: 'Código' },
    { key: 'DESPROD', label: 'Descripción' },
    { key: 'DESMARCA', label: 'Marca' },
    { key: 'TIPOPROD', label: 'Tipo' },
    { key: 'INICIAL', label: 'Inicial', type: 'qty' },
    { key: 'COMPRAS', label: 'Compras', type: 'qty' },
    { key: 'VENTAS', label: 'Ventas', type: 'qty' },
    { key: 'SALDO', label: 'Saldo fiscal', type: 'qty' },
    { key: 'COSTO', label: 'Costo', type: 'money' },
    { key: 'COSTO_SIN_IVA', label: 'Costo sin IVA', type: 'money' },
    { key: 'TOTALCOSTO', label: 'Total costo', type: 'money' },
    { key: 'TOTALCOSTO_SIN_IVA', label: 'Total costo sin IVA', type: 'money' },
  ],

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
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  formatDate(value) {
    if (!value) return '—';
    if (typeof value === 'string') {
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    try {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return '—';
      const day = String(d.getUTCDate()).padStart(2, '0');
      const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
      return `${day}/${mo}/${d.getUTCFullYear()}`;
    } catch {
      return '—';
    }
  },

  currentPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  mesLabel(mes) {
    return INV_FISCAL_MESES.find((m) => m.value === Number(mes))?.label || String(mes);
  },

  formatCell(value, col) {
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'money') return this.escapeHtml(this.formatMoney(value));
    if (col?.type === 'qty') return this.escapeHtml(this.formatQty(value));
    return this.escapeHtml(value);
  },

  badgeText() {
    const parts = [
      `${this._rows.length} producto(s)`,
      `al ${this.mesLabel(this._mes)} ${this._anio}`,
      `Inicial: ${this.formatQty(this._totals.INICIAL)}`,
      `Compras: ${this.formatQty(this._totals.COMPRAS)}`,
      `Ventas: ${this.formatQty(this._totals.VENTAS)}`,
      `Saldo: ${this.formatQty(this._totals.SALDO)}`,
      `Costo: ${this.formatMoney(this._totals.TOTALCOSTO)}`,
      `Costo s/IVA: ${this.formatMoney(this._totals.TOTALCOSTO_SIN_IVA)}`,
    ];
    if (this._truncated) parts.push('lista truncada');
    return parts.join(' · ');
  },

  apiUrl(extra = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({
      empnit: emp,
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
      ...extra,
    });
    if (this._filterQuery) params.set('q', this._filterQuery);
    return `/api/inventario-fiscal?${params}`;
  },

  renderFiltersCard() {
    const mesOpts = INV_FISCAL_MESES.map(
      (m) =>
        `<option value="${m.value}"${Number(this._mes) === m.value ? ' selected' : ''}>${m.label}</option>`
    ).join('');
    const anioOpts = INV_FISCAL_ANIOS.map(
      (a) =>
        `<option value="${a.value}"${Number(this._anio) === a.value ? ' selected' : ''}>${a.label}</option>`
    ).join('');

    return `
      <div class="card inventario-fiscal-filters-card shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
              <label for="inv-fiscal-mes" class="form-label small mb-1">Mes</label>
              <select class="form-select form-select-sm" id="inv-fiscal-mes">${mesOpts}</select>
            </div>
            <div>
              <label for="inv-fiscal-anio" class="form-label small mb-1">Año</label>
              <select class="form-select form-select-sm" id="inv-fiscal-anio">${anioOpts}</select>
            </div>
            <div class="flex-grow-1" style="min-width:12rem">
              <label for="inv-fiscal-search" class="form-label small mb-1">Buscar</label>
              <input type="search" class="form-control form-control-sm" id="inv-fiscal-search"
                placeholder="Código, descripción o marca…" value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-inv-fiscal-recargar">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar
            </button>
            <button type="button" class="btn btn-sm btn-outline-success" id="btn-inv-fiscal-export">
              <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
            </button>
          </div>
          <div class="small text-muted mt-2" id="inv-fiscal-count">${this.escapeHtml(this.badgeText())}</div>
          <div class="small text-muted mt-1">
            Saldo acumulado hasta el mes seleccionado, solo con documentos cuyo tipo tiene
            <strong>CONTABLE = SI</strong>. Para el reporte: FEF/FEC/FES siempre restan;
            FNC/FNA y COM/COP siempre suman (aunque TIPOM=0). Demás tipos usan TIPOM.
            Haga clic en un producto para ver los movimientos del mes.
          </div>
        </div>
      </div>`;
  },

  renderTable() {
    const cols = this.tableColumns;
    const body =
      this._rows.length === 0
        ? `<tr><td colspan="${cols.length}" class="text-center text-muted py-4">
            ${this._filterQuery ? 'Ningún producto coincide con la búsqueda' : 'Sin saldo fiscal en el período'}
          </td></tr>`
        : this._rows
            .map((row) => {
              const cells = cols
                .map((c) => {
                  const align =
                    c.type === 'money' || c.type === 'qty' ? ' text-end' : '';
                  return `<td class="small${align}">${this.formatCell(row[c.key], c)}</td>`;
                })
                .join('');
              return `<tr class="inventario-fiscal-row" data-codprod="${this.escapeHtml(row.CODPROD)}" title="Ver movimientos del mes">
                ${cells}
              </tr>`;
            })
            .join('');

    const head = cols
      .map((c) => {
        const align = c.type === 'money' || c.type === 'qty' ? ' text-end' : '';
        return `<th class="small${align}">${this.escapeHtml(c.label)}</th>`;
      })
      .join('');

    return `
      <div class="card shadow-sm">
        <div class="card-body p-0">
          <div class="table-responsive inventario-fiscal-table-wrap">
            <table class="table table-sm table-hover align-middle mb-0">
              <thead class="table-light"><tr>${head}</tr></thead>
              <tbody>${body}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  },

  render() {
    return `
      <div class="inventario-fiscal-wrap w-100">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-0">Inventario Fiscal</h2>
            <p class="small text-muted mb-0">Existencia según documentos contables</p>
          </div>
        </div>
        ${this.renderFiltersCard()}
        <div id="inv-fiscal-table-root">${this.renderTable()}</div>
      </div>`;
  },

  bindEvents() {
    this._container?.querySelector('#inv-fiscal-mes')?.addEventListener('change', (e) => {
      this._mes = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#inv-fiscal-anio')?.addEventListener('change', (e) => {
      this._anio = Number(e.target.value);
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-inv-fiscal-recargar')?.addEventListener('click', () => {
      this.reload().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#btn-inv-fiscal-export')?.addEventListener('click', () => {
      this.exportExcel().catch((err) => F.toast(err.message, 'error'));
    });
    this._container?.querySelector('#inv-fiscal-table-root')?.addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-codprod]');
      if (!tr) return;
      const codprod = tr.getAttribute('data-codprod');
      if (!codprod) return;
      this.showMovimientos(codprod).catch((err) => F.toast(err.message, 'error'));
    });
    const search = this._container?.querySelector('#inv-fiscal-search');
    if (search) {
      const run = F.debounce(() => {
        this._filterQuery = search.value.trim();
        this.reload().catch((err) => F.toast(err.message, 'error'));
      }, 350);
      search.addEventListener('input', run);
    }
  },

  async exportExcel() {
    const btn = this._container?.querySelector('#btn-inv-fiscal-export');
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const params = new URLSearchParams({
      empnit: emp,
      mes: String(this._mes),
      anio: String(this._anio),
      _: String(Date.now()),
    });
    const url = `/api/inventario-fiscal/export?${params}`;
    if (typeof LibroContableCommon !== 'undefined') {
      await LibroContableCommon.downloadExport(
        url,
        btn,
        `inventario_fiscal_${this._mes}_${this._anio}.xlsx`
      );
      return;
    }
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText);
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `inventario_fiscal_${this._mes}_${this._anio}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      F.toast('Excel exportado', 'success');
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async showMovimientos(codprod) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({
      empnit: emp,
      mes: String(this._mes),
      anio: String(this._anio),
      codprod: String(codprod),
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/inventario-fiscal/movimientos?${params}`, { cache: 'no-store' });
    const prod = data.producto || {};
    const rows = data.rows || [];
    const body = rows.length
      ? rows
          .map(
            (r) => `<tr>
              <td class="small">${this.escapeHtml(this.formatDate(r.FECHA))}</td>
              <td class="small">${this.escapeHtml(r.CODDOC || '')}-${this.escapeHtml(r.CORRELATIVO ?? '')}</td>
              <td class="small">${this.escapeHtml(r.DOC_FISCAL || '—')}</td>
              <td class="small">${this.escapeHtml(r.TIPODOC || '')}</td>
              <td class="small text-end">${this.escapeHtml(this.formatQty(r.CANTIDAD))}</td>
              <td class="small text-end">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</td>
              <td class="small text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="7" class="text-center text-muted py-3">Sin movimientos en este mes</td></tr>';

    await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: `${prod.CODPROD || codprod} · ${prod.DESPROD || ''}`,
      width: 860,
      html: `
        <p class="small text-muted text-start mb-2">
          Movimientos fiscales de ${this.escapeHtml(this.mesLabel(this._mes))} ${this.escapeHtml(this._anio)}
        </p>
        <div class="table-responsive inventario-fiscal-mov-wrap">
          <table class="table table-sm table-hover align-middle mb-0 text-start">
            <thead class="table-light">
              <tr>
                <th class="small">Fecha</th>
                <th class="small">Doc. interno</th>
                <th class="small">Doc. fiscal</th>
                <th class="small">Tipo</th>
                <th class="small text-end">Cantidad</th>
                <th class="small text-end">Costo</th>
                <th class="small text-end">Precio</th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `,
      showCancelButton: false,
      confirmButtonText: CatalogosUI.aceptarButtonHtml('Cerrar'),
    });
  },

  async reload() {
    if (this._loading) return;
    this._loading = true;
    const countEl = this._container?.querySelector('#inv-fiscal-count');
    const root = this._container?.querySelector('#inv-fiscal-table-root');
    if (countEl) countEl.textContent = 'Cargando…';
    if (root) {
      root.innerHTML = `<div class="text-center text-muted py-4"><i class="fa-solid fa-spinner fa-spin me-2"></i>Calculando inventario fiscal…</div>`;
    }
    try {
      const data = await F.fetchJson(this.apiUrl(), { cache: 'no-store' });
      this._rows = data.rows || [];
      this._totals = data.totals || {
        INICIAL: 0,
        COMPRAS: 0,
        VENTAS: 0,
        SALDO: 0,
        TOTALCOSTO: 0,
        TOTALCOSTO_SIN_IVA: 0,
      };
      this._truncated = Boolean(data.truncated);
      if (countEl) countEl.textContent = this.badgeText();
      if (root) root.innerHTML = this.renderTable();
    } catch (err) {
      if (root) {
        root.innerHTML = `<div class="alert alert-danger m-0">${this.escapeHtml(err.message)}</div>`;
      }
      throw err;
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
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    const period = this.currentPeriod();
    this._mes = this._mes || period.mes;
    this._anio = this._anio || period.anio;
    this._filterQuery = '';
    this._rows = [];

    container.innerHTML = this.render();
    this.bindEvents();
    try {
      await this.reload();
    } catch (err) {
      F.toast(err.message, 'error');
    }
  },
};
