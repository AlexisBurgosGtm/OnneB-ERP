/**
 * Vista Nomenclatura Contable — CRUD dbo.CONTA_CUENTAS por empresa.
 */
const NC_TABLE_COLUMNS = [
  { key: 'CODCUENTA', label: 'Código' },
  { key: 'DESCRIPCION', label: 'Descripción' },
  { key: 'NIVEL', label: 'Nivel', type: 'number' },
  { key: 'DA', label: 'Naturaleza' },
  { key: 'PD', label: 'Tipo' },
  { key: 'ESTFIN', label: 'Estado fin.' },
  { key: 'TIPOEF', label: 'Tipo EF' },
  { key: 'ACTIVO', label: 'Activo' },
];

const daOptions = [
  { value: 'D', label: 'D — Deudora' },
  { value: 'A', label: 'A — Acreedora' },
];

const pdOptions = [
  { value: 'P', label: 'P — Padre (agrupación)' },
  { value: 'D', label: 'D — Detalle (movimiento)' },
];

const estfinOptions = [
  { value: 'ACTIVO', label: 'ACTIVO' },
  { value: 'PASIVO', label: 'PASIVO' },
  { value: 'CAPITAL', label: 'CAPITAL' },
  { value: 'INGRESOS', label: 'INGRESOS' },
  { value: 'GASTOS', label: 'GASTOS' },
  { value: 'COSTOS', label: 'COSTOS' },
];

const tipoefOptions = [
  { value: 'BG', label: 'BG — Balance General' },
  { value: 'ER', label: 'ER — Estado de Resultados' },
];

const activoOptions = [
  { value: 'SI', label: 'SI' },
  { value: 'NO', label: 'NO' },
];

const NC_FORM_FIELDS = [
  { key: 'CODCUENTA', label: 'Código cuenta', type: 'text', required: true, readonlyOnEdit: true },
  { key: 'DESCRIPCION', label: 'Descripción', type: 'text', required: true },
  { key: 'NIVEL', label: 'Nivel', type: 'number', required: true, step: '1' },
  { key: 'DA', label: 'Naturaleza (DA)', type: 'select', required: true, options: daOptions },
  { key: 'PD', label: 'Tipo cuenta (PD)', type: 'select', required: true, options: pdOptions },
  { key: 'ESTFIN', label: 'Estado financiero', type: 'select', required: true, options: estfinOptions },
  { key: 'TIPOEF', label: 'Tipo EF', type: 'select', required: true, options: tipoefOptions },
  { key: 'ACTIVO', label: 'Activo', type: 'select', required: true, options: activoOptions },
];

function daLabel(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (v === 'D') return 'Deudora';
  if (v === 'A') return 'Acreedora';
  return v || '—';
}

function pdLabel(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (v === 'P') return 'Padre';
  if (v === 'D') return 'Detalle';
  return v || '—';
}

function tipoefLabel(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (v === 'BG') return 'Balance General';
  if (v === 'ER') return 'Estado de Resultados';
  return v || '—';
}

function nomenclaturaMapFormToApi(data, isEdit) {
  const payload = {
    CODCUENTA: String(data.CODCUENTA ?? '').trim(),
    DESCRIPCION: String(data.DESCRIPCION ?? '').trim(),
    NIVEL: Number(data.NIVEL),
    DA: String(data.DA ?? '').trim().toUpperCase(),
    PD: String(data.PD ?? '').trim().toUpperCase(),
    ESTFIN: String(data.ESTFIN ?? '').trim().toUpperCase(),
    TIPOEF: String(data.TIPOEF ?? '').trim().toUpperCase(),
    ACTIVO: String(data.ACTIVO || 'SI').trim().toUpperCase(),
  };
  if (isEdit) delete payload.CODCUENTA;
  return payload;
}

function validateContaCuentaForm(data, isEdit, existingRows) {
  if (!isEdit && !String(data.CODCUENTA ?? '').trim()) {
    return 'El código de cuenta es obligatorio';
  }
  if (!String(data.DESCRIPCION ?? '').trim()) return 'La descripción es obligatoria';
  const nivel = Number(data.NIVEL);
  if (Number.isNaN(nivel) || nivel < 1 || nivel > 9) {
    return 'El nivel debe estar entre 1 y 9';
  }
  if (!data.DA) return 'Seleccione la naturaleza (DA)';
  if (!data.PD) return 'Seleccione si es cuenta padre o detalle (PD)';
  if (!data.ESTFIN) return 'Seleccione el estado financiero';
  if (!data.TIPOEF) return 'Seleccione el tipo de estado financiero';
  if (!isEdit && data.CODCUENTA) {
    const cod = String(data.CODCUENTA).trim().toUpperCase();
    const dup = (existingRows || []).some(
      (r) => String(r.CODCUENTA ?? '').trim().toUpperCase() === cod
    );
    if (dup) return `Ya existe la cuenta "${data.CODCUENTA.trim()}"`;
  }
  return null;
}

