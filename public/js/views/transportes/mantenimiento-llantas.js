/**
 * Vista Mantenimiento de llantas — CRUD sobre dbo.VEHICULOS_MANTENIMIENTO_LLANTAS.
 */
const MantenimientoLlantasView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _filterVehiculo: '',
  _vehiculos: [],
  _nollantas: [],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiBase(path = '') {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const base = `/api/mantenimiento-llantas${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(emp)}`;
  },

  todayIsoDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  dateInputValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  },

  formatFecha(value) {
    if (!value) return '—';
    const s = String(value).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
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
    const [vehiculosData, nollantasData] = await Promise.all([
      F.fetchJson(`${this.apiBase('/lookups/vehiculos')}&_=${Date.now()}`, { cache: 'no-store' }),
      F.fetchJson(`${this.apiBase('/lookups/nollantas')}&_=${Date.now()}`, { cache: 'no-store' }),
    ]);
    this._vehiculos = vehiculosData.rows || [];
    this._nollantas = nollantasData.rows || [];
    return { vehiculos: this._vehiculos, nollantas: this._nollantas };
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
      <label class="form-label small mb-0" for="mll-${name}">${this.escapeHtml(label)}</label>
      <select id="mll-${name}" name="${name}" class="form-select form-select-sm" ${req}>
        <option value="">— Seleccione —</option>
        ${opts}
      </select>`;
  },

  fieldInput(name, label, value, { type = 'text', required = false, step } = {}) {
    const req = required ? 'required' : '';
    const stepAttr = step ? ` step="${step}"` : '';
    const displayVal = type === 'date' ? this.dateInputValue(value) : (value ?? '');
    return `
      <label class="form-label small mb-0" for="mll-${name}">${this.escapeHtml(label)}</label>
      <input type="${type}" id="mll-${name}" name="${name}" class="form-control form-control-sm"
        value="${this.escapeHtml(displayVal)}" ${req}${stepAttr}>`;
  },

  esquemaImgHtml() {
    return `
      <div class="mll-esquema-panel h-100 d-flex flex-column">
        <p class="small text-muted mb-2 text-center">Esquema de llantas</p>
        <div class="mll-esquema-img-wrap flex-grow-1 d-flex align-items-center justify-content-center">
          <img src="/data/esquema_auto.png" alt="Esquema del vehículo" class="mll-esquema-img img-fluid">
        </div>
      </div>`;
  },

  buildFormHtml(row = {}) {
    const vehiculoOpts = this._vehiculos.map((v) => ({
      value: v.CODVEHICULO,
      label: this.vehiculoOptionLabel(v),
    }));
    const nollantaOpts = this._nollantas.map((n) => ({
      value: n.NOLLANTA,
      label: n.NOLLANTA,
    }));

    const pair = (col1, col2) => `
      <div class="row g-2 mb-2">
        <div class="col-6">${col1}</div>
        <div class="col-6">${col2}</div>
      </div>`;

    const fieldsHtml = `
      ${pair(
        this.selectField('CODVEHICULO', 'Vehículo', vehiculoOpts, row.CODVEHICULO, true),
        this.selectField('NOLLANTA', 'No. llanta', nollantaOpts, row.NOLLANTA, true)
      )}
      ${pair(
        this.fieldInput('FECHA', 'Fecha', row.FECHA || this.todayIsoDate(), { type: 'date', required: true }),
        this.fieldInput('IMPORTE', 'Importe', row.IMPORTE ?? 0, { type: 'number', step: '0.01' })
      )}
      <div class="mb-2">
        ${this.fieldInput('ENCARGADO', 'Encargado', row.ENCARGADO)}
      </div>
      <div class="mb-2">
        <label class="form-label small mb-0" for="mll-DETALLES">Detalles</label>
        <textarea id="mll-DETALLES" name="DETALLES" class="form-control form-control-sm" rows="3"
          maxlength="600">${this.escapeHtml(row.DETALLES || '')}</textarea>
      </div>`;

    return `
      <div class="row g-3 mll-modal-layout align-items-stretch">
        <div class="col-8">${fieldsHtml}</div>
        <div class="col-4">${this.esquemaImgHtml()}</div>
      </div>`;
  },

  readFormData() {
    const get = (name) => document.querySelector(`.swal2-html-container [name="${name}"]`)?.value?.trim() ?? '';
    return {
      CODVEHICULO: get('CODVEHICULO'),
      NOLLANTA: get('NOLLANTA'),
      FECHA: get('FECHA'),
      IMPORTE: get('IMPORTE'),
      ENCARGADO: get('ENCARGADO'),
      DETALLES: get('DETALLES'),
    };
  },

  validateForm(data) {
    if (!data.CODVEHICULO) return 'Seleccione el vehículo';
    if (!data.NOLLANTA) return 'Seleccione el número de llanta';
    if (!data.FECHA) return 'La fecha es obligatoria';
    return null;
  },

  mapFormToApi(data) {
    const importe = Number(data.IMPORTE);
    return {
      CODVEHICULO: Number(data.CODVEHICULO),
      NOLLANTA: data.NOLLANTA,
      FECHA: data.FECHA,
      DETALLES: data.DETALLES || null,
      IMPORTE: Number.isFinite(importe) ? importe : 0,
      ENCARGADO: data.ENCARGADO || null,
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
      F.alert('Error', err.message || 'No se pudieron cargar catálogos', 'error');
      return null;
    }
    if (!this._vehiculos.length) {
      F.alert('Sin vehículos', 'Registre vehículos antes de crear mantenimientos de llantas.', 'warning');
      return null;
    }
    if (!this._nollantas.length) {
      F.alert('Sin llantas', 'No hay números de llanta configurados en VEHICULOS_CONFIG_LLANTAS.', 'warning');
      return null;
    }

    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row),
      width: 920,
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

  vehiculoFilterLabel() {
    if (!this._filterVehiculo) return 'Todos los vehículos';
    const v = this._vehiculos.find((x) => String(x.CODVEHICULO) === String(this._filterVehiculo));
    return v ? this.vehiculoOptionLabel(v) : `Vehículo #${this._filterVehiculo}`;
  },

  renderVehiculoFilterHtml() {
    const options = [
      '<option value="">Todos los vehículos</option>',
      ...this._vehiculos.map((v) => {
        const val = String(v.CODVEHICULO);
        const sel = String(this._filterVehiculo) === val ? ' selected' : '';
        return `<option value="${this.escapeHtml(val)}"${sel}>${this.escapeHtml(this.vehiculoOptionLabel(v))}</option>`;
      }),
    ].join('');
    return `
      <div class="mll-filter-vehiculo">
        <label class="form-label small mb-0" for="mll-filter-vehiculo">Vehículo</label>
        <select id="mll-filter-vehiculo" class="form-select form-select-sm">
          ${options}
        </select>
      </div>`;
  },

  sortRowsChrono(rows) {
    return [...rows].sort((a, b) => {
      const fa = String(a.FECHA || '').slice(0, 10);
      const fb = String(b.FECHA || '').slice(0, 10);
      if (fa !== fb) return fa.localeCompare(fb);
      return (Number(a.ID) || 0) - (Number(b.ID) || 0);
    });
  },

  groupRowsByVehiculo(rows) {
    const sorted = this.sortRowsChrono(rows);
    const map = new Map();
    sorted.forEach((row) => {
      const key = String(row.CODVEHICULO ?? '');
      if (!map.has(key)) {
        map.set(key, { vehiculo: row, items: [] });
      }
      map.get(key).items.push(row);
    });
    return Array.from(map.values()).sort((a, b) => {
      const pa = String(a.vehiculo.PLACA || '');
      const pb = String(b.vehiculo.PLACA || '');
      if (pa !== pb) return pa.localeCompare(pb, 'es');
      return (Number(a.vehiculo.CODVEHICULO) || 0) - (Number(b.vehiculo.CODVEHICULO) || 0);
    });
  },

  async imprimirReporte() {
    if (typeof PrintReport === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    const rows = this.getFilteredRows();
    if (!rows.length) {
      F.toast('No hay registros para imprimir', 'warning');
      return;
    }

    const groups = this.groupRowsByVehiculo(rows);
    const hoy = this.formatFecha(this.todayIsoDate());
    const filtroVehiculo = this.vehiculoFilterLabel();
    let grandTotal = 0;
    let grandCount = 0;

    const sections = groups
      .map((group) => {
        const vehLabel = this.vehiculoLabel(group.vehiculo);
        const subtotal = group.items.reduce((s, r) => s + (Number(r.IMPORTE) || 0), 0);
        grandTotal += subtotal;
        grandCount += group.items.length;
        const bodyRows = group.items
          .map(
            (r) => `<tr>
              <td>${PrintReport.escapeHtml(this.formatFecha(r.FECHA))}</td>
              <td class="text-center">${PrintReport.escapeHtml(r.NOLLANTA || '—')}</td>
              <td>${PrintReport.escapeHtml(r.DETALLES || '—')}</td>
              <td>${PrintReport.escapeHtml(r.ENCARGADO || '—')}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.IMPORTE))}</td>
            </tr>`
          )
          .join('');
        return `
          <section class="mll-report-section">
            <h2 class="mll-report-vehiculo">${PrintReport.escapeHtml(vehLabel)}</h2>
            <table class="mll-report-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th class="text-center">Llanta</th>
                  <th>Detalles</th>
                  <th>Encargado</th>
                  <th class="text-end">Importe</th>
                </tr>
              </thead>
              <tbody>${bodyRows}</tbody>
              <tfoot>
                <tr class="totals">
                  <td colspan="4" class="text-end"><strong>Subtotal (${group.items.length} servicio(s))</strong></td>
                  <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(subtotal))}</strong></td>
                </tr>
              </tfoot>
            </table>
          </section>`;
      })
      .join('');

    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Mantenimiento de llantas',
        subtitleHtml: `
          <p><strong>Fecha reporte:</strong> ${PrintReport.escapeHtml(hoy)}</p>
          <p><strong>Filtro vehículo:</strong> ${PrintReport.escapeHtml(filtroVehiculo)}</p>
          <p><strong>Total servicios:</strong> ${grandCount}</p>
        `,
      })}
      ${sections}
      <table class="mll-report-table mll-report-grand">
        <tfoot>
          <tr class="totals">
            <td class="text-end"><strong>Total general (${grandCount} servicio(s))</strong></td>
            <td class="text-end" style="width:8rem"><strong>${PrintReport.escapeHtml(this.formatMoney(grandTotal))}</strong></td>
          </tr>
        </tfoot>
      </table>`;

    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: 'Mantenimiento de llantas',
          bodyHtml,
          extraStyles: `
        .mll-report-section{margin-bottom:1.25rem;page-break-inside:avoid}
        .mll-report-vehiculo{font-size:13px;margin:0 0 .35rem;padding:.35rem .5rem;background:#f0f0f0;border:1px solid #ccc}
        .mll-report-table{font-size:11px}
        .mll-report-grand{margin-top:.5rem}
        .mll-report-table th,.mll-report-table td{padding:4px 6px}
      `,
        }),
      'width=900,height=700'
    );
  },

  getFilteredRows() {
    return this.sortRowsChrono(this._rows);
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros de mantenimiento de llantas';
      return `<tr><td colspan="7" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        return `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA))}</td>
          <td>${this.escapeHtml(this.vehiculoLabel(row))}</td>
          <td class="fw-semibold text-center">${this.escapeHtml(row.NOLLANTA || '—')}</td>
          <td class="small">${this.escapeHtml(row.DETALLES || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(row.IMPORTE))}</td>
          <td>${this.escapeHtml(row.ENCARGADO || '—')}</td>
          <td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td>
        </tr>`;
      })
      .join('');
  },

  badgeText(shown, total) {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    const q = this._filterQuery.trim();
    let countLabel;
    if (q && shown !== total) countLabel = `${shown} de ${total} registro(s)`;
    else countLabel = `${total} registro(s)`;
    return `<i class="fa-solid fa-compact-disc me-1"></i>${countLabel}${this.escapeHtml(extra)}`;
  },

  renderShell() {
    const rows = this.getFilteredRows();
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Mantenimiento de llantas</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="mll-count">${this.badgeText(rows.length, this._rows.length)}</span>
          <div class="d-flex flex-wrap align-items-end gap-2">
            ${this.renderVehiculoFilterHtml()}
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-mll-imprimir">
              <i class="fa-solid fa-print me-1"></i>Imprimir reporte
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-mll-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
          </div>
        </div>
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="mll-search"
              placeholder="Buscar por placa, llanta, encargado, detalles…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
            <button type="button" class="btn btn-outline-secondary" id="btn-mll-search-clear" title="Limpiar">
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
                <th class="text-center">Llanta</th>
                <th>Detalles</th>
                <th class="text-end">Importe</th>
                <th>Encargado</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="mll-tbody">${this.renderTableBodyHtml(rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-mll-nuevo')}
      </div>`;
  },

  findRow(id) {
    return this._rows.find((r) => String(r.ID) === String(id));
  },

  async fetchRows() {
    const params = { _: String(Date.now()) };
    if (this._filterQuery.trim()) params.q = this._filterQuery.trim();
    if (this._filterVehiculo) params.codvehiculo = this._filterVehiculo;
    const data = await F.fetchJson(this.apiUrl(params), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  apiUrl(extraParams = {}) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/mantenimiento-llantas?${params}`;
  },

  updateTableView() {
    const rows = this.getFilteredRows();
    const tbody = this._container?.querySelector('#mll-tbody');
    const badge = this._container?.querySelector('#mll-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(rows);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(rows.length, this._rows.length);
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo mantenimiento de llantas');
    if (!data) return;
    F.toast('Mantenimiento registrado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar mantenimiento de llantas', row, true, id);
    if (!data) return;
    F.toast('Mantenimiento actualizado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const label = row
      ? `${this.formatFecha(row.FECHA)} · ${this.vehiculoLabel(row)} · Llanta ${row.NOLLANTA || ''}`
      : id;
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
    document.getElementById('btn-mll-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this._filterVehiculo = '';
      this.load(this._container);
    });
    document.getElementById('btn-mll-imprimir')?.addEventListener('click', () => this.imprimirReporte());
    document.getElementById('btn-mll-nuevo')?.addEventListener('click', () => this.onNuevo());

    const filterVehiculo = document.getElementById('mll-filter-vehiculo');
    filterVehiculo?.addEventListener('change', async () => {
      this._filterVehiculo = filterVehiculo.value;
      try {
        await this.fetchRows();
        this.updateTableView();
      } catch (err) {
        F.toast(err.message || 'Error al filtrar', 'error');
      }
    });

    const search = document.getElementById('mll-search');
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
    document.getElementById('btn-mll-search-clear')?.addEventListener('click', () => {
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando mantenimiento de llantas…</div>`;
    try {
      await this.loadLookups();
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
