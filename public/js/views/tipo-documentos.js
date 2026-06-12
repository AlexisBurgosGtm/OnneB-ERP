const tipomOptions = [
  { value: '1', label: 'ENTRADA' },
  { value: '-1', label: 'SALIDA' },
  { value: '0', label: 'NEUTRO' },
];

function tipomLabel(value) {
  const v = String(value ?? '');
  const found = tipomOptions.find((o) => o.value === v);
  return found ? found.label : v === '' ? '—' : v;
}

function tipoDocLabel(value, lookups) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return '—';
  const found = (lookups?.tiposDoc || []).find((t) => String(t.value).toUpperCase() === code);
  return found ? found.label : code;
}

function validateTipoDocumentoForm(data, isEdit) {
  if (!isEdit && !data.CODDOC) return 'El código de documento es obligatorio';
  if (!data.DESDOC) return 'La descripción es obligatoria';
  return null;
}

function mapFormToApi(data, isEdit) {
  const num = (v) => (v === '' || v === undefined ? null : Number(v));
  const n = (key) => {
    const x = num(data[key]);
    return Number.isNaN(x) ? null : x;
  };
  const payload = {
    DESDOC: data.DESDOC,
    TIPODOC: data.TIPODOC || null,
    CORRELATIVO: n('CORRELATIVO'),
    FORMATO: data.FORMATO || null,
    TIPOM: n('TIPOM'),
    CODFORMATOCON: data.CODFORMATOCON || null,
    CODFORMATOCRE: data.CODFORMATOCRE || null,
  };
  if (!isEdit) {
    payload.CODDOC = data.CODDOC;
    payload.ACTIVO = 'SI';
  }
  return payload;
}

const TipoDocumentosViewBase = createCatalogoEmpresaView({
  slug: 'tipo-documentos',
  apiPath: '/api/tipo-documentos',
  icon: 'fa-file-lines',
  labelSingular: 'tipo documento',
  labelPlural: 'tipo(s) documento',
  idKey: 'CODDOC',
  dataAttr: 'coddoc',
  formWidth: 780,
  searchPlaceholder: 'Buscar por código, descripción, tipo…',
  searchKeys: ['CODDOC', 'DESDOC', 'TIPODOC', 'FORMATO', 'TIPOM', 'ACTIVO'],
  formFields: [],
  createKeys: [
    'CODDOC',
    'DESDOC',
    'TIPODOC',
    'CORRELATIVO',
    'FORMATO',
    'TIPOM',
    'CODFORMATOCON',
    'CODFORMATOCRE',
    'ACTIVO',
  ],
  updateKeys: [
    'DESDOC',
    'TIPODOC',
    'CORRELATIVO',
    'FORMATO',
    'TIPOM',
    'CODFORMATOCON',
    'CODFORMATOCRE',
  ],
  mapFormToApi,
  validateForm: validateTipoDocumentoForm,
  tableColumns: [
    { key: 'CODDOC', label: 'Código' },
    { key: 'DESDOC', label: 'Descripción' },
    { key: 'TIPODOC', label: 'Tipo doc.' },
    { key: 'TIPOM', label: 'Tipo M' },
    { key: 'FORMATO', label: 'Formato' },
    { key: 'ACTIVO', label: 'Activo' },
  ],
  getRowLabel(row) {
    return row?.DESDOC || row?.CODDOC || '';
  },
});

