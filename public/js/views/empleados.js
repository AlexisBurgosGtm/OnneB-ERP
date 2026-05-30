/**
 * Vista Empleados — formulario con combos (tipos, municipios, departamentos, rutas).
 */

function empleadosValidateForm(data) {
  if (!data.NOMEMPLEADO) return 'El nombre es obligatorio';
  return null;
}

function empleadosMapFormToApi(data) {
  const num = (v) => (v === '' || v === undefined ? null : Number(v));
  const n = (key) => {
    const x = num(data[key]);
    return Number.isNaN(x) ? null : x;
  };
  return {
    NOMEMPLEADO: data.NOMEMPLEADO,
    CODTIPOEMPLEADO: n('CODTIPOEMPLEADO'),
    DPI: data.DPI || null,
    IGSS: data.IGSS || null,
    DIRECCION: data.DIRECCION || null,
    CODMUNICIPIO: n('CODMUNICIPIO'),
    CODDEPTO: n('CODDEPTO'),
    TELEFONOS: data.TELEFONOS || null,
    WHATSAPP: data.WHATSAPP || null,
    EMAIL: data.EMAIL || null,
    ACTIVO: data.ACTIVO || null,
    CLAVE: data.CLAVE || null,
    LATITUD: data.LATITUD || null,
    LONGITUD: data.LONGITUD || null,
    CODRUTA: n('CODRUTA'),
    CODCATALOGO: data.CODCATALOGO || null,
    CODDOC_REC: data.CODDOC_REC || null,
  };
}

const EmpleadosViewBase = createCatalogoEmpresaView({
  slug: 'empleados',
  apiPath: '/api/empleados',
  icon: 'fa-user-tie',
  labelSingular: 'empleado',
  labelPlural: 'empleado(s)',
  idKey: 'CODEMPLEADO',
  dataAttr: 'codempleado',
  formWidth: 580,
  searchPlaceholder: 'Buscar por nombre, DPI, teléfono, email…',
  searchKeys: ['CODEMPLEADO', 'NOMEMPLEADO', 'DPI', 'TELEFONOS', 'EMAIL', 'ACTIVO'],
  formFields: [],
  mapFormToApi: empleadosMapFormToApi,
  validateForm: empleadosValidateForm,
  tableColumns: [
    { key: 'CODEMPLEADO', label: 'Código', type: 'number' },
    { key: 'NOMEMPLEADO', label: 'Nombre' },
    { key: 'DPI', label: 'DPI' },
    { key: 'ACTIVO', label: 'Activo' },
    { key: 'TELEFONOS', label: 'Teléfono' },
    { key: 'EMAIL', label: 'Email' },
    { key: 'CODRUTA', label: 'Ruta', type: 'number' },
  ],
  getRowLabel(row) {
    return row?.NOMEMPLEADO || '';
  },
});

const activoOptions = [
  { value: 'SI', label: 'SI' },
  { value: 'NO', label: 'NO' },
];

