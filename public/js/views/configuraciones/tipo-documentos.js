const TD_FIELD_ID_PREFIX = 'tipo-doc-';

const tipomOptions = [
  { value: '1', label: 'ENTRADA' },
  { value: '-1', label: 'SALIDA' },
  { value: '0', label: 'NEUTRO' },
];

const contableOptions = [
  { value: 'NO', label: 'NO' },
  { value: 'SI', label: 'SI' },
];

const TD_FORM_FIELDS = [
  { key: 'CODDOC', label: 'Código documento', type: 'text', required: true, readonlyOnEdit: true },
  { key: 'CORRELATIVO', label: 'Correlativo', type: 'number', step: '1' },
  { key: 'DESDOC', label: 'Descripción', type: 'text', required: true },
  { key: 'TIPODOC', label: 'Tipo documento', type: 'select', options: [] },
  { key: 'TIPOM', label: 'Tipo Inventario', type: 'select', options: tipomOptions },
  { key: 'FORMATO', label: 'Formato', type: 'text' },
  { key: 'CODFORMATOCON', label: 'Formato contado', type: 'select', options: [] },
  { key: 'CODFORMATOCRE', label: 'Formato crédito', type: 'select', options: [] },
  { key: 'CONTABLE', label: 'Contable', type: 'select', options: contableOptions },
  { key: 'REPORTES', label: 'Reportes', type: 'select', options: contableOptions },
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

function formatoLabel(value, lookups) {
  const code = String(value ?? '').trim();
  if (!code) return '—';
  const found = (lookups?.formatos || []).find((f) => String(f.value).trim() === code);
  return found ? found.label : code;
}

function validateTipoDocumentoForm(data, isEdit) {
  if (!isEdit && !String(data.CODDOC ?? '').trim()) return 'El código de documento es obligatorio';
  if (!String(data.DESDOC ?? '').trim()) return 'La descripción es obligatoria';
  const contable = String(data.CONTABLE || 'NO').trim().toUpperCase() === 'SI';
  if (contable) {
    const con = String(data.CODFORMATOCON ?? '').trim();
    const cre = String(data.CODFORMATOCRE ?? '').trim();
    if (!con && !cre) {
      return 'Si es contable, indique al menos un formato contable (contado o crédito)';
    }
  }
  return null;
}

function tipoDocumentosMapFormToApi(data, isEdit) {
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const n = (key) => {
    const x = num(data[key]);
    return Number.isNaN(x) ? null : x;
  };
  const payload = {
    DESDOC: String(data.DESDOC ?? '').trim(),
    TIPODOC: String(data.TIPODOC || '').trim() || null,
    CORRELATIVO: n('CORRELATIVO'),
    FORMATO: String(data.FORMATO || '').trim() || null,
    TIPOM: n('TIPOM'),
    CODFORMATOCON: String(data.CODFORMATOCON || '').trim() || null,
    CODFORMATOCRE: String(data.CODFORMATOCRE || '').trim() || null,
    CONTABLE: String(data.CONTABLE || 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO',
    REPORTES: String(data.REPORTES || 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO',
  };
  if (!isEdit) {
    payload.CODDOC = String(data.CODDOC ?? '').trim().toUpperCase();
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
  searchKeys: ['CODDOC', 'DESDOC', 'TIPODOC', 'FORMATO', 'TIPOM', 'CONTABLE', 'REPORTES', 'ACTIVO'],
  formFields: TD_FORM_FIELDS,
  createKeys: [
    'CODDOC',
    'DESDOC',
    'TIPODOC',
    'CORRELATIVO',
    'FORMATO',
    'TIPOM',
    'CODFORMATOCON',
    'CODFORMATOCRE',
    'CONTABLE',
    'REPORTES',
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
    'CONTABLE',
    'REPORTES',
  ],
  mapFormToApi: tipoDocumentosMapFormToApi,
  validateForm: validateTipoDocumentoForm,
  tableColumns: [
    { key: 'CODDOC', label: 'Código' },
    { key: 'DESDOC', label: 'Descripción' },
    { key: 'TIPODOC', label: 'Tipo doc.' },
    { key: 'TIPOM', label: 'Tipo Inventario' },
    { key: 'FORMATO', label: 'Formato' },
    { key: 'CONTABLE', label: 'Contable' },
    { key: 'REPORTES', label: 'Reportes' },
    { key: 'ACTIVO', label: 'Activo' },
  ],
  getRowLabel(row) {
    return row?.DESDOC || row?.CODDOC || '';
  },
});

const TipoDocumentosView = {
  ...TipoDocumentosViewBase,
  _lookups: null,
  _filterTipodoc: '',

  escapeHtml(value) {
    return TipoDocumentosViewBase.escapeHtml.call(this, value);
  },

  fieldId(key) {
    return `${TD_FIELD_ID_PREFIX}${key}`;
  },

  fieldHtml(f, row, isEdit) {
    if (!f) return '';
    if (!isEdit && f.hideOnNew) return '';
    const req = f.required ? 'required' : '';
    const ro = f.readonlyOnEdit && isEdit ? 'readonly' : '';
    const val = row[f.key] ?? '';
    const inputId = this.fieldId(f.key);

    if (f.type === 'select') {
      const options = f.options || [];
      const strVal = val !== null && val !== undefined ? String(val) : '';
      const hasVal = strVal && options.some((o) => String(o.value) === strVal);
      const legacyOpt =
        strVal && !hasVal
          ? `<option value="${this.escapeHtml(strVal)}" selected>${this.escapeHtml(strVal)} (actual)</option>`
          : '';
      const optsHtml = options
        .map(
          (o) =>
            `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
        )
        .join('');
      return `
        <label class="form-label small mb-0" for="${inputId}">${this.escapeHtml(f.label)}</label>
        <select class="form-select form-select-sm" id="${inputId}" name="${f.key}" ${req} ${ro}>
          <option value="">— Seleccione —</option>
          ${legacyOpt}
          ${optsHtml}
        </select>
      `;
    }

    const inputType = f.type || 'text';
    let displayVal = val;
    if (inputType === 'date' && val) {
      displayVal = String(val).slice(0, 10);
    }
    const step = f.step ? `step="${f.step}"` : '';

    return `
      <label class="form-label small mb-0" for="${inputId}">${this.escapeHtml(f.label)}</label>
      <input type="${inputType}" class="form-control form-control-sm" id="${inputId}" name="${f.key}"
        value="${this.escapeHtml(displayVal)}" ${req} ${ro} ${step} autocomplete="off">
    `;
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
      CONTABLE: String(row.CONTABLE ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO',
      REPORTES: String(row.REPORTES ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO',
    };
  },

  async loadLookups(force = false) {
    if (this._lookups && !force) return this._lookups;
    const ts = Date.now();
    let tiposDoc = [];
    let formatos = [];
    try {
      const res = await F.fetchJson(`/data/config-tipos-documento.json?_=${ts}`, {
        cache: 'no-store',
      });
      tiposDoc = (res.tipos || []).map((r) => ({
        value: String(r.TIPODOC ?? '').trim().toUpperCase(),
        label: `${String(r.TIPODOC ?? '').trim().toUpperCase()} — ${String(r.DESCRIPCION ?? r.TIPODOC ?? '').trim()}`,
      }));
    } catch (err) {
      console.warn('[TipoDocumentos] config-tipos-documento.json:', err);
      try {
        const res = await F.fetchJson(`/api/tipo-documentos/config-tipos?_=${ts}`, {
          cache: 'no-store',
        });
        tiposDoc = (res.rows || []).map((r) => ({
          value: String(r.TIPODOC ?? '').trim().toUpperCase(),
          label: `${String(r.TIPODOC ?? '').trim().toUpperCase()} — ${String(r.DESCRIPCION ?? r.TIPODOC ?? '').trim()}`,
        }));
      } catch (err2) {
        console.warn('[TipoDocumentos] API config-tipos:', err2);
      }
    }
    try {
      const emp = F.getEmpNit();
      if (emp) {
        const res = await F.fetchJson(
          `/api/formatos-contables?empnit=${encodeURIComponent(emp)}&_=${ts}`,
          { cache: 'no-store' }
        );
        formatos = (res.rows || []).map((r) => {
          const cod = String(r.CODFORMATO ?? '').trim();
          const des = String(r.DESFORMATO ?? '').trim();
          return {
            value: cod,
            label: des ? `${cod} — ${des}` : cod,
          };
        });
      }
    } catch (err) {
      console.warn('[TipoDocumentos] formatos-contables:', err);
    }
    this._lookups = { tiposDoc, formatos };
    return this._lookups;
  },

  formFieldsWithLookups() {
    const L = this._lookups || { tiposDoc: [], formatos: [] };
    return TD_FORM_FIELDS.map((f) => {
      if (f.key === 'TIPODOC') return { ...f, options: L.tiposDoc };
      if (f.key === 'CODFORMATOCON' || f.key === 'CODFORMATOCRE') {
        return { ...f, options: L.formatos };
      }
      return f;
    });
  },

  formatCell(value, col) {
    if (col?.key === 'TIPOM') return this.escapeHtml(tipomLabel(value));
    if (col?.key === 'CONTABLE' || col?.key === 'REPORTES') {
      return this.escapeHtml(String(value ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO');
    }
    if (col?.key === 'TIPODOC') {
      return this.escapeHtml(tipoDocLabel(value, this._lookups));
    }
    if (col?.key === 'CODFORMATOCON' || col?.key === 'CODFORMATOCRE') {
      return this.escapeHtml(formatoLabel(value, this._lookups));
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

  getFilteredRows() {
    let rows = TipoDocumentosViewBase.getFilteredRows.call(this);
    const tipodoc = String(this._filterTipodoc ?? '').trim().toUpperCase();
    if (tipodoc) {
      rows = rows.filter((r) => String(r.TIPODOC ?? '').trim().toUpperCase() === tipodoc);
    }
    return rows;
  },

  badgeText(filteredCount, totalCount) {
    const empNombre = F.getEmpNitNombre() || '';
    const badgeExtra = empNombre ? ` · ${empNombre}` : '';
    const filtering =
      this._filterQuery.trim() || String(this._filterTipodoc ?? '').trim();
    const countLabel =
      filtering && filteredCount !== totalCount
        ? `${filteredCount} de ${totalCount} tipo(s) documento`
        : `${totalCount} tipo(s) documento`;
    return `<i class="fa-solid fa-file-lines me-1"></i>${countLabel}${this.escapeHtml(badgeExtra)}`;
  },

  tipodocFilterOptionsHtml() {
    const selected = String(this._filterTipodoc ?? '').trim().toUpperCase();
    const fromLookups = (this._lookups?.tiposDoc || []).map((t) => ({
      value: String(t.value ?? '').trim().toUpperCase(),
      label: String(t.label ?? t.value ?? '').trim(),
    }));
    const fromRows = [...new Set(
      (this._rows || [])
        .map((r) => String(r.TIPODOC ?? '').trim().toUpperCase())
        .filter(Boolean)
    )].map((code) => ({
      value: code,
      label: tipoDocLabel(code, this._lookups),
    }));
    const byValue = new Map();
    [...fromLookups, ...fromRows].forEach((opt) => {
      if (!opt.value || byValue.has(opt.value)) return;
      byValue.set(opt.value, opt);
    });
    const options = [...byValue.values()].sort((a, b) => a.value.localeCompare(b.value));
    return [
      `<option value=""${selected ? '' : ' selected'}>Todos</option>`,
      ...options.map(
        (o) =>
          `<option value="${this.escapeHtml(o.value)}"${o.value === selected ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
      ),
    ].join('');
  },

  renderTable() {
    const columns = [
      { key: 'CODDOC', label: 'Código' },
      { key: 'DESDOC', label: 'Descripción' },
      { key: 'TIPODOC', label: 'Tipo doc.' },
      { key: 'TIPOM', label: 'Tipo Inventario' },
      { key: 'FORMATO', label: 'Formato' },
      { key: 'CONTABLE', label: 'Contable' },
      { key: 'REPORTES', label: 'Reportes' },
      { key: 'ACTIVO', label: 'Activo' },
    ];
    const headers = [
      ...columns.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');
    const filtered = this.getFilteredRows();

    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap tipo-documentos-wrap">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="tipo-documentos-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-tipo-documentos-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="tipo-documentos-filters px-1 mb-2">
          <select class="form-select form-select-sm tipo-documentos-filter-tipodoc" id="tipo-documentos-filter-tipodoc"
            title="Tipo documento" aria-label="Tipo documento">
            ${this.tipodocFilterOptionsHtml()}
          </select>
          <div class="input-group input-group-sm catalogo-empresa-search tipo-documentos-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="tipo-documentos-search"
              placeholder="${this.escapeHtml('Buscar por código, descripción, tipo…')}"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-tipo-documentos-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody id="tipo-documentos-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-tipo-documentos-nuevo')}
      </div>
    `;
  },

  renderTableBodyHtml(rows) {
    const columns = [
      { key: 'CODDOC', label: 'Código' },
      { key: 'DESDOC', label: 'Descripción' },
      { key: 'TIPODOC', label: 'Tipo doc.' },
      { key: 'TIPOM', label: 'Tipo Inventario' },
      { key: 'FORMATO', label: 'Formato' },
      { key: 'CONTABLE', label: 'Contable' },
      { key: 'REPORTES', label: 'Reportes' },
      { key: 'ACTIVO', label: 'Activo' },
    ];
    const colSpan = columns.length + 1;
    if (!rows.length) {
      const msg =
        this._filterQuery.trim() || String(this._filterTipodoc ?? '').trim()
          ? 'Ningún registro coincide con el filtro'
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
    const fields = this.formFieldsWithLookups();
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]));
    const field = (key) => this.fieldHtml(byKey[key], r, isEdit);

    return [
      this.rowCols([field('CODDOC'), field('CORRELATIVO')]),
      this.rowCols([field('DESDOC')]),
      this.rowCols([field('TIPODOC'), field('TIPOM'), field('FORMATO')]),
      this.rowCols([field('CODFORMATOCON'), field('CODFORMATOCRE')]),
      this.rowCols([field('CONTABLE'), field('REPORTES')]),
    ].join('');
  },

  readFormData() {
    const data = {};
    this.formFieldsWithLookups().forEach((field) => {
      const el = document.getElementById(this.fieldId(field.key));
      if (!el || el.disabled) return;
      data[field.key] = String(el.value ?? '').trim();
    });
    return data;
  },

  async showForm(title, row = {}, isEdit = false) {
    await this.loadLookups(true);
    const view = this;
    const existingRows = this._rows || [];
    return CatalogosUI.fireForm({
      title,
      html: view.buildFormHtml(row, isEdit),
      width: 780,
      didOpen: (popup) => {
        if (!isEdit) {
          popup?.querySelector(`#${TD_FIELD_ID_PREFIX}CODDOC`)?.focus();
        }
      },
      preConfirm: () => {
        const data = view.readFormData();
        const validateErr = validateTipoDocumentoForm(data, isEdit);
        if (validateErr) {
          Swal.showValidationMessage(validateErr);
          return false;
        }
        if (!isEdit) {
          const cod = String(data.CODDOC ?? '').trim().toUpperCase();
          const dup = existingRows.some(
            (r) => String(r.CODDOC ?? '').trim().toUpperCase() === cod
          );
          if (dup) {
            Swal.showValidationMessage(`Ya existe un tipo de documento con el código "${cod}"`);
            return false;
          }
        }
        return tipoDocumentosMapFormToApi(data, isEdit);
      },
    });
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo tipo documento', {}, false);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Tipo documento creado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar tipo documento', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Tipo documento actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: `${nombre} (${id})`,
      tipo: 'tipo documento',
      kind: 'registro',
      title: '¿Eliminar tipo documento?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong> (${this.escapeHtml(id)})</p>`,
      passText: 'Ingrese la clave de administrador para eliminar el tipo de documento.',
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('Tipo documento eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindEvents() {
    TipoDocumentosViewBase.bindEvents.call(this);
    this._container?.querySelector('#tipo-documentos-filter-tipodoc')?.addEventListener('change', (e) => {
      this._filterTipodoc = e.target.value;
      this.updateTableView();
    });
    const refreshBtn = document.getElementById('btn-tipo-documentos-refresh');
    if (refreshBtn) {
      const clone = refreshBtn.cloneNode(true);
      refreshBtn.replaceWith(clone);
      clone.addEventListener('click', () => {
        this._filterQuery = '';
        this._filterTipodoc = '';
        this.load(this._container);
      });
    }
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function'
        ? F.getMenuNavToken()
        : 0;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');
    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando tipo(s) documento…
      </div>
    `;
    this._lookups = null;
    try {
      await this.loadLookups(true);
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
        return;
      }
      return TipoDocumentosViewBase.load.call(this, container);
    } catch (err) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
        return;
      }
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar tipo documentos: ${this.escapeHtml(err.message || 'Error')}
        </div>
      `;
      F.toast('Error al cargar tipo documentos', 'error');
    }
  },
};
