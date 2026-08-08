/**
 * Vista Credenciales FEL — CRUD sobre dbo.FEL_CREDENCIALES (un registro por EMPNIT)
 * + configuración de adendas Perso1–Perso20 (JSON global).
 */
const CredencialesFelViewBase = createCatalogoEmpresaView({
  slug: 'credenciales-fel',
  apiPath: '/api/credenciales-fel',
  icon: 'fa-key',
  viewTitle: 'Credenciales FEL',
  labelSingular: 'credencial FEL',
  labelPlural: 'credencial(es) FEL',
  idKey: 'EMPNIT',
  dataAttr: 'empnit',
  formWidth: 780,
  maxRecords: 1,
  searchPlaceholder: 'Buscar por usuario, nombre comercial o NIT…',
  searchKeys: ['CERTIFICACION_USUARIO', 'EMISOR_NOMBRECOMECIAL', 'EMISOR_NIT'],
  formFields: [],
  createKeys: [],
  updateKeys: [],
  tableColumns: [
    { key: 'CERTIFICACION_USUARIO', label: 'Usuario certificación' },
    { key: 'EMISOR_NOMBRECOMECIAL', label: 'Nombre comercial' },
    { key: 'EMISOR_NIT', label: 'NIT emisor' },
    { key: 'VENCE_CERTIFICADO', label: 'Vence certificado' },
  ],
  getRowLabel(row) {
    return row?.EMISOR_NOMBRECOMECIAL || row?.CERTIFICACION_USUARIO || row?.EMPNIT || '';
  },
});