const TipoDocumentosView = {
  ...TipoDocumentosViewBase,
  _lookups: null,

  escapeHtml(value) {
    return TipoDocumentosViewBase.escapeHtml.call(this, value);
  },

  normalizeRowForForm(row = {}) {
    const tipom =
      row.TIPOM !== null && row.TIPOM !== undefined && row.TIPOM !== ''
        ? String(row.TIPOM)
        : '';
    return {
      ...row,
      CODDOC: row.CODDOC ?? '',
      DESDOC: row.DESDOC ?? '',
      TIPODOC: row.TIPODOC ?? '',
      CORRELATIVO: row.CORRELATIVO ?? '',
      FORMATO: row.FORMATO ?? '',
      TIPOM: tipom,
      CODFORMATOCON: row.CODFORMATOCON ?? '',
      CODFORMATOCRE: row.CODFORMATOCRE ?? '',
    };
  },

  async loadLookups() {
    if (this._lookups) return this._lookups;
    const ts = Date.now();
    let tiposDoc = [];
    try {
      const res = await F.fetchJson(`/api/tipo-documentos/config-tipos?_=${ts}`, {
        cache: 'no-store',
      });
      tiposDoc = (res.rows || []).map((r) => ({
        value: String(r.TIPODOC ?? '').trim().toUpperCase(),
        label: `${String(r.TIPODOC ?? '').trim().toUpperCase()} — ${String(r.DESCRIPCION ?? r.TIPODOC ?? '').trim()}`,
      }));
    } catch (err) {
      console.warn('[TipoDocumentos] CONFIG_TIPODOCUMENTOS:', err);
    }
    this._lookups = { tiposDoc };
    return this._lookups;
  },

  formatCell(value, col) {
    if (col?.key === 'TIPOM') return this.escapeHtml(tipomLabel(value));
    if (col?.key === 'TIPODOC') {
      return this.escapeHtml(tipoDocLabel(value, this._lookups));
    }
    return TipoDocumentosViewBase.formatCell.call(this, value, col);
  },

  normalizeActivo(value) {
    return String(value ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
  },

  activoButtonHtml(row) {
    const activo = this.normalizeActivo(row.ACTIVO);
    const cls = activo === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
    return `
      <button type="button" class="btn btn-sm btn-empleado-activo ${cls}"
        data-coddoc="${this.escapeHtml(row.CODDOC)}"
        data-activo="${activo}"
        aria-label="Estado activo: ${activo}. Clic para cambiar"
        title="Clic para cambiar a ${activo === 'SI' ? 'NO' : 'SI'}">
        ${activo}
      </button>
    `;
  },

  renderTableBodyHtml(rows) {
    const columns = [
      { key: 'CODDOC', label: 'Código' },
      { key: 'DESDOC', label: 'Descripción' },
      { key: 'TIPODOC', label: 'Tipo doc.' },
      { key: 'TIPOM', label: 'Tipo M' },
      { key: 'FORMATO', label: 'Formato' },
      { key: 'ACTIVO', label: 'Activo' },
    ];
    const colSpan = columns.length + 1;
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún registro coincide con la búsqueda'
        : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = columns
          .map((c) => {
            if (c.key === 'ACTIVO') {
              return `<td class="text-center">${this.activoButtonHtml(row)}</td>`;
            }
            return `<td>${this.formatCell(row[c.key], c)}</td>`;
          })
          .join('');
        return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row.CODDOC, 'coddoc')}</td></tr>`;
      })
      .join('');
  },

  bindRowActions() {
    TipoDocumentosViewBase.bindRowActions.call(this);
    this.bindActivoButtons();
  },

  bindActivoButtons() {
    if (!this._container) return;
    this._container.querySelectorAll('.btn-empleado-activo[data-coddoc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.coddoc;
        const activo = btn.dataset.activo;
        this.onToggleActivo(id, activo);
      });
    });
  },

  async onToggleActivo(coddoc, activoActual) {
    const row = this.findRow(coddoc);
    if (!row) return;
    const actual = this.normalizeActivo(activoActual);
    const siguiente = actual === 'SI' ? 'NO' : 'SI';
    const nombre = row.DESDOC || coddoc;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Cambiar estado activo?',
      html: `<p class="mb-0">Tipo documento <strong>${this.escapeHtml(nombre)}</strong>: cambiar de <strong>${actual}</strong> a <strong>${siguiente}</strong>.</p>`,
      icon: 'question',
      confirmText: 'Cambiar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(coddoc)}/activo`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ACTIVO: siguiente }),
      });
      row.ACTIVO = siguiente;
      this.updateTableView();
      F.toast(`Estado actualizado a ${siguiente}`, 'success');
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  selectField(name, label, options, value, attrs = {}) {
    const req = attrs.required ? 'required' : '';
    const ro = attrs.readonly ? 'disabled' : '';
    const strVal = value !== null && value !== undefined ? String(value) : '';
    const optsHtml = (options || [])
      .map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      )
      .join('');
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <select class="form-select form-select-sm" name="${name}" ${req} ${ro}>
        <option value="">— Seleccione —</option>
        ${optsHtml}
      </select>
    `;
  },

  inputField(name, label, value, attrs = {}) {
    const req = attrs.required ? 'required' : '';
    const ro = attrs.readonly ? 'readonly' : '';
    const type = attrs.type || 'text';
    const step = attrs.step ? `step="${attrs.step}"` : '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(label)}</label>
      <input type="${type}" class="form-control form-control-sm" name="${name}"
        value="${this.escapeHtml(value ?? '')}" ${req} ${ro} ${step}>
    `;
  },

  rowCols(cols) {
    const n = cols.length;
    const colClass = n === 3 ? 'col-md-4' : n === 2 ? 'col-md-6' : 'col-12';
    return `
      <div class="row g-2 mb-2">
        ${cols.map((html) => `<div class="${colClass}">${html}</div>`).join('')}
      </div>
    `;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const r = this.normalizeRowForForm(row);
    const L = this._lookups || { tiposDoc: [] };

    return [
      this.rowCols([
        this.inputField('CODDOC', 'Código documento', r.CODDOC, {
          required: true,
          readonly: isEdit,
        }),
        this.inputField('CORRELATIVO', 'Correlativo', r.CORRELATIVO, { type: 'number', step: '1' }),
      ]),
      this.rowCols([
        this.inputField('DESDOC', 'Descripción', r.DESDOC, { required: true }),
      ]),
      this.rowCols([
        this.selectField('TIPODOC', 'Tipo documento', L.tiposDoc, r.TIPODOC),
        this.selectField('TIPOM', 'Tipo M', tipomOptions, r.TIPOM),
        this.inputField('FORMATO', 'Formato', r.FORMATO),
      ]),
      this.rowCols([
        this.inputField('CODFORMATOCON', 'Cód. formato cont.', r.CODFORMATOCON),
        this.inputField('CODFORMATOCRE', 'Cód. formato cred.', r.CODFORMATOCRE),
      ]),
    ].join('');
  },

  readFormData() {
    const names = [
      'CODDOC',
      'DESDOC',
      'TIPODOC',
      'CORRELATIVO',
      'FORMATO',
      'TIPOM',
      'CODFORMATOCON',
      'CODFORMATOCRE',
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
    await this.loadLookups();
    const view = this;
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit),
      width: 780,
      preConfirm: () => {
        const data = view.readFormData();
        const validateErr = validateTipoDocumentoForm(data, isEdit);
        if (validateErr) {
          Swal.showValidationMessage(validateErr);
          return false;
        }
        return mapFormToApi(data, isEdit);
      },
    });
  },

  async onNuevo() {
    await this.loadLookups();
    return TipoDocumentosViewBase.onNuevo.call(this);
  },

  async onEditar(id) {
    await this.loadLookups();
    return TipoDocumentosViewBase.onEditar.call(this, id);
  },

  async load(container) {
    await this.loadLookups();
    return TipoDocumentosViewBase.load.call(this, container);
  },
};
