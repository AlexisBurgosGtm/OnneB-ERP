/**
 * Vista Registro de Kilometrajes — CRUD sobre dbo.VEHICULOS_KILOMETRAJES.
 */
const KILOMETRAJES_COMBUSTIBLE_OPTIONS = [
  { value: 'DIESEL', label: 'DIESEL' },
  { value: 'SUPER', label: 'SUPER' },
  { value: 'REGULAR', label: 'REGULAR' },
  { value: 'PREMIUM', label: 'PREMIUM' },
];

const KilometrajesView = {
  _container: null,
  _rows: [],
  _filterQuery: '',
  _filterFechaIni: '',
  _filterFechaFin: '',
  _filterVehiculo: '',
  _vehiculos: [],
  _empleados: [],
  _plataformas: [],

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
    const base = `/api/kilometrajes${path}`;
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
    this._filterVehiculo = '';
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

  formatKm(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 2 });
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

  empleadoOptionLabel(e) {
    return e.NOMEMPLEADO || `Empleado #${e.CODEMP}`;
  },

  plataformaOptionLabel(p) {
    const placa = p.NOPLACA ? `${p.NOPLACA} — ` : '';
    return `${placa}${p.PLATAFORMA || `Plataforma #${p.CODPLATAFORMA}`}`;
  },

  plataformaLabel(row) {
    if (!row?.CODPLATAFORMA) return '—';
    const placa = row.PLATAFORMA_PLACA ? `${row.PLATAFORMA_PLACA} — ` : '';
    return `${placa}${row.PLATAFORMA_NOMBRE || `#${row.CODPLATAFORMA}`}`;
  },

  vehiculoFilterLabel() {
    if (!this._filterVehiculo) return 'Todos los vehículos';
    const v = this._vehiculos.find((x) => String(x.CODVEHICULO) === String(this._filterVehiculo));
    return v ? this.vehiculoOptionLabel(v) : `Vehículo #${this._filterVehiculo}`;
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

  calcVehiculoTotals(items) {
    const sorted = this.sortRowsChrono(items);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const kmsIniFirst = Number(first?.KMS_INICIAL) || 0;
    const kmsIniLast = Number(last?.KMS_INICIAL) || 0;
    const kmsRecorridos = Math.round((kmsIniLast - kmsIniFirst) * 1000) / 1000;
    const galones = sorted.reduce((s, r) => s + (Number(r.GALONES_COMBUSTIBLE) || 0), 0);
    const importe = sorted.reduce((s, r) => s + (Number(r.IMPORTE_COMBUSTIBLE) || 0), 0);
    const viaticos = sorted.reduce((s, r) => s + (Number(r.VIATICOS) || 0), 0);
    return { kmsRecorridos, galones, importe, viaticos, count: sorted.length };
  },

  renderFiltersHtml() {
    const vehiculoOptions = [
      '<option value="">Todos los vehículos</option>',
      ...this._vehiculos.map((v) => {
        const val = String(v.CODVEHICULO);
        const sel = String(this._filterVehiculo) === val ? ' selected' : '';
        return `<option value="${this.escapeHtml(val)}"${sel}>${this.escapeHtml(this.vehiculoOptionLabel(v))}</option>`;
      }),
    ].join('');
    return `
      <div class="km-filter-fecha">
        <label class="form-label small mb-0" for="km-filter-fechaini">Fecha inicial</label>
        <input type="date" id="km-filter-fechaini" class="form-control form-control-sm"
          value="${this.escapeHtml(this.dateInputValue(this._filterFechaIni))}">
      </div>
      <div class="km-filter-fecha">
        <label class="form-label small mb-0" for="km-filter-fechafin">Fecha final</label>
        <input type="date" id="km-filter-fechafin" class="form-control form-control-sm"
          value="${this.escapeHtml(this.dateInputValue(this._filterFechaFin))}">
      </div>
      <div class="mll-filter-vehiculo">
        <label class="form-label small mb-0" for="km-filter-vehiculo">Vehículo</label>
        <select id="km-filter-vehiculo" class="form-select form-select-sm">${vehiculoOptions}</select>
      </div>`;
  },

  async imprimirReporte() {
    if (typeof PrintReport === 'undefined') {
      F.toast('Impresión no disponible', 'warning');
      return;
    }
    const rows = this.sortRowsChrono(this._rows);
    if (!rows.length) {
      F.toast('No hay registros para imprimir', 'warning');
      return;
    }

    const groups = this.groupRowsByVehiculo(rows);
    const hoy = this.formatFecha(this.todayIsoDate());
    const filtroVehiculo = this.vehiculoFilterLabel();
    const rango = `${this.formatFecha(this._filterFechaIni)} — ${this.formatFecha(this._filterFechaFin)}`;
    let grandKms = 0;
    let grandGalones = 0;
    let grandImporte = 0;
    let grandViaticos = 0;
    let grandCount = 0;

    const sections = groups
      .map((group) => {
        const vehLabel = this.vehiculoLabel(group.vehiculo);
        const totals = this.calcVehiculoTotals(group.items);
        grandKms += totals.kmsRecorridos;
        grandGalones += totals.galones;
        grandImporte += totals.importe;
        grandViaticos += totals.viaticos;
        grandCount += totals.count;
        const bodyRows = group.items
          .map(
            (r) => `<tr>
              <td>${PrintReport.escapeHtml(this.formatFecha(r.FECHA))}</td>
              <td>${PrintReport.escapeHtml(r.NOMEMPLEADO || '—')}</td>
              <td>${PrintReport.escapeHtml(this.plataformaLabel(r))}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatKm(r.KMS_INICIAL))}</td>
              <td class="text-center">${PrintReport.escapeHtml(r.TIPO_COMBUSTIBLE || '—')}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatKm(r.GALONES_COMBUSTIBLE))}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.IMPORTE_COMBUSTIBLE))}</td>
              <td class="text-end">${PrintReport.escapeHtml(this.formatMoney(r.VIATICOS))}</td>
            </tr>`
          )
          .join('');
        return `
          <section class="km-report-section">
            <h2 class="km-report-vehiculo">${PrintReport.escapeHtml(vehLabel)}</h2>
            <table class="km-report-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Empleado</th>
                  <th>Plataforma</th>
                  <th class="text-end">Km inicial</th>
                  <th class="text-center">Combustible</th>
                  <th class="text-end">Galones</th>
                  <th class="text-end">Importe</th>
                  <th class="text-end">Viáticos</th>
                </tr>
              </thead>
              <tbody>${bodyRows}</tbody>
              <tfoot>
                <tr class="totals">
                  <td colspan="3" class="text-end"><strong>Total — Km recorridos (${totals.count} registro(s))</strong></td>
                  <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatKm(totals.kmsRecorridos))}</strong></td>
                  <td></td>
                  <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatKm(totals.galones))}</strong></td>
                  <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(totals.importe))}</strong></td>
                  <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(totals.viaticos))}</strong></td>
                </tr>
              </tfoot>
            </table>
          </section>`;
      })
      .join('');

    const bodyHtml = `
      ${PrintReport.reportHeaderHtml({
        title: 'Registro de Kilometrajes',
        subtitleHtml: `
          <p><strong>Fecha reporte:</strong> ${PrintReport.escapeHtml(hoy)}</p>
          <p><strong>Período:</strong> ${PrintReport.escapeHtml(rango)}</p>
          <p><strong>Filtro vehículo:</strong> ${PrintReport.escapeHtml(filtroVehiculo)}</p>
          <p><strong>Total registros:</strong> ${grandCount}</p>
        `,
      })}
      ${sections}
      <table class="km-report-table km-report-grand">
        <tfoot>
          <tr class="totals">
            <td colspan="3" class="text-end"><strong>Total general — Km recorridos</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatKm(grandKms))}</strong></td>
            <td></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatKm(grandGalones))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(grandImporte))}</strong></td>
            <td class="text-end"><strong>${PrintReport.escapeHtml(this.formatMoney(grandViaticos))}</strong></td>
          </tr>
        </tfoot>
      </table>`;

    await PrintReport.openAndPrint(
      () =>
        PrintReport.wrapDocument({
          title: 'Registro de Kilometrajes',
          bodyHtml,
          extraStyles: `
        .km-report-section{margin-bottom:1.25rem;page-break-inside:avoid}
        .km-report-vehiculo{font-size:13px;margin:0 0 .35rem;padding:.35rem .5rem;background:#f0f0f0;border:1px solid #ccc}
        .km-report-table{font-size:11px;width:100%;border-collapse:collapse}
        .km-report-grand{margin-top:.5rem}
        .km-report-table th,.km-report-table td{padding:4px 6px;border:1px solid #ddd}
        .km-report-table .totals td{background:#f8f8f8}
      `,
        }),
      'width=900,height=700'
    );
  },

  async loadLookups() {
    const [vehiculosData, empleadosData, plataformasData] = await Promise.all([
      F.fetchJson(`${this.apiBase('/lookups/vehiculos')}&_=${Date.now()}`, { cache: 'no-store' }),
      F.fetchJson(`${this.apiBase('/lookups/empleados')}&_=${Date.now()}`, { cache: 'no-store' }),
      F.fetchJson(`${this.apiBase('/lookups/plataformas')}&_=${Date.now()}`, { cache: 'no-store' }),
    ]);
    this._vehiculos = vehiculosData.rows || [];
    this._empleados = empleadosData.rows || [];
    this._plataformas = plataformasData.rows || [];
    return { vehiculos: this._vehiculos, empleados: this._empleados, plataformas: this._plataformas };
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
      <label class="form-label small mb-0" for="km-${name}">${this.escapeHtml(label)}</label>
      <select id="km-${name}" name="${name}" class="form-select form-select-sm" ${req}>
        <option value="">— Seleccione —</option>
        ${opts}
      </select>`;
  },

  fieldInput(name, label, value, { type = 'text', required = false, step, readonly = false } = {}) {
    const req = required ? 'required' : '';
    const ro = readonly ? 'readonly' : '';
    const stepAttr = step ? ` step="${step}"` : '';
    const displayVal = type === 'date' ? String(value || '').slice(0, 10) : (value ?? '');
    return `
      <label class="form-label small mb-0" for="km-${name}">${this.escapeHtml(label)}</label>
      <input type="${type}" id="km-${name}" name="${name}" class="form-control form-control-sm${readonly ? ' bg-light' : ''}"
        value="${this.escapeHtml(displayVal)}" ${req} ${ro}${stepAttr}>`;
  },

  fieldMoneyInput(name, label, value, { required = false, step = '0.01' } = {}) {
    const req = required ? 'required' : '';
    const displayVal = value ?? '';
    return `
      <label class="form-label small mb-0" for="km-${name}">${this.escapeHtml(label)}</label>
      <div class="input-group input-group-sm">
        <span class="input-group-text">Q</span>
        <input type="number" id="km-${name}" name="${name}" class="form-control form-control-sm"
          value="${this.escapeHtml(displayVal)}" ${req} step="${step}">
      </div>`;
  },

  buildFormHtml(row = {}) {
    const vehiculoOpts = this._vehiculos.map((v) => ({
      value: v.CODVEHICULO,
      label: this.vehiculoOptionLabel(v),
    }));
    const empleadoOpts = this._empleados.map((e) => ({
      value: e.CODEMP,
      label: this.empleadoOptionLabel(e),
    }));
    const plataformaOpts = this._plataformas.map((p) => ({
      value: p.CODPLATAFORMA,
      label: this.plataformaOptionLabel(p),
    }));

    const pair = (col1, col2) => `
      <div class="row g-2 mb-2">
        <div class="col-6">${col1}</div>
        <div class="col-6">${col2}</div>
      </div>`;

    return `
      ${pair(
        this.selectField('CODVEHICULO', 'Vehículo', vehiculoOpts, row.CODVEHICULO, true),
        this.selectField('CODEMP', 'Empleado', empleadoOpts, row.CODEMP, true)
      )}
      ${pair(
        this.fieldInput('FECHA', 'Fecha', row.FECHA || this.todayIsoDate(), { type: 'date', required: true }),
        this.selectField('TIPO_COMBUSTIBLE', 'Tipo combustible', KILOMETRAJES_COMBUSTIBLE_OPTIONS, row.TIPO_COMBUSTIBLE, true)
      )}
      ${pair(
        this.fieldInput('KMS_INICIAL', 'Km inicial', row.KMS_INICIAL ?? '', { type: 'number', step: '0.01', required: true }),
        this.fieldMoneyInput('VIATICOS', 'Viáticos', row.VIATICOS ?? 0)
      )}
      ${pair(
        this.fieldInput('GALONES_COMBUSTIBLE', 'Galones combustible', row.GALONES_COMBUSTIBLE ?? 0, { type: 'number', step: '0.01' }),
        this.fieldMoneyInput('IMPORTE_COMBUSTIBLE', 'Importe combustible', row.IMPORTE_COMBUSTIBLE ?? 0)
      )}
      <div class="mb-2">
        ${this.selectField('CODPLATAFORMA', 'Plataforma', plataformaOpts, row.CODPLATAFORMA, false)}
      </div>
      <div class="mb-2">
        <label class="form-label small mb-0" for="km-OBS">Observaciones</label>
        <textarea id="km-OBS" name="OBS" class="form-control form-control-sm" rows="3"
          maxlength="500">${this.escapeHtml(row.OBS || '')}</textarea>
      </div>`;
  },

  readFormData() {
    const get = (name) => document.querySelector(`.swal2-html-container [name="${name}"]`)?.value?.trim() ?? '';
    return {
      CODVEHICULO: get('CODVEHICULO'),
      CODEMP: get('CODEMP'),
      CODPLATAFORMA: get('CODPLATAFORMA'),
      FECHA: get('FECHA'),
      TIPO_COMBUSTIBLE: get('TIPO_COMBUSTIBLE'),
      KMS_INICIAL: get('KMS_INICIAL'),
      GALONES_COMBUSTIBLE: get('GALONES_COMBUSTIBLE'),
      IMPORTE_COMBUSTIBLE: get('IMPORTE_COMBUSTIBLE'),
      VIATICOS: get('VIATICOS'),
      OBS: get('OBS'),
    };
  },

  validateForm(data) {
    if (!data.CODVEHICULO) return 'Seleccione el vehículo';
    if (!data.CODEMP) return 'Seleccione el empleado';
    if (!data.FECHA) return 'La fecha es obligatoria';
    if (!data.TIPO_COMBUSTIBLE) return 'Seleccione el tipo de combustible';
    const tipo = String(data.TIPO_COMBUSTIBLE).trim().toUpperCase();
    if (!KILOMETRAJES_COMBUSTIBLE_OPTIONS.some((o) => o.value === tipo)) {
      return 'Tipo de combustible inválido';
    }
    const ini = Number(data.KMS_INICIAL);
    if (!Number.isFinite(ini)) return 'Kilometraje inicial inválido';
    return null;
  },

  mapFormToApi(data) {
    const toNum = (v, fallback = null) => {
      if (v === '' || v === null || v === undefined) return fallback;
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    const codPlataforma = data.CODPLATAFORMA ? Number(data.CODPLATAFORMA) : null;
    return {
      CODVEHICULO: Number(data.CODVEHICULO),
      CODEMP: Number(data.CODEMP),
      CODPLATAFORMA: Number.isFinite(codPlataforma) ? codPlataforma : null,
      FECHA: data.FECHA,
      TIPO_COMBUSTIBLE: String(data.TIPO_COMBUSTIBLE).trim().toUpperCase(),
      KMS_INICIAL: toNum(data.KMS_INICIAL, 0),
      GALONES_COMBUSTIBLE: toNum(data.GALONES_COMBUSTIBLE, 0),
      IMPORTE_COMBUSTIBLE: toNum(data.IMPORTE_COMBUSTIBLE, 0),
      VIATICOS: toNum(data.VIATICOS, 0),
      OBS: data.OBS || null,
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
      F.alert('Sin vehículos', 'Registre vehículos antes de capturar kilometrajes.', 'warning');
      return null;
    }
    if (!this._empleados.length) {
      F.alert('Sin empleados', 'Registre empleados de tipo TRANSPORTE activos antes de capturar kilometrajes.', 'warning');
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
        : 'Sin registros de kilometraje en el período seleccionado';
      return `<tr><td colspan="9" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map(
        (row) => `<tr>
          <td class="text-nowrap">${this.escapeHtml(this.formatFecha(row.FECHA))}</td>
          <td>${this.escapeHtml(this.vehiculoLabel(row))}</td>
          <td>${this.escapeHtml(this.plataformaLabel(row))}</td>
          <td>${this.escapeHtml(row.NOMEMPLEADO || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatKm(row.KMS_INICIAL))}</td>
          <td class="text-center">${this.escapeHtml(row.TIPO_COMBUSTIBLE || '—')}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(row.IMPORTE_COMBUSTIBLE))}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(row.VIATICOS))}</td>
          <td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td>
        </tr>`
      )
      .join('');
  },

  badgeText(total) {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    return `<i class="fa-solid fa-gauge-high me-1"></i>${total} registro(s)${this.escapeHtml(extra)}`;
  },

  renderShell() {
    const rows = this._rows;
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Registro de Kilometrajes</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-end gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="km-count">${this.badgeText(rows.length)}</span>
          <div class="d-flex flex-wrap align-items-end gap-2">
            ${this.renderFiltersHtml()}
            <button type="button" class="btn btn-sm btn-outline-primary" id="btn-km-imprimir">
              <i class="fa-solid fa-print me-1"></i>Imprimir reporte
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-km-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
          </div>
        </div>
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="km-search"
              placeholder="Buscar por placa, empleado, plataforma, combustible…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
            <button type="button" class="btn btn-outline-secondary" id="btn-km-search-clear" title="Limpiar">
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
                <th>Plataforma</th>
                <th>Empleado</th>
                <th class="text-end">Km inicial</th>
                <th class="text-center">Combustible</th>
                <th class="text-end">Importe</th>
                <th class="text-end">Viáticos</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="km-tbody">${this.renderTableBodyHtml(rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-km-nuevo')}
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
    if (this._filterVehiculo) params.codvehiculo = this._filterVehiculo;
    const data = await F.fetchJson(this.apiUrl(params), { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  apiUrl(extraParams = {}) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/kilometrajes?${params}`;
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#km-tbody');
    const badge = this._container?.querySelector('#km-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(this._rows);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(this._rows.length);
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo registro de kilometraje');
    if (!data) return;
    F.toast('Kilometraje registrado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar registro de kilometraje', row, true, id);
    if (!data) return;
    F.toast('Kilometraje actualizado', 'success');
    await this.fetchRows();
    this.updateTableView();
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const label = row
      ? `${this.formatFecha(row.FECHA)} · ${this.vehiculoLabel(row)}`
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
    document.getElementById('btn-km-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.resetDefaultFilters();
      this.load(this._container);
    });
    document.getElementById('btn-km-imprimir')?.addEventListener('click', () => this.imprimirReporte());
    document.getElementById('btn-km-nuevo')?.addEventListener('click', () => this.onNuevo());

    const applyFilters = async () => {
      const fechaini = document.getElementById('km-filter-fechaini');
      const fechafin = document.getElementById('km-filter-fechafin');
      const vehiculo = document.getElementById('km-filter-vehiculo');
      if (fechaini) this._filterFechaIni = fechaini.value;
      if (fechafin) this._filterFechaFin = fechafin.value;
      if (vehiculo) this._filterVehiculo = vehiculo.value;
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

    document.getElementById('km-filter-fechaini')?.addEventListener('change', () => applyFilters());
    document.getElementById('km-filter-fechafin')?.addEventListener('change', () => applyFilters());
    document.getElementById('km-filter-vehiculo')?.addEventListener('change', () => applyFilters());

    const search = document.getElementById('km-search');
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
    document.getElementById('btn-km-search-clear')?.addEventListener('click', () => {
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando kilometrajes…</div>`;
    try {
      if (!this._filterFechaIni) this.resetDefaultFilters();
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
