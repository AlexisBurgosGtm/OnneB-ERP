/**
 * Vista Vehículos — CRUD sobre dbo.VEHICULOS filtrado por EMPNIT.
 */
const VEHICULOS_TIPO_OPTIONS = [
  { value: 'SEDAN', label: 'SEDAN' },
  { value: 'PICKUP', label: 'PICKUP' },
  { value: 'CABEZAL', label: 'CABEZAL' },
  { value: 'PLATAFORMA', label: 'PLATAFORMA' },
];

const VEHICULOS_FORM_FIELDS = [
  { key: 'CODVEHICULO', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
  { key: 'PLACA', label: 'Placa', required: true },
  { key: 'TIPO', label: 'Tipo', type: 'select', required: true, options: VEHICULOS_TIPO_OPTIONS },
  { key: 'DESCRIPCION', label: 'Descripción' },
  { key: 'MARCA', label: 'Marca' },
  { key: 'LINEA', label: 'Línea' },
  { key: 'MODELO', label: 'Modelo (año)', type: 'number' },
  { key: 'CHASIS', label: 'Chasis' },
  { key: 'MOTOR', label: 'Motor' },
  { key: 'NIT', label: 'NIT' },
  { key: 'TITULAR', label: 'Titular' },
  { key: 'KILOMETRAJE_INICIAL', label: 'Kilometraje inicial', type: 'number', step: '0.01' },
  { key: 'KILOMETRAJE_ACTUAL', label: 'Kilometraje actual', type: 'number', step: '0.01' },
  { key: 'F_ACEITE', label: 'Fecha aceite', type: 'date' },
  { key: 'F_SERVICIO', label: 'Fecha servicio', type: 'date' },
];

function vehiculosMapFormToApi(data) {
  const toNum = (v) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    PLACA: String(data.PLACA || '').trim().toUpperCase(),
    TIPO: data.TIPO,
    DESCRIPCION: data.DESCRIPCION || null,
    MARCA: data.MARCA || null,
    LINEA: data.LINEA || null,
    MODELO: toNum(data.MODELO),
    CHASIS: data.CHASIS || null,
    MOTOR: data.MOTOR || null,
    NIT: data.NIT || null,
    TITULAR: data.TITULAR || null,
    KILOMETRAJE_INICIAL: toNum(data.KILOMETRAJE_INICIAL),
    KILOMETRAJE_ACTUAL: toNum(data.KILOMETRAJE_ACTUAL),
    F_ACEITE: data.F_ACEITE || null,
    F_SERVICIO: data.F_SERVICIO || null,
  };
}

function vehiculosValidateForm(data) {
  if (!data.PLACA) return 'La placa es obligatoria';
  if (!data.TIPO) return 'Seleccione el tipo de vehículo';
  const tipo = String(data.TIPO).trim().toUpperCase();
  if (!VEHICULOS_TIPO_OPTIONS.some((o) => o.value === tipo)) {
    return 'TIPO debe ser SEDAN, PICKUP, CABEZAL o PLATAFORMA';
  }
  return null;
}

const VehiculosViewBase = createCatalogoEmpresaView({
  slug: 'vehiculos',
  apiPath: '/api/vehiculos',
  icon: 'fa-car',
  labelSingular: 'vehículo',
  labelPlural: 'vehículo(s)',
  viewTitle: 'Vehículos',
  idKey: 'CODVEHICULO',
  dataAttr: 'codvehiculo',
  formWidth: 680,
  searchPlaceholder: 'Buscar por placa, descripción, marca, tipo, titular…',
  searchKeys: [
    'CODVEHICULO',
    'PLACA',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'TIPO',
    'TITULAR',
    'CHASIS',
    'MOTOR',
    'NIT',
  ],
  formFields: VEHICULOS_FORM_FIELDS,
  createKeys: [
    'PLACA',
    'TIPO',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'NIT',
    'TITULAR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
  ],
  updateKeys: [
    'PLACA',
    'TIPO',
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'NIT',
    'TITULAR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
  ],
  allowEmpty: [
    'DESCRIPCION',
    'MARCA',
    'LINEA',
    'MODELO',
    'CHASIS',
    'MOTOR',
    'NIT',
    'TITULAR',
    'KILOMETRAJE_INICIAL',
    'KILOMETRAJE_ACTUAL',
    'F_ACEITE',
    'F_SERVICIO',
  ],
  mapFormToApi: vehiculosMapFormToApi,
  validateForm: vehiculosValidateForm,
  tableColumns: [
    { key: 'CODVEHICULO', label: 'Código', type: 'number' },
    { key: 'PLACA', label: 'Placa' },
    { key: 'TIPO', label: 'Tipo' },
    { key: 'DESCRIPCION', label: 'Descripción' },
    { key: 'MARCA', label: 'Marca' },
    { key: 'LINEA', label: 'Línea' },
    { key: 'MODELO', label: 'Modelo', type: 'number' },
    { key: 'TITULAR', label: 'Titular' },
    { key: 'KILOMETRAJE_ACTUAL', label: 'Km actual', type: 'number' },
  ],
  getRowLabel(row) {
    return row?.PLACA || row?.DESCRIPCION || '';
  },
});

const VehiculosView = {
  ...VehiculosViewBase,

  fieldDef(key) {
    return VEHICULOS_FORM_FIELDS.find((f) => f.key === key);
  },

  buildFormHtml(row = {}, isEdit = false) {
    const field = (key) => this.fieldHtml(this.fieldDef(key), row, isEdit);

    const pair = (key1, key2) => {
      const html1 = field(key1);
      const html2 = field(key2);
      if (!html1 && !html2) return '';
      return `
        <div class="row g-2 mb-2">
          <div class="col-6">${html1 || ''}</div>
          <div class="col-6">${html2 || ''}</div>
        </div>`;
    };

    return `
      ${pair('PLACA', 'TIPO')}
      ${pair('DESCRIPCION', 'MARCA')}
      ${pair('LINEA', 'MODELO')}
      ${pair('CHASIS', 'MOTOR')}
      ${pair('NIT', 'TITULAR')}
      ${pair('KILOMETRAJE_INICIAL', 'KILOMETRAJE_ACTUAL')}
      ${pair('F_ACEITE', 'F_SERVICIO')}
    `;
  },

  readFormData() {
    const data = {};
    VEHICULOS_FORM_FIELDS.forEach((fieldDef) => {
      const input = document.querySelector(`.swal2-html-container [name="${fieldDef.key}"]`);
      if (!input) return;
      data[fieldDef.key] = input.value.trim();
    });
    return data;
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
    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit),
      width: 680,
      preConfirm: async () => {
        const data = view.readFormData();
        const err = vehiculosValidateForm(data);
        if (err) {
          Swal.showValidationMessage(err);
          return false;
        }
        const payload = vehiculosMapFormToApi(data);
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

  async onNuevo() {
    const data = await this.showForm('Nuevo vehículo');
    if (!data) return;
    F.toast('Vehículo creado', 'success');
    await this.load(this._container);
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar vehículo', row, true, id);
    if (!data) return;
    F.toast('Vehículo actualizado', 'success');
    await this.load(this._container);
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar vehículo?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar el vehículo.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Vehículo eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};
