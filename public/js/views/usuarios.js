/**
 * Vista Usuarios — CRUD sobre dbo.USUARIOS (clave en texto plano).
 */
const USUARIOS_NIVEL_OPTIONS = [
  { value: '1', label: 'ADMINISTRADOR' },
  { value: '2', label: 'SUPERVISOR' },
  { value: '3', label: 'VENTAS' },
  { value: '4', label: 'BODEGA' },
  { value: '5', label: 'CONTABILIDAD' },
];

const UsuariosView = {
  _container: null,
  _rows: [],
  _filterQuery: '',

  formFields: [
    { key: 'ID', label: 'ID', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'USUARIO', label: 'Usuario', required: true, type: 'text' },
    { key: 'EMAIL', label: 'Email', type: 'email' },
    { key: 'PASS', label: 'Clave', type: 'text', requiredOnNew: true },
  ],

  tableColumns: [
    { key: 'ID', label: 'ID' },
    { key: 'USUARIO', label: 'Usuario' },
    { key: 'NIVEL', label: 'Nivel' },
    { key: 'EMAIL', label: 'Email' },
    { key: 'PASS', label: 'Clave' },
  ],

  nivelLabel(value) {
    const v = String(value ?? '');
    const found = USUARIOS_NIVEL_OPTIONS.find((o) => o.value === v);
    return found ? found.label : v || '—';
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

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiBase(path = '') {
    return `/api/usuarios${path}`;
  },

  formatCell(value, key) {
    if (key === 'NIVEL') return this.escapeHtml(this.nivelLabel(value));
    if (value === null || value === undefined || value === '') return '—';
    return this.escapeHtml(value);
  },

  fieldHtml(f, row, isEdit) {
    if (!isEdit && f.hideOnNew) return '';
    const req = f.required || (!isEdit && f.requiredOnNew) ? 'required' : '';
    const ro = f.readonlyOnEdit && isEdit ? 'readonly' : '';
    let val = row[f.key] ?? '';
    if (f.key === 'PASS' && isEdit) {
      val = '';
    }
    const placeholder =
      f.key === 'PASS' && isEdit ? 'placeholder="Dejar vacío para no cambiar"' : '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
      <input type="${f.type}" class="form-control form-control-sm" name="${f.key}"
        value="${this.escapeHtml(val)}" ${req} ${ro} autocomplete="off" ${placeholder}>
    `;
  },

  buildFormHtml(row = {}, isEdit = false) {
    const nivelBlock = this.selectField('NIVEL', 'Nivel', USUARIOS_NIVEL_OPTIONS, row.NIVEL, true);
    const fieldsHtml = this.formFields
      .map((f) => {
        const html = this.fieldHtml(f, row, isEdit);
        if (!html) return '';
        return `<div class="mb-2">${html}</div>`;
      })
      .join('');
    return `<div class="mb-2">${nivelBlock}</div>${fieldsHtml}`;
  },

  readFormData() {
    const data = {};
    const nivelInput = document.querySelector('.swal2-html-container [name="NIVEL"]');
    if (nivelInput) data.NIVEL = nivelInput.value.trim();
    this.formFields.forEach((field) => {
      const input = document.querySelector(`.swal2-html-container [name="${field.key}"]`);
      if (!input) return;
      data[field.key] = input.value.trim();
    });
    return data;
  },

  showForm(title, row = {}, isEdit = false) {
    return CatalogosUI.fireForm({
      title,
      html: this.buildFormHtml(row, isEdit),
      width: 480,
      preConfirm: () => {
        const data = this.readFormData();
        if (!data.USUARIO) {
          Swal.showValidationMessage('El usuario es obligatorio');
          return false;
        }
        const nivel = Number(data.NIVEL);
        if (data.NIVEL === '' || Number.isNaN(nivel)) {
          Swal.showValidationMessage('El nivel es obligatorio');
          return false;
        }
        if (!isEdit && !data.PASS) {
          Swal.showValidationMessage('La clave es obligatoria');
          return false;
        }
        const payload = {
          USUARIO: data.USUARIO,
          NIVEL: nivel,
          EMAIL: data.EMAIL || '',
        };
        if (data.PASS) payload.PASS = data.PASS;
        return payload;
      },
    });
  },

  getFilteredRows() {
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) => {
      const parts = [
        r.ID,
        r.USUARIO,
        r.NIVEL,
        this.nivelLabel(r.NIVEL),
        r.EMAIL,
        r.PASS,
      ].map((v) => String(v ?? '').toLowerCase());
      return parts.some((p) => p.includes(q));
    });
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColumns.length + 1;
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún usuario coincide con la búsqueda'
        : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = this.tableColumns
          .map((c) => `<td>${this.formatCell(row[c.key], c.key)}</td>`)
          .join('');
        return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td></tr>`;
      })
      .join('');
  },

  badgeText(filteredCount, totalCount) {
    const q = this._filterQuery.trim();
    let countLabel;
    if (q && filteredCount !== totalCount) {
      countLabel = `${filteredCount} de ${totalCount} usuario(s)`;
    } else {
      countLabel = `${totalCount} usuario(s)`;
    }
    return `<i class="fa-solid fa-users me-1"></i>${countLabel}`;
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#usuarios-tbody');
    const badge = this._container?.querySelector('#usuarios-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) {
      badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
    }
  },

  renderTable() {
    const headers = [
      ...this.tableColumns.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
      '<th scope="col" class="text-end">Acciones</th>',
    ].join('');

    const filtered = this.getFilteredRows();

    return `
      <div class="usuarios-panel catalogo-vista-wrap">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="usuarios-badge" id="usuarios-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-usuarios-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="usuarios-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm usuarios-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="usuarios-search" placeholder="Buscar por usuario, email o clave…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-usuarios-search-clear" title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody id="usuarios-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-usuarios-nuevo')}
      </div>
    `;
  },

  findRow(id) {
    const n = Number(id);
    return this._rows.find((r) => Number(r.ID) === n);
  },

  async onNuevo() {
    const data = await this.showForm('Nuevo usuario');
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Usuario creado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar usuario', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Usuario actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const nombre = row ? row.USUARIO || id : id;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar usuario?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong> (ID ${this.escapeHtml(id)})</p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Usuario eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.id));
    });
    this._container.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.id));
    });
  },

  bindSearch() {
    const search = document.getElementById('usuarios-search');
    const clearBtn = document.getElementById('btn-usuarios-search-clear');
    if (!search) return;

    const applyFilter = F.debounce(() => {
      this._filterQuery = search.value;
      this.updateTableView();
    }, 200);

    search.addEventListener('input', applyFilter);
    search.addEventListener('search', applyFilter);

    clearBtn?.addEventListener('click', () => {
      search.value = '';
      this._filterQuery = '';
      this.updateTableView();
      search.focus();
    });
  },

  bindEvents() {
    document.getElementById('btn-usuarios-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.load(this._container);
    });
    document.getElementById('btn-usuarios-nuevo')?.addEventListener('click', () => this.onNuevo());
    this.bindSearch();
    this.bindRowActions();
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando usuarios…
      </div>
    `;

    try {
      const data = await F.fetchJson(`${this.apiBase()}?_=${Date.now()}`, { cache: 'no-store' });
      this._rows = data.rows || [];
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar usuarios: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar usuarios', 'error');
    }
  },
};