const NomenclaturaContableViewBase = createCatalogoEmpresaView({
  slug: 'nomenclatura-contable',
  apiPath: '/api/nomenclatura-contable',
  icon: 'fa-sitemap',
  labelSingular: 'cuenta contable',
  labelPlural: 'cuenta(s) contable(s)',
  idKey: 'ID',
  dataAttr: 'id',
  formWidth: 680,
  searchPlaceholder: 'Buscar por código, descripción, estado financiero…',
  searchKeys: ['CODCUENTA', 'DESCRIPCION', 'ESTFIN', 'TIPOEF', 'DA', 'PD', 'ACTIVO', 'NIVEL'],
  formFields: NC_FORM_FIELDS,
  createKeys: ['CODCUENTA', 'DESCRIPCION', 'NIVEL', 'DA', 'PD', 'ESTFIN', 'TIPOEF', 'ACTIVO'],
  updateKeys: ['DESCRIPCION', 'NIVEL', 'DA', 'PD', 'ESTFIN', 'TIPOEF', 'ACTIVO'],
  mapFormToApi: nomenclaturaMapFormToApi,
  validateForm: validateContaCuentaForm,
  tableColumns: NC_TABLE_COLUMNS,
  getRowLabel(row) {
    return row?.DESCRIPCION || row?.CODCUENTA || '';
  },
});

