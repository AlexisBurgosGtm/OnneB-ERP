/**
 * Vista Servicio Mecánica — CRUD sobre dbo.VEHICULOS_MECANICA.
 */
const ServicioMecanicaView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _filterFechaIni: '',
  _filterFechaFin: '',
  _vehiculos: [],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  cleanText(value, maxLen = null) {
    if (value === null || value === undefined) return null;
    let s = String(value)
      .replace(/\0/g, '')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/[<>]/g, '')
      .replace(/\r\n/g, '\n')
      .trim();
    if (!s) return null;
    if (maxLen !== null && maxLen > 0 && s.length > maxLen) {
      s = s.slice(0, maxLen);
    }
    return s;
  },

  parseMoneyInput(value) {
    if (value === '' || value === null || value === undefined) return 0;
    const s = String(value).replace(/[^\d.-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  },

  apiBase(path = '') {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const base = `/api/servicio-mecanica${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(emp)}`;
  },

  todayIsoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  firstDayOfMonthIso(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
  },

  lastDayOfMonthIso(date = new Date()) {
    const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
  },

  resetDefaultFilters() {
    this._filterFechaIni = this.firstDayOfMonthIso();
    this._filterFechaFin = this.lastDayOfMonthIso();
  },

  dateInputValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, day] = s.split('-');
    if (day && m && y) return `${day}/${m}/${y}`;
    return s;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  truncateText(value, max = 80) {
    const s = this.cleanText(value) || '';
    if (s.length <= max) return s;
    return `${s.slice(0, max)}…`;
  },

  vehiculoLabel(row) {
    const placa = row?.PLACA || '';
    const desc = row?.VEHICULO_DESCRIPCION || '';
    if (placa && desc) return `${placa} — ${desc}`;
    return placa || desc || `Vehículo #${row?.CODVEHICULO ?? ''}`;
  },

  vehiculoOptionLabel(v) {
    const placa = v.PLACA || '';
    const extra = [v.MARCA, v.LINEA].filter(Boolean).join(' ');
    if (placa && extra) return `${placa} — ${extra}`;
    return placa || extra || `Vehículo #${v.CODVEHICULO}`;
  },

  async loadLookups() {
    const data = await F.fetchJson(`${this.apiBase('/lookups/vehiculos')}&_=${Date.now()}`, { cache: 'no-store' });
    this._vehiculos = data.rows || [];
    return this._vehiculos;
  },

  selectField(name, label, options, value, required = false) {
    const req = required ? 'required' : '';
    const strVal = value !== null && value !== undefined ? String(value) : '';
    const opts = options
      .map((o) => {
        const val = String(o.value);
        const sel = strVal === val ? ' selected' : '';
        return `<option value="${this.escapeHtml(val)}"${sel}>${this.escapeHtml(o.label)}</option>`;
      })
      .join('');
    return `
      <label class="form-label small mb-0" for="sm-${name}">${this.escapeHtml(label)}</label>
      <select id="sm-${name}" name="${name}" class="form-select form-select-sm" ${req}>
        <option value="">— Seleccione —</option>
        ${opts}
      </select>`;
  },

  fieldInput(name, label, value, { type = 'text', required = false, step, readonly = false } = {}) {
    const req = required ? 'required' : '';
    const ro = readonly ? 'readonly' : '';
    const stepAttr = step ? ` step="${step}"` : '';
    const displayVal = type === 'date' ? this.dateInputValue(value) : (value ?? '');
    return `
      <label class="form-label small mb-0" for="sm-${name}">${this.escapeHtml(label)}</label>
      <input type="${type}" id="sm-${name}" name="${name}" class="form-control form-control-sm${readonly ? ' bg-light' : ''}"
        value="${this.escapeHtml(displayVal)}" ${req} ${ro}${stepAttr}>`;
  },

  fieldMoneyInput(name, label, value, { required = false, step = '0.01' } = {}) {
    const req = required ? 'required' : '';
    const displayVal = value ?? '';
    return `
      <label class="form-label small mb-0" for="sm-${name}">${this.escapeHtml(label)}</label>
      <div class="input-group input-group-sm">
        <span class="input-group-text">Q</span>
        <input type="number" id="sm-${name}" name="${name}" class="form-control form-control-sm"
          value="${this.escapeHtml(displayVal)}" ${req} step="${step}">
      </div>`;
  },

  textareaField(name, label, value, { rows = 3, maxLength = null, required = false } = {}) {
    const req = required ? 'required' : '';
    const maxAttr = maxLength ? ` maxlength="${maxLength}"` : '';
    const safeVal = this.cleanText(value) || '';
    return `
      <label class="form-label small mb-0" for="sm-${name}">${this.escapeHtml(label)}</label>
      <textarea id="sm-${name}" name="${name}" class="form-control form-control-sm" rows="${rows}" ${req}${maxAttr}>${this.escapeHtml(safeVal)}</textarea>`;
  },

  buildFormHtml(row = {}) {
    const vehiculoOpts = this._vehiculos.map((v) => ({
      value: v.CODVEHICULO,
      label: this.vehiculoOptionLabel(v),
    }));

    const pair = (col1, col2) => `
      <div class="row g-2 mb-2">
        <div class="col-6">${col1}</div>
        <div class="col-6">${col2}</div>
      </div>`;

    return `
      ${pair(
        this.selectField('CODVEHICULO', 'Vehículo', vehiculoOpts, row.CODVEHICULO, true),
        this.fieldInput('FECHA', 'Fecha', row.FECHA || this.todayIsoDate(), { type: 'date', required: true })
      )}
      <div class="mb-2">
        ${this.textareaField('FALLA_REPORTADA', 'Falla reportada', row.FALLA_REPORTADA, { rows: 3 })}
      </div>
      <div class="mb-2">
        ${this.textareaField('SERVICIO_REALIZADO', 'Servicio realizado', row.SERVICIO_REALIZADO, { rows: 3 })}
      </div>
      <div class="mb-2">
        ${this.fieldMoneyInput('IMPORTE', 'Importe', row.IMPORTE ?? 0)}
      </div>
      <div class="mb-2">
        ${this.textareaField('OBS', 'Observaciones', row.OBS, { rows: 2, maxLength: 500 })}
      </div>`;
  },

  readFormData() {
    const get = (name) => document.querySelector(`.swal2-html-container [name="${name}"]`)?.value ?? '';
    return {
      CODVEHICULO: get('CODVEHICULO').trim(),
      FECHA: get('FECHA').trim(),
      FALLA_REPORTADA: this.cleanText(get('FALLA_REPORTADA')),
      SERVICIO_REALIZADO: this.cleanText(get('SERVICIO_REALIZADO')),
      IMPORTE: this.parseMoneyInput(get('IMPORTE')),
      OBS: this.cleanText(get('OBS'), 500),
    };
  },

  validateForm(data) {
    if (!data.CODVEHICULO) return 'Seleccione el vehículo';
    if (!data.FECHA) return 'La fecha es obligatoria';
    return null;
  },

  mapFormToApi(data) {
    return {
      CODVEHICULO: Number(data.CODVEHICULO),
      FECHA: data.FECHA,
      FALLA_REPORTADA: data.FALLA_REPORTADA,
      SERVICIO_REALIZADO: data.SERVICIO_REALIZADO,
      IMPORTE: data.IMPORTE,
      OBS: data.OBS,
    };
  },

  async persistForm(payload, isEdit, id) {
    if (isEdit) {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return;
    }
    await F.fetchJson(this.apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },

  async showForm(title, row = {}, isEdit = false, id = null) {
    try {
      await this.loadLookups();
    } catch (err) {
      F.alert('Error', err.message || 'No se pudieron cargar vehículos', 'error');
      return null;
    }
    if (!this._vehiculos.length) {
      F.alert('Sin vehículos', 'Registre vehículos antes de capturar servicios de mecánica.', 'warning');
      return null;
    }

    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row),
      width: 680,
      preConfirm: async () => {
        const data = view.readFormData();
        const err = view.validateForm(data);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        const payload = view.mapFormToApi(data);
        Swal.showLoading();
        Swal.getCancelButton()?.setAttribute('disabled', 'true');
        try {
          await view.persistForm(payload, isEdit, id);
          return payload;
        } catch (e) {
          Swal.hideLoading();
          Swal.getCancelButton()?.removeAttribute('disabled');
          Swal.showValidationMessage(e.message || 'Error al guardar');
          return false;
        }
      },
    });
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros de servicio mecánica en el período seleccionado';
      return `<tr><td colspan="6" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const falla = this.truncateText(row.FALLA_REPORTADA, 60);
        const servicio = this.truncateText(row.SERVICIO_REALIZADO, 60);
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA))}</td>
          <td>${this.escapeHtml(this.vehiculoLabel(row))}</td>
          <td class="small" title="${this.escapeHtml(this.cleanText(row.FALLA_REPORTADA) || '')}">${this.escapeHtml(falla || '—')}</td>
          <td class="small" title="${this.escapeHtml(this.cleanText(row.SERVICIO_REALIZADO) || '')}">${this.escapeHtml(servicio || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(row.IMPORTE))}</td>
          <td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td>
        </tr>`;
      })
      .join('');
  },

  badgeText(total) {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    return `<i class="fa-solid fa-screwdriver-wrench me-1"></i>${total} registro(s)${this.escapeHtml(extra)}`;
  },

  renderFiltersHtml() {
    return `
      <div class="km-filter-fecha">
        <label class="form-label small mb-0" for="sm-filter-fechaini">Fecha inicial</label>
        <input type="date" id="sm-filter-fechaini" class="form-control form-control-sm"
          value="${this.escapeHtml(this.dateInputValue(this._filterFechaIni))}">
      </div>
      <div class="km-filter-fecha">
        <label class="form-label small mb-0" for="sm-filter-fechafin">Fecha final</label>
        <input type="date" id="sm-filter-fechafin" class="form-control form-control-sm"
          value="${this.escapeHtml(this.dateInputValue(this._filterFechaFin))}">
      </div>`;
  },

  renderShell() {
    const rows = this._rows;
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Servicio Mecánica</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="sm-count">${this.badgeText(rows.length)}</span>
          <div class="d-flex flex-wrap align-items-end gap-2">
            ${this.renderFiltersHtml()}
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-sm-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
          </div>
        </div>
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="sm-search"
              placeholder="Buscar por placa, falla, servicio, observaciones…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
            <button type="button" class="btn btn-outline-secondary" id="btn-sm-search-clear" title="Limpiar">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light">
              <tr>
                <th>Fecha</th>
                <th>Vehículo</th>
                <th>Falla reportada</th>
                <th>Servicio realizado</th>
                <th class="text-end">Importe</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="sm-tbody">${this.renderTableBodyHtml(rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-sm-nuevo')}
      </div>`;
  },

  findRow(id) {
    return this._rows.find((r) => String(r.ID) === String(id));
  },

  async fetchRows() {
    const params = { _: String(Date.now()) };
    if (this._filterQuery.trim()) params.q = this._filterQuery.trim();
    if (this._filterFechaIni) params.fechaini = this._filterFechaIni;
    if (this._filterFechaFin) params.fechafin = this._filterFechaFin;
    const data = await F.fetchJson(this.apiUrl(params), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  apiUrl(extraParams = {}) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/servicio-mecanica?${params}`;
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#sm-tbody');
    const badge = this._container?.querySelector('#sm-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(this._rows);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(this._rows.length);
  },

  rowLabel(row, id) {
    if (!row) return id;
    return `${this.formatFecha(row.FECHA)} · ${this.vehiculoLabel(row)}`;
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo servicio de mecánica');
    if (!data) return;
    F.toast('Servicio registrado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar servicio de mecánica', row, true, id);
    if (!data) return;
    F.toast('Servicio actualizado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const label = this.rowLabel(row, id);
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar registro?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(label)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar el registro.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Registro eliminado', 'success');
      await this.fetchRows();
      this.updateTableView();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    this._container?.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.id));
    });
    this._container?.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.id));
    });
  },

  bindEvents() {
    document.getElementById('btn-sm-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.resetDefaultFilters();
      this.load(this._container);
    });
    document.getElementById('btn-sm-nuevo')?.addEventListener('click', () => this.onNuevo());

    const applyDateFilters = async () => {
      const fechaini = document.getElementById('sm-filter-fechaini');
      const fechafin = document.getElementById('sm-filter-fechafin');
      if (fechaini) this._filterFechaIni = fechaini.value;
      if (fechafin) this._filterFechaFin = fechafin.value;
      if (this._filterFechaIni && this._filterFechaFin && this._filterFechaIni > this._filterFechaFin) {
        F.toast('La fecha inicial no puede ser mayor a la final', 'warning');
        return;
      }
      try {
        await this.fetchRows();
        this.updateTableView();
      } catch (err) {
        F.toast(err.message || 'Error al filtrar', 'error');
      }
    };

    document.getElementById('sm-filter-fechaini')?.addEventListener('change', () => applyDateFilters());
    document.getElementById('sm-filter-fechafin')?.addEventListener('change', () => applyDateFilters());

    const search = document.getElementById('sm-search');
    let timer = null;
    search?.addEventListener('input', () => {
      this._filterQuery = search.value;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          await this.fetchRows();
          this.updateTableView();
        } catch (err) {
          F.toast(err.message || 'Error al buscar', 'error');
        }
      }, 350);
    });
    document.getElementById('btn-sm-search-clear')?.addEventListener('click', () => {
      if (search) search.value = '';
      this._filterQuery = '';
      this.fetchRows().then(() => this.updateTableView()).catch(() => {});
    });
    this.bindRowActions();
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando servicios de mecánica…</div>`;
    try {
      if (!this._filterFechaIni) this.resetDefaultFilters();
      await this.fetchRows();
      container.innerHTML = this.renderShell();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
