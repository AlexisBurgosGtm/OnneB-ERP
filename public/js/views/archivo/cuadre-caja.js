/**
 * Archivo → Cuadre de Caja
 * Lista documentos por rango de fechas, caja y grupo de tipodoc (FAC/FEL/DEV/FNC/VALES_CAJA).
 */
const CuadreCajaView = {
  _container: null,
  _rows: [],
  _cajas: [],
  _codcaja: null,
  _desde: '',
  _hasta: '',
  _tipo: 'FAC',
  _loading: false,

  TIPOS: [
    { value: 'FAC', label: 'FAC - ENVIOS/FACTURAS NO FISCALES' },
    { value: 'FEL', label: 'FEL - FACTURAS ELECTRONICAS (FEF, FEC, FES)' },
    { value: 'DEV', label: 'DEV - DEVOLUCIONES NO FISCALES' },
    { value: 'FNC', label: 'FNC - NOTAS DE CREDITO FEL' },
    { value: 'VALES_CAJA', label: 'VALES DE CAJA' },
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
    if (!Number.isFinite(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '—';
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  apiUrl(path = '', params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const qs = new URLSearchParams({ empnit: empNit, ...params });
    return `/api/cuadre-caja${path}?${qs.toString()}`;
  },

  listParams() {
    const codcaja = Number(this._codcaja);
    if (!Number.isFinite(codcaja) || codcaja <= 0) {
      throw new Error('Seleccione una caja válida');
    }
    return {
      desde: this._desde || this.todayIsoDate(),
      hasta: this._hasta || this.todayIsoDate(),
      tipo: this._tipo || 'FAC',
      codcaja: String(codcaja),
      _: String(Date.now()),
    };
  },

  listApiUrl() {
    return this.apiUrl('', this.listParams());
  },

  exportApiUrl() {
    return this.apiUrl('/export', this.listParams());
  },

  badgeText() {
    return `<i class="fa-solid fa-scale-balanced me-1"></i>${this._rows.length} documento(s)`;
  },

  async loadCajas() {
    const data = await F.fetchJson(this.apiUrl('/cajas', { _: String(Date.now()) }), {
      cache: 'no-store',
    });
    this._cajas = data.rows || [];
    if (!this._cajas.length) {
      this._codcaja = null;
      return;
    }
    const stillValid = this._cajas.some((c) => Number(c.CODCAJA) === Number(this._codcaja));
    if (!stillValid) {
      this._codcaja = Number(this._cajas[0].CODCAJA);
    }
  },

  async load(container) {
    this._container = container;
    const today = this.todayIsoDate();
    this._desde = today;
    this._hasta = today;
    this._tipo = 'FAC';
    this._rows = [];
    this._cajas = [];
    this._codcaja = null;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = `
      <div class="cuadre-caja-wrap w-100">
        <div class="text-muted small py-4 text-center">
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando cuadre de caja…
        </div>
      </div>`;
    try {
      await this.loadCajas();
      if (!this._codcaja) {
        throw new Error('No hay cajas configuradas para la empresa.');
      }
      await this.fetchList();
      this.render();
    } catch (err) {
      container.innerHTML = `
        <div class="cuadre-caja-wrap w-100">
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error')}</div>
        </div>`;
    }
  },

  async fetchList() {
    const wanted = Number(this._codcaja);
    if (!Number.isFinite(wanted) || wanted <= 0) {
      this._rows = [];
      return { rows: [] };
    }
    const data = await F.fetchJson(this.listApiUrl(), { cache: 'no-store' });
    // Defensa adicional: solo filas de la caja seleccionada.
    const rows = (data.rows || []).filter((r) => Number(r.CODCAJA) === wanted);
    this._rows = rows;
    if (data.desde) this._desde = data.desde;
    if (data.hasta) this._hasta = data.hasta;
    if (data.tipo) this._tipo = data.tipo;
    this._codcaja = wanted;
    return { ...data, rows, codcaja: wanted };
  },

  async reloadList() {
    if (this._loading) return;
    this._loading = true;
    const tbody = this._container?.querySelector('#cc-tbody');
    const badge = this._container?.querySelector('#cc-count');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="12" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…
      </td></tr>`;
    }
    try {
      await this.fetchList();
      if (tbody) tbody.innerHTML = this.renderRows();
      if (badge) badge.innerHTML = this.badgeText();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4">${this.escapeHtml(err.message || 'Error')}</td></tr>`;
      }
      F.toast(err.message || 'Error al cargar', 'error');
    } finally {
      this._loading = false;
    }
  },

  renderRows() {
    if (!this._rows.length) {
      return `<tr><td colspan="12" class="text-center text-muted py-4">Sin documentos en el rango seleccionado</td></tr>`;
    }
    return this._rows
      .map((row) => {
        const anulado = String(row.STATUS || '').toUpperCase() === 'A';
        return `
      <tr class="${anulado ? 'cuadre-caja-row-anulado' : ''}">
        <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA))}</td>
        <td class="text-nowrap text-center">${this.escapeHtml(row.CODCAJA ?? '—')}</td>
        <td class="text-nowrap font-monospace small">${this.escapeHtml(row.DOCUMENTO || `${row.CODDOC}-${row.CORRELATIVO}`)}</td>
        <td class="small">${this.escapeHtml(row.SAT || '—')}</td>
        <td class="text-center">${anulado ? `<span class="text-danger fw-semibold">${this.escapeHtml(row.STATUS)}</span>` : this.escapeHtml(row.STATUS || '—')}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.EFECTIVO))}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.DEPOSITO))}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.TARJETA))}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.CHEQUE))}</td>
        <td class="text-end text-nowrap">${this.escapeHtml(this.formatMoney(row.CREDITO))}</td>
        <td>${this.escapeHtml(row.NIT || '—')}</td>
        <td>${this.escapeHtml(row.DOC_NOMCLIE || '—')}</td>
      </tr>`;
      })
      .join('');
  },

  tiposOptionsHtml() {
    return this.TIPOS.map(
      (t) =>
        `<option value="${this.escapeHtml(t.value)}"${t.value === this._tipo ? ' selected' : ''}>${this.escapeHtml(t.label)}</option>`
    ).join('');
  },

  cajasOptionsHtml() {
    return (this._cajas || [])
      .map((c) => {
        const id = Number(c.CODCAJA);
        const sel = id === Number(this._codcaja) ? ' selected' : '';
        const label = c.DESCAJA ? `${c.DESCAJA} (${c.CODCAJA})` : `Caja ${c.CODCAJA}`;
        return `<option value="${this.escapeHtml(String(id))}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
  },

  render() {
    const wrap = this._container?.querySelector('.cuadre-caja-wrap') || this._container;
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Cuadre de Caja</h2>
            <p class="text-muted small mb-0">Documentos por caja, rango de fechas y tipo (FAC, FEL, DEV, FNC, vales de caja).</p>
          </div>
          <span class="badge text-bg-light border" id="cc-count">${this.badgeText()}</span>
        </div>

        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-end gap-2 mb-3">
              <div style="min-width: 12rem;">
                <label class="form-label small mb-1" for="cc-caja">Caja</label>
                <select class="form-select form-select-sm" id="cc-caja">
                  ${this.cajasOptionsHtml()}
                </select>
              </div>
              <div>
                <label class="form-label small mb-1" for="cc-desde">Fecha inicial</label>
                <input type="date" class="form-control form-control-sm" id="cc-desde"
                  value="${this.escapeHtml(this._desde || this.todayIsoDate())}">
              </div>
              <div>
                <label class="form-label small mb-1" for="cc-hasta">Fecha final</label>
                <input type="date" class="form-control form-control-sm" id="cc-hasta"
                  value="${this.escapeHtml(this._hasta || this.todayIsoDate())}">
              </div>
              <div style="min-width: 18rem; max-width: 28rem;">
                <label class="form-label small mb-1" for="cc-tipo">Tipo de documento</label>
                <select class="form-select form-select-sm" id="cc-tipo">
                  ${this.tiposOptionsHtml()}
                </select>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="cc-refresh">
                <i class="fa-solid fa-rotate me-1"></i>Actualizar
              </button>
              <button type="button" class="btn btn-sm btn-outline-success" id="cc-export">
                <i class="fa-solid fa-file-excel me-1"></i>Exportar Excel
              </button>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th scope="col">FECHA</th>
                    <th scope="col" class="text-center">CAJA</th>
                    <th scope="col">DOCUMENTO</th>
                    <th scope="col">SAT</th>
                    <th scope="col" class="text-center">STATUS</th>
                    <th scope="col" class="text-end">EFECTIVO</th>
                    <th scope="col" class="text-end">DEPOSITO</th>
                    <th scope="col" class="text-end">TARJETA</th>
                    <th scope="col" class="text-end">CHEQUE</th>
                    <th scope="col" class="text-end">CREDITO</th>
                    <th scope="col">NIT</th>
                    <th scope="col">NOMBRE CLIENTE</th>
                  </tr>
                </thead>
                <tbody id="cc-tbody">${this.renderRows()}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    this.bindEvents();
  },

  bindEvents() {
    const syncFilters = () => {
      const desde = this._container?.querySelector('#cc-desde');
      const hasta = this._container?.querySelector('#cc-hasta');
      const tipo = this._container?.querySelector('#cc-tipo');
      const caja = this._container?.querySelector('#cc-caja');
      this._desde = String(desde?.value || '').trim() || this.todayIsoDate();
      this._hasta = String(hasta?.value || '').trim() || this.todayIsoDate();
      this._tipo = String(tipo?.value || 'FAC').trim().toUpperCase() || 'FAC';
      const cod = Number(caja?.value);
      if (!Number.isFinite(cod) || cod <= 0) {
        throw new Error('Seleccione una caja válida');
      }
      this._codcaja = cod;
    };

    const apply = () => {
      try {
        syncFilters();
        this.reloadList();
      } catch (err) {
        F.toast(err.message || 'Filtros inválidos', 'warning');
      }
    };

    this._container?.querySelector('#cc-caja')?.addEventListener('change', apply);
    this._container?.querySelector('#cc-desde')?.addEventListener('change', apply);
    this._container?.querySelector('#cc-hasta')?.addEventListener('change', apply);
    this._container?.querySelector('#cc-tipo')?.addEventListener('change', apply);
    this._container?.querySelector('#cc-refresh')?.addEventListener('click', apply);
    this._container?.querySelector('#cc-export')?.addEventListener('click', () => {
      try {
        syncFilters();
        this.onExportExcel().catch((err) => F.alert('Error', err.message || 'Error al exportar', 'error'));
      } catch (err) {
        F.toast(err.message || 'Filtros inválidos', 'warning');
      }
    });
  },

  async onExportExcel() {
    const empNit = F.getEmpNit();
    if (!empNit) return;
    if (!this._codcaja) {
      F.toast('Seleccione una caja', 'warning');
      return;
    }
    const btn = this._container?.querySelector('#cc-export');
    if (btn) btn.disabled = true;
    try {
      const url = this.exportApiUrl();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || res.statusText || 'Error al exportar');
      }
      const blob = await res.blob();
      const dispo = res.headers.get('Content-Disposition') || '';
      const match = dispo.match(/filename="?([^"]+)"?/i);
      const filename = match ? match[1] : `cuadre_caja_${empNit}.xlsx`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      F.toast('Excel exportado', 'success');
    } finally {
      if (btn) btn.disabled = false;
    }
  },
};
