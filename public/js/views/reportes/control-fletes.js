/**
 * Reportes → Control de Fletes — CRUD dbo.CONTROL_FLETES (filtro mes / año / status).
 */
const CF_MESES = [
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

const CF_ANIOS = [];
for (let y = 2020; y <= new Date().getFullYear() + 1; y += 1) {
  CF_ANIOS.push({ value: y, label: String(y) });
}

const CF_STATUS_OPTS = [
  { value: 'PENDIENTE', label: 'PENDIENTE' },
  { value: 'COBRADO', label: 'COBRADO' },
];

const CF_STATUS_FILTRO = [{ value: 'TODOS', label: 'Todos' }, ...CF_STATUS_OPTS];

const CF_MONEY_KEYS = new Set(['TR_FLET', 'COSTO', 'FLETE', 'SALDO']);
const CF_NUM_KEYS = new Set([
  'UGC',
  'TROPICAL',
  'COL_5800',
  'HORCALZA',
  'M_BCO',
  'M_XTRA',
  'M_GRIS',
  'LEVAN',
  'MAX_P',
  'TR_FLET',
  'COSTO',
  'FLETE',
  'SALDO',
]);

function cfNum(v) {
  if (v === '' || v === undefined || v === null) return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cfMapFormToApi(data) {
  return {
    MES: cfNum(data.MES),
    ANIO: cfNum(data.ANIO),
    NOPEDIDO: String(data.NOPEDIDO || '').trim() || null,
    FECHA_ING: String(data.FECHA_ING || '').trim().slice(0, 10) || null,
    FECHA_VEN: String(data.FECHA_VEN || '').trim().slice(0, 10) || null,
    UGC: cfNum(data.UGC),
    TROPICAL: cfNum(data.TROPICAL),
    COL_5800: cfNum(data.COL_5800),
    HORCALZA: cfNum(data.HORCALZA),
    M_BCO: cfNum(data.M_BCO),
    M_XTRA: cfNum(data.M_XTRA),
    M_GRIS: cfNum(data.M_GRIS),
    LEVAN: cfNum(data.LEVAN),
    MAX_P: cfNum(data.MAX_P),
    PLTA: String(data.PLTA || '').trim() || null,
    PLACA: String(data.PLACA || '').trim() || null,
    TR_FLET: cfNum(data.TR_FLET),
    COSTO: cfNum(data.COSTO),
    ABASTO: String(data.ABASTO || '').trim() || null,
    FLETE: cfNum(data.FLETE),
    SALDO: cfNum(data.SALDO),
    STATUS: String(data.STATUS || 'PENDIENTE').trim().toUpperCase(),
  };
}

function cfValidateForm(data) {
  const mes = parseInt(data.MES, 10);
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) return 'Mes inválido (use el filtro del listado)';
  const anio = parseInt(data.ANIO, 10);
  if (!Number.isFinite(anio) || anio < 2000) return 'Año inválido (use el filtro del listado)';
  const st = String(data.STATUS || '').trim().toUpperCase();
  if (!CF_STATUS_OPTS.some((o) => o.value === st)) return 'Status inválido';
  return null;
}

const CF_TABLE_COLUMNS = [
  { key: 'NOPEDIDO', label: 'No. Pedido' },
  { key: 'FECHA_ING', label: 'F. Ing', type: 'date' },
  { key: 'FECHA_VEN', label: 'F. Ven', type: 'date' },
  { key: 'UGC', label: 'UGC', type: 'number', summable: true },
  { key: 'TROPICAL', label: 'Tropical', type: 'number', summable: true },
  { key: 'COL_5800', label: '5800', type: 'number', summable: true },
  { key: 'HORCALZA', label: 'Horcalza', type: 'number', summable: true },
  { key: 'M_BCO', label: 'M BCO', type: 'number', summable: true },
  { key: 'M_XTRA', label: 'M XTRA', type: 'number', summable: true },
  { key: 'M_GRIS', label: 'M GRIS', type: 'number', summable: true },
  { key: 'LEVAN', label: 'Levan', type: 'number', summable: true },
  { key: 'MAX_P', label: 'MAX P', type: 'number', summable: true },
  { key: 'PLTA', label: 'PLTA' },
  { key: 'PLACA', label: 'Placa' },
  { key: 'TR_FLET', label: 'TR Flet', type: 'money', summable: true },
  { key: 'COSTO', label: 'Costo', type: 'money', summable: true },
  { key: 'FLETE', label: 'Flete', type: 'money', summable: true },
  { key: 'SALDO', label: 'Saldo', type: 'money', summable: true },
  { key: 'STATUS', label: 'Status' },
];

const ControlFletesViewBase = createCatalogoEmpresaView({
  slug: 'control-fletes',
  apiPath: '/api/control-fletes',
  icon: 'fa-truck',
  labelSingular: 'flete',
  labelPlural: 'flete(s)',
  idKey: 'ID',
  dataAttr: 'id',
  formWidth: 920,
  viewTitle: 'Control de Fletes',
  panelClass: 'catalogo-empresa-panel control-fletes-panel',
  searchPlaceholder: 'Buscar por pedido, placa, abasto, status…',
  searchKeys: ['NOPEDIDO', 'PLACA', 'PLTA', 'ABASTO', 'STATUS'],
  formFields: [],
  mapFormToApi: cfMapFormToApi,
  validateForm: cfValidateForm,
  tableColumns: CF_TABLE_COLUMNS,
  getRowLabel(row) {
    const ped = String(row?.NOPEDIDO || '').trim();
    const placa = String(row?.PLACA || '').trim();
    if (ped && placa) return `${ped} · ${placa}`;
    return ped || placa || `Flete #${row?.ID ?? ''}`;
  },
});

const ControlFletesView = {
  ...ControlFletesViewBase,
  _mes: null,
  _anio: null,
  _status: 'TODOS',

  defaultPeriod() {
    const now = new Date();
    return { mes: now.getMonth() + 1, anio: now.getFullYear() };
  },

  ensureFilters() {
    if (this._mes == null || this._anio == null) {
      const p = this.defaultPeriod();
      this._mes = p.mes;
      this._anio = p.anio;
    }
    if (!this._status) this._status = 'TODOS';
  },

  optionsHtml(list, selected) {
    return list
      .map(
        (o) =>
          `<option value="${o.value}"${String(selected) === String(o.value) ? ' selected' : ''}>${this.escapeHtml(
            o.label
          )}</option>`
      )
      .join('');
  },

  apiBase(path = '') {
    this.ensureFilters();
    const base = ControlFletesViewBase.apiBase.call(this, path);
    const params = new URLSearchParams();
    if (this._mes != null) params.set('mes', String(this._mes));
    if (this._anio != null) params.set('anio', String(this._anio));
    if (this._status && this._status !== 'TODOS') params.set('status', this._status);
    const qs = params.toString();
    if (!qs) return base;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}${qs}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const amount = n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${this.currencySymbol()} ${amount}`;
  },

  formatNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { maximumFractionDigits: 4 });
  },

  formatCell(value, col) {
    if (value === null || value === undefined || value === '') return '—';
    if (col?.type === 'date') {
      const s = String(value).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [y, m, d] = s.slice(0, 10).split('-');
        return `${d}/${m}/${y}`;
      }
      return this.escapeHtml(s.slice(0, 10));
    }
    if (col?.type === 'money' || CF_MONEY_KEYS.has(col?.key)) {
      return this.formatMoney(value);
    }
    if (col?.type === 'number' || CF_NUM_KEYS.has(col?.key)) {
      return this.formatNumber(value);
    }
    return ControlFletesViewBase.formatCell.call(this, value, col);
  },

  sumColumn(rows, key) {
    return rows.reduce((acc, row) => {
      const n = Number(row?.[key]);
      return acc + (Number.isFinite(n) ? n : 0);
    }, 0);
  },

  summableColumns() {
    return CF_TABLE_COLUMNS.filter((c) => c.summable);
  },

  totalFleteLabelHtml(rows) {
    const total = this.sumColumn(rows, 'FLETE');
    return `<div class="control-fletes-total-flete ms-auto" id="control-fletes-total-flete">
      Total Flete: <strong>${this.escapeHtml(this.formatMoney(total))}</strong>
    </div>`;
  },

  renderFooterHtml(rows) {
    const cells = CF_TABLE_COLUMNS.map((c, idx) => {
      if (c.summable) {
        const total = this.sumColumn(rows, c.key);
        const txt = c.type === 'money' || CF_MONEY_KEYS.has(c.key) ? this.formatMoney(total) : this.formatNumber(total);
        return `<td class="text-end fw-semibold">${txt}</td>`;
      }
      if (idx === 0) return '<td class="fw-semibold">Totales</td>';
      return '<td></td>';
    }).join('');
    return `<tr class="control-fletes-tfoot">${cells}<td></td></tr>`;
  },

  updateTotalsUi(rows) {
    const tfoot = this._container?.querySelector('#control-fletes-tfoot');
    if (tfoot) tfoot.innerHTML = this.renderFooterHtml(rows);
    const label = this._container?.querySelector('#control-fletes-total-flete');
    if (label) {
      const total = this.sumColumn(rows, 'FLETE');
      label.innerHTML = `Total Flete: <strong>${this.escapeHtml(this.formatMoney(total))}</strong>`;
    }
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#control-fletes-tbody');
    const badge = this._container?.querySelector('#control-fletes-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) {
      badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
    }
    this.updateTotalsUi(filtered);
  },

  renderTableBodyHtml(rows) {
    const colSpan = CF_TABLE_COLUMNS.length + 1;
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = CF_TABLE_COLUMNS.map((c) => {
          const align =
            c.type === 'money' || c.type === 'number' || CF_MONEY_KEYS.has(c.key) || CF_NUM_KEYS.has(c.key)
              ? ' class="text-end"'
              : '';
          return `<td${align}>${this.formatCell(row[c.key], c)}</td>`;
        }).join('');
        return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td></tr>`;
      })
      .join('');
  },

  renderTable() {
    this.ensureFilters();
    const filtered = this.getFilteredRows();
    const headers = [
      ...CF_TABLE_COLUMNS.map((c) => {
        const align =
          c.type === 'money' || c.type === 'number' || CF_MONEY_KEYS.has(c.key) || CF_NUM_KEYS.has(c.key)
            ? ' class="text-end"'
            : '';
        return `<th scope="col"${align}>${this.escapeHtml(c.label)}</th>`;
      }),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');

    return `
      <div class="catalogo-empresa-panel control-fletes-panel catalogo-vista-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Control de Fletes</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="control-fletes-count">${this.badgeText(
            filtered.length,
            this._rows.length
          )}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-control-fletes-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        ${this.renderFiltersHtml(filtered)}
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="control-fletes-search"
              placeholder="${this.escapeHtml('Buscar por pedido, placa, abasto, status…')}" value="${this.escapeHtml(
                this._filterQuery
              )}"
              autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-control-fletes-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped control-fletes-table">
            <thead><tr>${headers}</tr></thead>
            <tbody id="control-fletes-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
            <tfoot id="control-fletes-tfoot">${this.renderFooterHtml(filtered)}</tfoot>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-control-fletes-nuevo')}
      </div>
    `;
  },

  inputField(name, label, value, type = 'text', extra = '') {
    let display = value ?? '';
    if (type === 'date' && display) display = String(display).slice(0, 10);
    if ((type === 'number' || type === 'money') && (display === null || display === undefined)) display = '';
    const inputType = type === 'money' ? 'number' : type;
    const step = type === 'money' || type === 'number' ? 'step="any"' : '';
    if (type === 'money') {
      const sym = this.currencySymbol();
      return `
      <div class="mb-2">
        <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
        <div class="input-group input-group-sm">
          <span class="input-group-text control-fletes-money-prefix">${this.escapeHtml(sym)}</span>
          <input type="number" class="form-control form-control-sm" name="${name}"
            value="${this.escapeHtml(display)}" step="any" ${extra}>
        </div>
      </div>`;
    }
    return `
      <div class="mb-2">
        <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
        <input type="${inputType}" class="form-control form-control-sm" name="${name}"
          value="${this.escapeHtml(display)}" ${step} ${extra}>
      </div>`;
  },

  currencySymbol() {
    return 'Q';
  },

  selectField(name, label, options, value) {
    return `
      <div class="mb-2">
        <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
        <select class="form-select form-select-sm" name="${name}">
          ${this.optionsHtml(options, value)}
        </select>
      </div>`;
  },

  defaultNewRow() {
    this.ensureFilters();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return {
      MES: this._mes,
      ANIO: this._anio,
      NOPEDIDO: '',
      FECHA_ING: iso,
      FECHA_VEN: '',
      UGC: '',
      TROPICAL: '',
      COL_5800: '',
      HORCALZA: '',
      M_BCO: '',
      M_XTRA: '',
      M_GRIS: '',
      LEVAN: '',
      MAX_P: '',
      PLTA: '',
      PLACA: '',
      TR_FLET: '',
      COSTO: '',
      ABASTO: '',
      FLETE: '',
      SALDO: '',
      STATUS: 'PENDIENTE',
    };
  },

  buildFormHtml(row = {}) {
    const r = { ...this.defaultNewRow(), ...row };
    return `
      <div class="control-fletes-form d-flex flex-column gap-2">
        <div class="card control-fletes-card">
          <div class="card-body py-2 px-3">
            <div class="row g-2">
              <div class="col-md-4">${this.inputField('NOPEDIDO', 'No. Pedido', r.NOPEDIDO)}</div>
              <div class="col-md-4">${this.inputField('FECHA_ING', 'Fecha ingreso', r.FECHA_ING, 'date')}</div>
              <div class="col-md-4">${this.inputField('FECHA_VEN', 'Fecha vencimiento', r.FECHA_VEN, 'date')}</div>
            </div>
          </div>
        </div>
        <div class="card control-fletes-card">
          <div class="card-body py-2 px-3">
            <div class="row g-2">
              <div class="col-md-3 col-6">${this.inputField('UGC', 'UGC', r.UGC, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('TROPICAL', 'Tropical', r.TROPICAL, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('COL_5800', '5800', r.COL_5800, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('HORCALZA', 'Horcalza', r.HORCALZA, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('M_BCO', 'M BCO', r.M_BCO, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('M_XTRA', 'M XTRA', r.M_XTRA, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('M_GRIS', 'M GRIS', r.M_GRIS, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('LEVAN', 'Levan', r.LEVAN, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('MAX_P', 'MAX P', r.MAX_P, 'number')}</div>
              <div class="col-md-3 col-6">${this.inputField('PLTA', 'PLTA', r.PLTA)}</div>
            </div>
          </div>
        </div>
        <div class="card control-fletes-card">
          <div class="card-body py-2 px-3">
            <div class="row g-2">
              <div class="col-md-3">${this.inputField('PLACA', 'Placa', r.PLACA)}</div>
              <div class="col-md-3">${this.inputField('TR_FLET', 'TR Flet', r.TR_FLET, 'money')}</div>
              <div class="col-md-3">${this.inputField('COSTO', 'Costo', r.COSTO, 'money')}</div>
              <div class="col-md-3">${this.inputField('FLETE', 'Flete', r.FLETE, 'money')}</div>
              <div class="col-12">${this.inputField('ABASTO', 'Abasto', r.ABASTO)}</div>
            </div>
          </div>
        </div>
      </div>`;
  },

  readFormData(_profile, popup) {
    const root = popup || document;
    const names = [
      'NOPEDIDO',
      'FECHA_ING',
      'FECHA_VEN',
      'UGC',
      'TROPICAL',
      'COL_5800',
      'HORCALZA',
      'M_BCO',
      'M_XTRA',
      'M_GRIS',
      'LEVAN',
      'MAX_P',
      'PLTA',
      'PLACA',
      'TR_FLET',
      'COSTO',
      'ABASTO',
      'FLETE',
    ];
    const data = {};
    names.forEach((name) => {
      const el = root.querySelector(`[name="${name}"]`);
      data[name] = el ? String(el.value ?? '').trim() : '';
    });
    return data;
  },

  async showForm(title, row = {}, isEdit = false) {
    this.ensureFilters();
    const view = this;
    const hidden = {
      MES: isEdit && row.MES != null ? row.MES : this._mes,
      ANIO: isEdit && row.ANIO != null ? row.ANIO : this._anio,
      STATUS: isEdit && row.STATUS ? String(row.STATUS).toUpperCase() : 'PENDIENTE',
      SALDO: isEdit ? row.SALDO : null,
    };
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row),
      width: 920,
      preConfirm(popup) {
        const data = {
          ...view.readFormData('full', popup),
          MES: hidden.MES,
          ANIO: hidden.ANIO,
          STATUS: hidden.STATUS,
          SALDO: hidden.SALDO,
        };
        const err = cfValidateForm(data);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        return cfMapFormToApi(data);
      },
    });
  },

  renderFiltersHtml(rows = null) {
    this.ensureFilters();
    const list = rows == null ? this.getFilteredRows() : rows;
    return `
      <div class="control-fletes-filters d-flex flex-wrap align-items-end gap-2 px-1 mb-2">
        <div>
          <label class="form-label small mb-0" for="cf-mes">Mes</label>
          <select id="cf-mes" class="form-select form-select-sm">${this.optionsHtml(CF_MESES, this._mes)}</select>
        </div>
        <div>
          <label class="form-label small mb-0" for="cf-anio">Año</label>
          <select id="cf-anio" class="form-select form-select-sm">${this.optionsHtml(CF_ANIOS, this._anio)}</select>
        </div>
        <div>
          <label class="form-label small mb-0" for="cf-status">Status</label>
          <select id="cf-status" class="form-select form-select-sm">${this.optionsHtml(
            CF_STATUS_FILTRO,
            this._status
          )}</select>
        </div>
        ${this.totalFleteLabelHtml(list)}
      </div>`;
  },

  bindFilterEvents() {
    const reload = () => {
      const mesEl = this._container?.querySelector('#cf-mes');
      const anioEl = this._container?.querySelector('#cf-anio');
      const stEl = this._container?.querySelector('#cf-status');
      this._mes = parseInt(mesEl?.value, 10) || this.defaultPeriod().mes;
      this._anio = parseInt(anioEl?.value, 10) || this.defaultPeriod().anio;
      this._status = String(stEl?.value || 'TODOS').toUpperCase();
      this.load(this._container);
    };
    this._container?.querySelector('#cf-mes')?.addEventListener('change', reload);
    this._container?.querySelector('#cf-anio')?.addEventListener('change', reload);
    this._container?.querySelector('#cf-status')?.addEventListener('change', reload);
  },

  bindEvents() {
    ControlFletesViewBase.bindEvents.call(this);
    this.bindFilterEvents();
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo flete', this.defaultNewRow());
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Flete creado', 'success');
      if (data.MES) this._mes = data.MES;
      if (data.ANIO) this._anio = data.ANIO;
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar flete', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Flete actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};
