/**
 * Vista Credenciales FEL — CRUD sobre dbo.FEL_CREDENCIALES (un registro por EMPNIT).
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

  renderTable() {
    const html = CredencialesFelViewBase.renderTable.call(this);
    if (this._rows.length >= 1) {
      return html.replace(CatalogosUI.btnNuevoFab('btn-credenciales-fel-nuevo'), '');
    }
    return html;
  },
};