const EmpleadosView = {
  ...EmpleadosViewBase,
  _lookups: null,

  escapeHtml(value) {
    return EmpleadosViewBase.escapeHtml.call(this, value);
  },

  normalizeRowForForm(row = {}) {
    return {
      ...row,
      CODEMPLEADO: row.CODEMPLEADO ?? '',
      CODTIPOEMPLEADO: row.CODTIPOEMPLEADO ?? '',
      NOMEMPLEADO: row.NOMEMPLEADO ?? '',
      DPI: row.DPI ?? '',
      IGSS: row.IGSS ?? '',
      DIRECCION: row.DIRECCION ?? '',
      CODDEPTO: row.CODDEPTO ?? '',
      CODMUNICIPIO: row.CODMUNICIPIO ?? '',
      TELEFONOS: row.TELEFONOS ?? '',
      WHATSAPP: row.WHATSAPP ?? '',
      EMAIL: row.EMAIL ?? '',
      ACTIVO: row.ACTIVO || 'SI',
      CODRUTA: row.CODRUTA ?? '',
      CLAVE: row.CLAVE ?? '',
      CODCATALOGO: row.CODCATALOGO ?? '',
      CODDOC_REC: row.CODDOC_REC ?? '',
    };
  },

  async loadLookups() {
    if (this._lookups) return this._lookups;
    const ts = Date.now();
    const empNit = F.getEmpNit();
    const rutasUrl = empNit
      ? `/api/rutas?empnit=${encodeURIComponent(empNit)}&_=${ts}`
      : `/api/rutas?_=${ts}`;

    const [tiposRes, muniRes, deptRes, rutasRes] = await Promise.all([
      F.fetchJson(`/data/tipos-empleado.json?_=${ts}`, { cache: 'no-store' }),
      F.fetchJson(`/api/municipios?_=${ts}`, { cache: 'no-store' }),
      F.fetchJson(`/api/departamentos?_=${ts}`, { cache: 'no-store' }),
      F.fetchJson(rutasUrl, { cache: 'no-store' }),
    ]);

    const tiposRaw = Array.isArray(tiposRes) ? tiposRes : tiposRes.items || [];
    this._lookups = {
      tipos: tiposRaw.map((t) => ({
        value: String(t.value),
        label: `${t.value} — ${t.label || t.code}`,
      })),
      municipios: (muniRes.rows || []).map((m) => ({
        value: String(m.CODMUNICIPIO),
        label: String(m.DESMUNICIPIO || '').trim() || String(m.CODMUNICIPIO),
      })),
      departamentos: (deptRes.rows || []).map((d) => ({
        value: String(d.CODDEPARTAMENTO),
        label: String(d.DESDEPARTAMENTO || '').trim() || String(d.CODDEPARTAMENTO),
      })),
      rutas: (rutasRes.rows || []).map((r) => ({
        value: String(r.CODRUTA),
        label: String(r.DESRUTA || '').trim() || String(r.CODRUTA),
      })),
    };
    return this._lookups;
  },

  selectField(name, label, options, value, required = false) {
    const strVal = value !== null && value !== undefined ? String(value) : '';
    const req = required ? 'required' : '';
    const optsHtml = (options || [])
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <select class="form-select form-select-sm" name="${name}" ${req}>
        <option value="">— Seleccione —</option>
        ${optsHtml}
      </select>
    `;
  },

  inputField(name, label, value, opts = {}) {
    const { type = 'text', readonly = false, step = '' } = opts;
    const ro = readonly ? 'readonly' : '';
    const stepAttr = step ? `step="${step}"` : '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" name="${name}"
        value="${this.escapeHtml(value ?? '')}" ${ro} ${stepAttr}>
    `;
  },

  row2(col1, col2) {
    return `
      <div class="row g-2 mb-2">
        <div class="col-6">${col1}</div>
        <div class="col-6">${col2}</div>
      </div>
    `;
  },

  fieldBlock(html) {
    return `<div class="mb-2">${html}</div>`;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const r = this.normalizeRowForForm(row);
    const L = this._lookups || { tipos: [], municipios: [], departamentos: [], rutas: [] };

    const codigoHtml = isEdit
      ? this.inputField('CODEMPLEADO', 'Código', r.CODEMPLEADO, { type: 'number', readonly: true })
      : '<p class="small text-muted mb-0">El código se asignará al guardar.</p>';

    const parts = [
      this.row2(codigoHtml, this.selectField('CODTIPOEMPLEADO', 'Tipo empleado', L.tipos, r.CODTIPOEMPLEADO)),
      this.fieldBlock(this.inputField('NOMEMPLEADO', 'Nombre', r.NOMEMPLEADO)),
      this.row2(this.inputField('DPI', 'DPI', r.DPI), this.inputField('IGSS', 'IGSS', r.IGSS)),
      this.fieldBlock(this.inputField('DIRECCION', 'Dirección', r.DIRECCION)),
      this.fieldBlock(this.selectField('CODDEPTO', 'Departamento', L.departamentos, r.CODDEPTO)),
      this.fieldBlock(this.selectField('CODMUNICIPIO', 'Municipio', L.municipios, r.CODMUNICIPIO)),
      this.fieldBlock(this.selectField('CODRUTA', 'Ruta', L.rutas, r.CODRUTA)),
      this.row2(
        this.inputField('TELEFONOS', 'Teléfonos', r.TELEFONOS),
        this.inputField('WHATSAPP', 'WhatsApp', r.WHATSAPP)
      ),
      this.fieldBlock(this.inputField('EMAIL', 'Email', r.EMAIL, { type: 'email' })),
      this.fieldBlock(this.selectField('ACTIVO', 'Activo', activoOptions, r.ACTIVO)),
      this.row2(
        this.inputField('CLAVE', 'Clave', r.CLAVE),
        this.inputField('CODCATALOGO', 'Cód. catálogo', r.CODCATALOGO)
      ),
      this.fieldBlock(this.inputField('CODDOC_REC', 'Doc. recibo', r.CODDOC_REC)),
    ];

    return parts.join('');
  },

  readFormData() {
    const names = [
      'CODEMPLEADO',
      'CODTIPOEMPLEADO',
      'NOMEMPLEADO',
      'DPI',
      'IGSS',
      'DIRECCION',
      'CODDEPTO',
      'CODMUNICIPIO',
      'TELEFONOS',
      'WHATSAPP',
      'EMAIL',
      'ACTIVO',
      'CODRUTA',
      'CLAVE',
      'CODCATALOGO',
      'CODDOC_REC',
    ];
    const data = {};
    names.forEach((name) => {
      const input = document.querySelector(`.swal2-html-container [name="${name}"]`);
      if (!input) return;
      data[name] = input.value.trim();
    });
    return data;
  },

  async showForm(title, row = {}, isEdit = false) {
    try {
      await this.loadLookups();
    } catch (err) {
      F.alert('Error', `No se pudieron cargar catálogos: ${err.message}`, 'error');
      return null;
    }

    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit),
      width: 580,
      preConfirm() {
        try {
          const data = view.readFormData();
          const err = empleadosValidateForm(data, isEdit);
          if (err) {
            Swal.showValidationMessage(err);
            return false;
          }
          return empleadosMapFormToApi(data);
        } catch (e) {
          Swal.showValidationMessage(e.message || 'Error al validar el formulario');
          return false;
        }
      },
    });
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar empleado', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Empleado actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};

/** Tipos de empleado (para reutilizar en otras vistas). */
window.OnnebTiposEmpleado = {
  async load() {
    const data = await F.fetchJson(`/data/tipos-empleado.json?_=${Date.now()}`, { cache: 'no-store' });
    return Array.isArray(data) ? data : data.items || [];
  },
  label(value) {
    const v = String(value ?? '');
    const found = (window._onnebTiposEmpleadoCache || []).find((t) => String(t.value) === v);
    return found ? found.label : v || '—';
  },
};

window.OnnebTiposEmpleado.load().then((items) => {
  window._onnebTiposEmpleadoCache = items;
}).catch(() => {
  window._onnebTiposEmpleadoCache = [];
});