const NomenclaturaContableView = {
  ...NomenclaturaContableViewBase,
  _filterTipoef: '',

  normalizeRowForForm(row = {}) {
    return {
      CODCUENTA: row.CODCUENTA ?? '',
      DESCRIPCION: row.DESCRIPCION ?? '',
      NIVEL: row.NIVEL != null ? String(row.NIVEL) : '4',
      DA: String(row.DA ?? 'D').trim().toUpperCase(),
      PD: String(row.PD ?? 'D').trim().toUpperCase(),
      ESTFIN: String(row.ESTFIN ?? 'ACTIVO').trim().toUpperCase(),
      TIPOEF: String(row.TIPOEF ?? 'BG').trim().toUpperCase(),
      ACTIVO: String(row.ACTIVO ?? 'SI').trim().toUpperCase(),
    };
  },

  ncFormRow2(col1, col2) {
    return `
      <div class="row g-2 mb-2 nc-form-row">
        <div class="col-sm-6">${col1}</div>
        <div class="col-sm-6">${col2}</div>
      </div>
    `;
  },

  ncFormFieldBlock(html) {
    return html ? `<div class="nc-form-field">${html}</div>` : '';
  },

  buildFormHtml(row = {}, isEdit = false) {
    const r = this.normalizeRowForForm(row);
    const fieldHtml = (f) => NomenclaturaContableViewBase.fieldHtml.call(this, f, r, isEdit);
    const field = (f) => this.ncFormFieldBlock(fieldHtml(f));
    const byKey = Object.fromEntries(NC_FORM_FIELDS.map((f) => [f.key, f]));

    const parts = [
      this.ncFormRow2(field(byKey.CODCUENTA), field(byKey.NIVEL)),
      `<div class="mb-2 nc-form-field">${fieldHtml(byKey.DESCRIPCION)}</div>`,
      this.ncFormRow2(field(byKey.DA), field(byKey.PD)),
      this.ncFormRow2(field(byKey.ESTFIN), field(byKey.TIPOEF)),
      `<div class="row g-2 mb-0 nc-form-row"><div class="col-sm-6">${field(byKey.ACTIVO)}</div></div>`,
    ];

    return `<div class="nc-form-grid text-start">${parts.join('')}</div>`;
  },

  formatCell(value, col, row) {
    if (col?.key === 'CODCUENTA') {
      const nivel = Number(row?.NIVEL) || 1;
      const pad = Math.max(0, nivel - 1) * 0.85;
      const code = this.escapeHtml(value ?? '—');
      return `<span class="nc-codcuenta" style="padding-left:${pad}rem">${code}</span>`;
    }
    if (col?.key === 'DA') return this.escapeHtml(daLabel(value));
    if (col?.key === 'PD') return this.escapeHtml(pdLabel(value));
    if (col?.key === 'TIPOEF') return this.escapeHtml(tipoefLabel(value));
    if (col?.key === 'ACTIVO') {
      const v = String(value ?? '').trim().toUpperCase();
      if (v === 'NO') return '<span class="badge text-bg-secondary">NO</span>';
      if (v === 'SI') return '<span class="badge text-bg-success">SI</span>';
    }
    return NomenclaturaContableViewBase.formatCell.call(this, value, col);
  },

  getFilteredRows() {
    let rows = NomenclaturaContableViewBase.getFilteredRows.call(this);
    const tipoef = String(this._filterTipoef ?? '').trim().toUpperCase();
    if (tipoef) {
      rows = rows.filter((r) => String(r.TIPOEF ?? '').trim().toUpperCase() === tipoef);
    }
    return rows;
  },

  renderTableBodyHtml(rows) {
    const colSpan = NC_TABLE_COLUMNS.length + 1;
    if (!rows.length) {
      const msg =
        this._filterQuery.trim() || this._filterTipoef
          ? 'Ningún registro coincide con la búsqueda'
          : 'Sin cuentas contables';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const inactive = String(row.ACTIVO ?? '').trim().toUpperCase() === 'NO';
        const cells = NC_TABLE_COLUMNS.map(
          (c) => `<td>${this.formatCell(row[c.key], c, row)}</td>`
        ).join('');
        return `<tr class="${inactive ? 'nc-row-inactiva' : ''}">${cells}<td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td></tr>`;
      })
      .join('');
  },

  renderTable() {
    const headers = [
      ...NC_TABLE_COLUMNS.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');
    const filtered = this.getFilteredRows();
    const bgSel = this._filterTipoef === 'BG' ? ' selected' : '';
    const erSel = this._filterTipoef === 'ER' ? ' selected' : '';

    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap nomenclatura-contable-wrap">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="nomenclatura-contable-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-nomenclatura-contable-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="d-flex flex-wrap align-items-end gap-2 px-1 mb-2">
          <div class="nc-filter-tipoef">
            <label for="nc-filter-tipoef" class="form-label small mb-1">Tipo EF</label>
            <select class="form-select form-select-sm" id="nc-filter-tipoef">
              <option value="">Todos</option>
              <option value="BG"${bgSel}>Balance General</option>
              <option value="ER"${erSel}>Estado de Resultados</option>
            </select>
          </div>
          <div class="catalogo-empresa-search-wrap flex-grow-1">
            <label for="nomenclatura-contable-search" class="form-label small mb-1">Buscar</label>
            <div class="input-group input-group-sm catalogo-empresa-search">
              <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="nomenclatura-contable-search"
                placeholder="${this.escapeHtml('Buscar por código, descripción, estado financiero…')}"
                value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
              <button type="button" class="btn btn-outline-secondary" id="btn-nomenclatura-contable-search-clear"
                title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
        <p class="small text-muted px-1 mb-2">
          Plan de cuentas contable por empresa. <strong>DA</strong>: naturaleza deudora/acreedora.
          <strong>PD</strong>: padre (agrupación) o detalle (movimiento).
        </p>
        <div class="table-responsive nc-table-wrap">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top"><tr>${headers}</tr></thead>
            <tbody id="nomenclatura-contable-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-nomenclatura-contable-nuevo')}
      </div>
    `;
  },

  bindEvents() {
    NomenclaturaContableViewBase.bindEvents.call(this);
    this._container?.querySelector('#nc-filter-tipoef')?.addEventListener('change', (e) => {
      this._filterTipoef = e.target.value;
      this.updateTableView();
    });
    const refreshBtn = document.getElementById('btn-nomenclatura-contable-refresh');
    if (refreshBtn) {
      const clone = refreshBtn.cloneNode(true);
      refreshBtn.replaceWith(clone);
      clone.addEventListener('click', () => {
        this._filterQuery = '';
        this._filterTipoef = '';
        this.load(this._container);
      });
    }
  },

  async onNuevo() {
    const data = await this.showForm(
      'Nueva cuenta contable',
      this.normalizeRowForForm(),
      false
    );
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Cuenta contable creada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm(
      'Editar cuenta contable',
      this.normalizeRowForForm(row),
      true
    );
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Cuenta contable actualizada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = this.rowLabel(row, id);
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar cuenta contable?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    const pass = await CatalogosUI.solicitarClaveAdmin({
      title: 'Autorizar eliminación',
      text: 'Ingrese la clave de administrador para eliminar la cuenta.',
      confirmText: 'Eliminar',
    });
    if (!pass) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: String(pass) }),
      });
      F.toast('Cuenta contable eliminada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },
};