const CredencialesFelView = {
  ...CredencialesFelViewBase,

  _adendaSlots: null,
  _adendaOptions: null,

  formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return this.escapeHtml(String(value));
    return d.toLocaleDateString('es-GT');
  },

  dateInputValue(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  },

  formatCell(value, col) {
    if (col?.key === 'VENCE_CERTIFICADO') return this.formatDate(value);
    return CredencialesFelViewBase.formatCell.call(this, value, col);
  },

  inputField(name, label, value, attrs = {}) {
    const req = attrs.required ? 'required' : '';
    const ro = attrs.readonly ? 'readonly' : '';
    const type = attrs.type || 'text';
    const step = attrs.step ? `step="${attrs.step}"` : '';
    const placeholder = attrs.placeholder ? `placeholder="${this.escapeHtml(attrs.placeholder)}"` : '';
    const val = value ?? '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" name="${name}"
        value="${this.escapeHtml(val)}" ${req} ${ro} ${step} ${placeholder}
        autocomplete="off">
    `;
  },

  sectionTitle(text) {
    return `<h6 class="small fw-semibold text-primary mt-2 mb-1">${this.escapeHtml(text)}</h6>`;
  },

  rowCols(cols) {
    const n = cols.length;
    const colClass =
      n === 4 ? 'col-md-3' : n === 3 ? 'col-md-4' : n === 2 ? 'col-md-6' : 'col-12';
    return `
      <div class="row g-2 mb-2">
        ${cols.map((html) => `<div class="${colClass}">${html}</div>`).join('')}
      </div>
    `;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const r = row || {};

    return [
      this.sectionTitle('Certificación'),
      this.rowCols([
        this.inputField('CERTIFICACION_USUARIO', 'Usuario certificación', r.CERTIFICACION_USUARIO, {
          required: true,
        }),
        this.inputField('CERTIFICACION_LLAVE', 'Llave certificación', r.CERTIFICACION_LLAVE, {
          required: !isEdit,
        }),
      ]),
      this.sectionTitle('Firma electrónica'),
      this.rowCols([
        this.inputField('FIRMA_ALIAS', 'Alias firma', r.FIRMA_ALIAS),
        this.inputField('FIRMA_LLAVE', 'Llave firma', r.FIRMA_LLAVE),
        this.inputField('VENCE_CERTIFICADO', 'Vence certificado', this.dateInputValue(r.VENCE_CERTIFICADO), {
          type: 'date',
        }),
      ]),
      this.sectionTitle('Datos del emisor'),
      this.rowCols([
        this.inputField('EMISOR_NIT', 'NIT emisor', r.EMISOR_NIT),
        this.inputField('EMISOR_NOMBRE', 'Nombre emisor', r.EMISOR_NOMBRE),
      ]),
      this.rowCols([
        this.inputField('EMISOR_NOMBRECOMECIAL', 'Nombre comercial', r.EMISOR_NOMBRECOMECIAL),
        this.inputField('EMISOR_CODIGOESTABLECIMIENTO', 'Cód. establecimiento', r.EMISOR_CODIGOESTABLECIMIENTO),
      ]),
      this.rowCols([
        this.inputField('EMISOR_DIRECCION', 'Dirección', r.EMISOR_DIRECCION),
        this.inputField('EMISOR_CODIGOPOSTAL', 'Código postal', r.EMISOR_CODIGOPOSTAL),
      ]),
      this.rowCols([
        this.inputField('EMISOR_DEPARTAMENTO', 'Departamento', r.EMISOR_DEPARTAMENTO),
        this.inputField('EMISOR_MUNICIPIO', 'Municipio', r.EMISOR_MUNICIPIO),
      ]),
      this.rowCols([
        this.inputField('EMISOR_FRASE', 'Frase', r.EMISOR_FRASE, { type: 'number', step: '1' }),
        this.inputField('EMISOR_ESCENARIO', 'Escenario', r.EMISOR_ESCENARIO, { type: 'number', step: '1' }),
        this.inputField('EMISOR_FRASE2', 'Frase 2', r.EMISOR_FRASE2, { type: 'number', step: '1' }),
        this.inputField('EMISOR_ESCENARIO2', 'Escenario 2', r.EMISOR_ESCENARIO2, { type: 'number', step: '1' }),
      ]),
      this.sectionTitle('Resolución y adenda'),
      this.rowCols([
        this.inputField('NIT_RESOLUCION', 'NIT resolución', r.NIT_RESOLUCION),
        this.inputField('NIT_FECHA_RESOLUCION', 'Fecha resolución NIT', r.NIT_FECHA_RESOLUCION),
      ]),
      this.rowCols([
        this.inputField('ADENDA_SUCURSAL', 'Adenda sucursal', r.ADENDA_SUCURSAL),
        this.inputField('ADENDA_TELSUCURSAL', 'Tel. sucursal', r.ADENDA_TELSUCURSAL),
        this.inputField('ADENDA_TELSUPERVISOR', 'Tel. supervisor', r.ADENDA_TELSUPERVISOR),
      ]),
    ].join('');
  },

  readFormData() {
    const names = [
      'CERTIFICACION_USUARIO',
      'CERTIFICACION_LLAVE',
      'FIRMA_ALIAS',
      'FIRMA_LLAVE',
      'EMISOR_CODIGOESTABLECIMIENTO',
      'EMISOR_CODIGOPOSTAL',
      'EMISOR_DEPARTAMENTO',
      'EMISOR_DIRECCION',
      'EMISOR_MUNICIPIO',
      'EMISOR_NOMBRE',
      'EMISOR_NOMBRECOMECIAL',
      'EMISOR_NIT',
      'EMISOR_FRASE',
      'EMISOR_ESCENARIO',
      'EMISOR_FRASE2',
      'EMISOR_ESCENARIO2',
      'NIT_RESOLUCION',
      'NIT_FECHA_RESOLUCION',
      'ADENDA_SUCURSAL',
      'ADENDA_TELSUCURSAL',
      'ADENDA_TELSUPERVISOR',
      'VENCE_CERTIFICADO',
    ];
    const data = {};
    names.forEach((name) => {
      const input = document.querySelector(`.swal2-html-container [name="${name}"]`);
      if (!input) return;
      data[name] = input.value.trim();
    });
    return data;
  },

  mapFormToApi(data, isEdit) {
    const payload = { ...data };
    ['EMISOR_FRASE', 'EMISOR_ESCENARIO', 'EMISOR_FRASE2', 'EMISOR_ESCENARIO2'].forEach((key) => {
      if (payload[key] === '') payload[key] = null;
      else if (payload[key] !== null && payload[key] !== undefined) payload[key] = Number(payload[key]);
    });
    Object.keys(payload).forEach((key) => {
      if (payload[key] === '') payload[key] = null;
    });
    return payload;
  },

  validateForm(data, isEdit) {
    if (!data.CERTIFICACION_USUARIO) return 'El usuario de certificación es obligatorio';
    if (!data.CERTIFICACION_LLAVE) return 'La llave de certificación es obligatoria';
    return null;
  },

  async showForm(title, row = {}, isEdit = false) {
    return CatalogosUI.fireForm({
      title,
      html: this.buildFormHtml(row, isEdit),
      width: 780,
      preConfirm: () => {
        const data = this.readFormData();
        const err = this.validateForm(data, isEdit);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        return this.mapFormToApi(data, isEdit);
      },
    });
  },

  async fetchRowFull(empnit) {
    const data = await F.fetchJson(this.apiBase(`/${encodeURIComponent(empnit)}`));
    return data.row;
  },

  async onNuevo() {
    if (this._rows.length >= 1) {
      F.toast('Ya existe un registro de credenciales FEL para esta empresa', 'warning');
      return;
    }
    const payload = await this.showForm('Nueva credencial FEL');
    if (!payload) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Credencial FEL creada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    try {
      const row = await this.fetchRowFull(id);
      const payload = await this.showForm('Editar credencial FEL', row, true);
      if (!payload) return;
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Credencial FEL actualizada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  adendasApiUrl() {
    return `/api/credenciales-fel/adendas?_=${Date.now()}`;
  },

  defaultAdendaOptions() {
    return [
      { value: '', label: '(Sin asignar)' },
      { value: 'DOCUMENTO_INTERNO', label: 'DOCUMENTO INTERNO' },
      { value: 'EMPLEADO', label: 'EMPLEADO' },
      { value: 'TELEFONO_EMPLEADO', label: 'TELEFONO EMPLEADO' },
      { value: 'FORMA_DE_PAGO', label: 'FORMA DE PAGO' },
      { value: 'EMBARQUE', label: 'EMBARQUE' },
      { value: 'VENCIMIENTO', label: 'VENCIMIENTO' },
      { value: 'TELEFONO_EMPRESA', label: 'TELEFONO EMPRESA' },
      { value: 'OBSERVACIONES', label: 'OBSERVACIONES' },
      { value: 'DIRECCION_ENTREGA', label: 'DIRECCION ENTREGA' },
    ];
  },

  renderCredentialsCard() {
    const html = CredencialesFelViewBase.renderTable.call(this);
    let body = html;
    if (this._rows.length >= 1) {
      body = html.replace(CatalogosUI.btnNuevoFab('btn-credenciales-fel-nuevo'), '');
    }
    // Quitar título duplicado del panel base; el de la vista split ya lo muestra.
    body = body.replace(/<h2 class="catalogo-vista-title[^>]*>[\s\S]*?<\/h2>/, '');
    return `
      <div class="card h-100 credenciales-fel-card">
        <div class="card-header py-2">
          <span class="fw-semibold"><i class="fa-solid fa-key me-2" aria-hidden="true"></i>Credenciales</span>
        </div>
        <div class="card-body p-2 catalogo-vista-wrap">${body}</div>
      </div>
    `;
  },

  renderAdendaSelect(index, selected) {
    const opts = this._adendaOptions || this.defaultAdendaOptions();
    const sel = String(selected || '');
    const optionsHtml = opts
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${sel === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <div class="row g-2 align-items-center mb-2 fel-adenda-row">
        <div class="col-auto">
          <span class="badge text-bg-light border fel-adenda-num">${index}</span>
        </div>
        <div class="col">
          <label class="visually-hidden" for="fel-adenda-${index}">Perso${index}</label>
          <select class="form-select form-select-sm" id="fel-adenda-${index}" data-adenda-slot="${index}">
            ${optionsHtml}
          </select>
        </div>
        <div class="col-auto">
          <span class="small text-muted">Perso${index}</span>
        </div>
      </div>
    `;
  },

  renderAdendasCard() {
    const slots = this._adendaSlots || {};
    const rows = [];
    for (let i = 1; i <= 20; i++) {
      rows.push(this.renderAdendaSelect(i, slots[String(i)] || ''));
    }
    return `
      <div class="card h-100 d-flex flex-column fel-adendas-card">
        <div class="card-header py-2 d-flex justify-content-between align-items-center gap-2">
          <span class="fw-semibold"><i class="fa-solid fa-list-ol me-2" aria-hidden="true"></i>Adendas</span>
          <span class="small text-muted">Perso1–Perso20</span>
        </div>
        <div class="card-body p-3 overflow-auto flex-grow-1" style="max-height: calc(100vh - 14rem);">
          <p class="small text-muted mb-3">
            Configure qué dato del documento se envía en cada adenda personalizada al certificar FEL.
            Los slots vacíos no se envían.
          </p>
          <div class="fel-adendas-list">${rows.join('')}</div>
        </div>
        <div class="card-footer py-2 d-flex justify-content-end">
          <button type="button" class="btn btn-sm btn-primary" id="btn-fel-adendas-guardar">
            <i class="fa-solid fa-floppy-disk me-1" aria-hidden="true"></i>Guardar adendas
          </button>
        </div>
      </div>
    `;
  },

  renderTable() {
    return `
      <div class="catalogo-vista-wrap w-100 credenciales-fel-layout">
        <h2 class="catalogo-vista-title h5 mb-3 px-1">Credenciales FEL</h2>
        <div class="row g-3 align-items-stretch credenciales-fel-split">
          <div class="col-lg-6 d-flex">${this.renderCredentialsCard()}</div>
          <div class="col-lg-6 d-flex">${this.renderAdendasCard()}</div>
        </div>
      </div>
    `;
  },

  collectAdendaSlotsFromDom() {
    const slots = {};
    for (let i = 1; i <= 20; i++) {
      const el = this._container?.querySelector(`#fel-adenda-${i}`);
      slots[String(i)] = String(el?.value || '').trim().toUpperCase();
    }
    return slots;
  },

  async onGuardarAdendas() {
    const slots = this.collectAdendaSlotsFromDom();
    try {
      const res = await F.fetchJson('/api/credenciales-fel/adendas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      this._adendaSlots = res.slots || slots;
      if (res.options) this._adendaOptions = res.options;
      F.toast('Adendas guardadas', 'success');
    } catch (err) {
      F.alert('Error', err.message || 'No se pudieron guardar las adendas', 'error');
    }
  },

  bindAdendas() {
    this._container
      ?.querySelector('#btn-fel-adendas-guardar')
      ?.addEventListener('click', () => this.onGuardarAdendas());
  },

  bindEvents() {
    CredencialesFelViewBase.bindEvents.call(this);
    this.bindAdendas();
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function'
        ? F.getMenuNavToken()
        : 0;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      if (
        typeof F !== 'undefined' &&
        typeof F.isMenuNavigationCurrent === 'function' &&
        !F.isMenuNavigationCurrent(navToken)
      ) {
        return;
      }
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando credenciales FEL…
      </div>
    `;

    try {
      const baseUrl = this.apiBase();
      const cacheSep = baseUrl.includes('?') ? '&' : '?';
      const [credData, adendaData] = await Promise.all([
        F.fetchJson(`${baseUrl}${cacheSep}_=${Date.now()}`, { cache: 'no-store' }),
        F.fetchJson(this.adendasApiUrl(), { cache: 'no-store' }),
      ]);
      if (
        typeof F !== 'undefined' &&
        typeof F.isMenuNavigationCurrent === 'function' &&
        !F.isMenuNavigationCurrent(navToken)
      ) {
        return;
      }
      this._rows = credData.rows || [];
      this._adendaSlots = adendaData.slots || {};
      this._adendaOptions = adendaData.options || this.defaultAdendaOptions();
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      if (
        typeof F !== 'undefined' &&
        typeof F.isMenuNavigationCurrent === 'function' &&
        !F.isMenuNavigationCurrent(navToken)
      ) {
        return;
      }
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar credenciales FEL', 'error');
    }
  },
};
