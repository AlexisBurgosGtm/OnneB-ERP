/**
 * Archivo → Documentos eliminados (consulta de snapshots JSON).
 */
const DocumentosEliminadosView = {
  _container: null,
  _rows: [],
  _mes: null,
  _anio: null,
  _filterQuery: '',
  _loading: false,

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
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const d = String(value.getDate()).padStart(2, '0');
      const m = String(value.getMonth() + 1).padStart(2, '0');
      return `${d}/${m}/${value.getFullYear()}`;
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) return this.escapeHtml(s);
    return this.formatFecha(dt);
  },

  formatFechaHora(value) {
    if (!value) return '—';
    const dt = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(dt.getTime())) return this.formatFecha(value);
    const d = String(dt.getDate()).padStart(2, '0');
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const y = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${hh}:${mm}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  mesOptionsHtml() {
    const names = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return names
      .map((label, i) => {
        const mes = i + 1;
        const sel = mes === Number(this._mes) ? ' selected' : '';
        return `<option value="${mes}"${sel}>${label}</option>`;
      })
      .join('');
  },

  anioOptionsHtml() {
    const cur = new Date().getFullYear();
    const years = [];
    for (let y = cur; y >= 2020; y -= 1) years.push(y);
    return years
      .map((y) => {
        const sel = y === Number(this._anio) ? ' selected' : '';
        return `<option value="${y}"${sel}>${y}</option>`;
      })
      .join('');
  },

  apiUrlLista() {
    const params = new URLSearchParams({
      empnit: F.getEmpNit(),
      mes: String(this._mes),
      anio: String(this._anio),
      limit: '500',
      _: String(Date.now()),
    });
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    return `/api/documentos-eliminados?${params.toString()}`;
  },

  readFiltersFromDom() {
    const mesEl = this._container?.querySelector('#docelim-mes');
    const anioEl = this._container?.querySelector('#docelim-anio');
    const qEl = this._container?.querySelector('#docelim-search');
    if (mesEl) this._mes = Number(mesEl.value) || this._mes;
    if (anioEl) this._anio = Number(anioEl.value) || this._anio;
    if (qEl) this._filterQuery = String(qEl.value || '').trim();
  },

  async fetchData() {
    if (!F.getEmpNit()) throw new Error('No hay empresa activa');
    const data = await F.fetchJson(this.apiUrlLista());
    this._rows = data.rows || [];
    return this._rows;
  },

  renderTableBody() {
    if (this._loading) {
      return `<tr><td colspan="10" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…
      </td></tr>`;
    }
    if (!this._rows.length) {
      return `<tr><td colspan="10" class="text-center text-muted py-4">Sin documentos eliminados en el período</td></tr>`;
    }
    return this._rows
      .map((r) => `
        <tr data-id="${this.escapeHtml(r.ID)}">
          <td class="text-nowrap">${this.escapeHtml(r.ID)}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFechaHora(r.FECHA_ELIMINACION))}</td>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(r.FECHA_DOC))}</td>
          <td>${this.escapeHtml(r.CODDOC || '—')}</td>
          <td class="text-end">${this.escapeHtml(r.CORRELATIVO ?? '—')}</td>
          <td>${this.escapeHtml(r.TIPODOC || '—')}</td>
          <td>${this.escapeHtml(r.DOC_NOMCLIE || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
          <td>${this.escapeHtml(r.USUARIO || '—')}</td>
          <td class="text-center">
            <button type="button" class="btn btn-sm btn-outline-primary docelim-ver" data-id="${this.escapeHtml(r.ID)}" title="Ver detalle">
              <i class="fa-solid fa-eye"></i>
            </button>
          </td>
        </tr>`)
      .join('');
  },

  renderHtml() {
    const qVal = this.escapeHtml(this._filterQuery || '');
    return `
      <div class="pos-list-wrap w-100">
        <div class="pos-list-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div>
            <h2 class="pos-list-title mb-0">Documentos eliminados</h2>
            <p class="pos-list-sub text-muted mb-0">${this._rows.length} registro(s) · solo consulta / auditoría</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="docelim-reload">
            <i class="fa-solid fa-rotate me-1"></i>Actualizar
          </button>
        </div>
        <div class="d-flex flex-wrap align-items-end gap-2 mb-3 mt-2">
          <div>
            <label class="form-label form-label-sm mb-0" for="docelim-mes">Mes elim.</label>
            <select id="docelim-mes" class="form-select form-select-sm">${this.mesOptionsHtml()}</select>
          </div>
          <div>
            <label class="form-label form-label-sm mb-0" for="docelim-anio">Año</label>
            <select id="docelim-anio" class="form-select form-select-sm">${this.anioOptionsHtml()}</select>
          </div>
          <div class="flex-grow-1" style="min-width:12rem">
            <label class="form-label form-label-sm mb-0" for="docelim-search">Buscar</label>
            <input id="docelim-search" type="search" class="form-control form-control-sm" placeholder="Coddoc, correlativo, cliente, usuario…" value="${qVal}">
          </div>
          <button type="button" class="btn btn-sm btn-primary" id="docelim-aplicar">Aplicar</button>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Eliminado</th>
                <th>Fecha doc.</th>
                <th>Cod. doc.</th>
                <th class="text-end">Correl.</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
                <th>Usuario</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="docelim-tbody">${this.renderTableBody()}</tbody>
          </table>
        </div>
      </div>`;
  },

  refreshTable() {
    const tbody = this._container?.querySelector('#docelim-tbody');
    const sub = this._container?.querySelector('.pos-list-sub');
    if (tbody) tbody.innerHTML = this.renderTableBody();
    if (sub) sub.textContent = `${this._rows.length} registro(s) · solo consulta / auditoría`;
  },

  bindEvents() {
    this._container.querySelector('#docelim-reload')?.addEventListener('click', () => this.reload());
    this._container.querySelector('#docelim-aplicar')?.addEventListener('click', () => this.reload());
    this._container.querySelector('#docelim-search')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.reload();
      }
    });
    this._container.querySelector('#docelim-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.docelim-ver');
      if (!btn) return;
      const id = Number(btn.getAttribute('data-id'));
      if (Number.isFinite(id)) this.showDetalle(id);
    });
  },

  async reload() {
    this.readFiltersFromDom();
    this._loading = true;
    this.refreshTable();
    try {
      await this.fetchData();
    } catch (err) {
      F.toast(err.message || 'Error al cargar', 'error');
      this._rows = [];
    } finally {
      this._loading = false;
      this.refreshTable();
    }
  },

  linesTableHtml(lines) {
    const arr = Array.isArray(lines) ? lines : [];
    if (!arr.length) {
      return '<p class="text-muted small mb-0">Sin líneas en el snapshot.</p>';
    }
    const rows = arr
      .map((l) => `
        <tr>
          <td>${this.escapeHtml(l.CODPROD ?? '—')}</td>
          <td>${this.escapeHtml(l.DESPROD ?? '—')}</td>
          <td>${this.escapeHtml(l.CODMEDIDA ?? '—')}</td>
          <td class="text-end">${this.escapeHtml(l.CANTIDAD ?? '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(l.PRECIO))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(l.TOTALPRECIO))}</td>
        </tr>`)
      .join('');
    return `
      <div class="table-responsive">
        <table class="table table-sm table-bordered mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Descripción</th>
              <th>Medida</th>
              <th class="text-end">Cant.</th>
              <th class="text-end">Precio</th>
              <th class="text-end">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  },

  headerFieldsHtml(header) {
    const h = header || {};
    const fields = [
      ['Cliente', h.DOC_NOMCLIE],
      ['NIT', h.DOC_NIT],
      ['Estado', h.STATUS],
      ['Pago', h.CONCRE],
      ['Total', this.formatMoney(h.TOTALPRECIO)],
      ['Usuario doc.', h.USUARIO],
      ['Serie/No. fac', [h.SERIEFAC, h.NOFAC].filter(Boolean).join(' / ') || null],
      ['FEL UUDI', h.FEL_UUDI],
      ['Observaciones', h.OBS || h.OBSERVACIONES],
    ];
    return fields
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(
        ([label, v]) =>
          `<div class="col-md-6 mb-1"><span class="text-muted small">${this.escapeHtml(label)}:</span> ${this.escapeHtml(v)}</div>`
      )
      .join('');
  },

  async showDetalle(id) {
    try {
      const params = new URLSearchParams({
        empnit: F.getEmpNit(),
        _: String(Date.now()),
      });
      const row = await F.fetchJson(`/api/documentos-eliminados/${id}?${params.toString()}`);
      const payload = row.PAYLOAD || {};
      const header = payload.header || {};
      const lines = payload.lines || [];
      const html = `
        <div class="text-start">
          <div class="row g-1 mb-2 small">
            <div class="col-md-6"><span class="text-muted">Eliminado:</span> ${this.escapeHtml(this.formatFechaHora(row.FECHA_ELIMINACION))}</div>
            <div class="col-md-6"><span class="text-muted">Usuario elim.:</span> ${this.escapeHtml(row.USUARIO || '—')}</div>
            <div class="col-md-6"><span class="text-muted">Documento:</span> ${this.escapeHtml(row.CODDOC)} #${this.escapeHtml(row.CORRELATIVO)}</div>
            <div class="col-md-6"><span class="text-muted">Tipo:</span> ${this.escapeHtml(row.TIPODOC || '—')} · Fecha doc. ${this.escapeHtml(this.formatFecha(row.FECHA_DOC))}</div>
            ${row.MOTIVO ? `<div class="col-12"><span class="text-muted">Motivo:</span> ${this.escapeHtml(row.MOTIVO)}</div>` : ''}
          </div>
          <hr class="my-2">
          <div class="fw-semibold mb-1">Encabezado</div>
          <div class="row small mb-2">${this.headerFieldsHtml(header) || '<div class="col-12 text-muted">Sin datos de encabezado</div>'}</div>
          <div class="fw-semibold mb-1">Líneas (${lines.length})</div>
          ${this.linesTableHtml(lines)}
        </div>`;

      await Swal.fire({
        ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
        title: `Snapshot #${id}`,
        html,
        width: '48rem',
        showCancelButton: false,
        confirmButtonText: typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Cerrar') : 'Cerrar',
      });
    } catch (err) {
      F.toast(err.message || 'Error al cargar detalle', 'error');
    }
  },

  async load(container) {
    this._container = container;
    const def = this.defaultPeriod();
    this._mes = def.mes;
    this._anio = def.anio;
    this._filterQuery = '';
    this._rows = [];
    this._loading = true;
    container.innerHTML = this.renderHtml();
    this.bindEvents();
    try {
      await this.fetchData();
    } catch (err) {
      F.toast(err.message || 'Error al cargar', 'error');
      this._rows = [];
    } finally {
      this._loading = false;
      this.refreshTable();
    }
  },
};

window.DocumentosEliminadosView = DocumentosEliminadosView;
