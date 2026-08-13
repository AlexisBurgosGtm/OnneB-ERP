/**
 * Vista Marcas — CRUD sobre dbo.Marcas filtrado por EMPNIT de sesión (no visible en UI)
 */
const MarcasView = {
  _container: null,
  _rows: [],
  _filterQuery: '',

  formFields: [
    { key: 'CODMARCA', label: 'Código', type: 'number', readonlyOnEdit: true, hideOnNew: true },
    { key: 'DESMARCA', label: 'Descripción', required: true, type: 'text' },
  ],

  tableColumns: [
    { key: 'CODMARCA', label: 'Código' },
    { key: 'DESMARCA', label: 'Descripción' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiBase(path = '') {
    const empNit = F.getEmpNit();
    if (!empNit) {
      throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    }
    const base = `/api/marcas${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(empNit)}`;
  },

  formatCell(value) {
    if (value === null || value === undefined) return '—';
    return this.escapeHtml(value);
  },

  fieldHtml(f, row, isEdit) {
    if (!isEdit && f.hideOnNew) return '';
    const req = f.required ? 'required' : '';
    const ro = (isEdit && f.readonlyOnEdit) || f.readonlyOnEdit ? 'readonly' : '';
    const val = row[f.key] ?? '';
    return `
      <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
      <input type="${f.type}" class="form-control form-control-sm" name="${f.key}"
        value="${this.escapeHtml(val)}" ${req} ${ro}>
    `;
  },

  buildFormHtml(row = {}, isEdit = false) {
    return this.formFields
      .map((f) => {
        const html = this.fieldHtml(f, row, isEdit);
        if (!html) return '';
        return `<div class="mb-2">${html}</div>`;
      })
      .join('');
  },

  readFormData() {
    const data = {};
    this.formFields.forEach((field) => {
      const input = document.querySelector(`.swal2-html-container [name="${field.key}"]`);
      if (!input) return;
      data[field.key] = input.value.trim();
    });
    return data;
  },

  async showForm(title, row = {}, isEdit = false) {
    return CatalogosUI.fireForm({
      title,
      html: this.buildFormHtml(row, isEdit),
      preConfirm: () => {
        const data = this.readFormData();
        if (!data.DESMARCA) {
          Swal.showValidationMessage('La descripción es obligatoria');
          return false;
        }
        return { DESMARCA: data.DESMARCA };
      },
    });
  },

  getFilteredRows() {
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) => {
      const cod = String(r.CODMARCA ?? '').toLowerCase();
      const des = String(r.DESMARCA ?? '').toLowerCase();
      return cod.includes(q) || des.includes(q);
    });
  },

  renderTableBodyHtml(rows) {
    const colSpan = this.tableColumns.length + 1;
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ninguna marca coincide con la búsqueda'
        : 'Sin registros';
      return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((row) => {
        const cells = this.tableColumns
          .map((c) => `<td>${this.formatCell(row[c.key])}</td>`)
          .join('');
        return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row.CODMARCA, 'codmarca')}</td></tr>`;
      })
      .join('');
  },

  badgeText(filteredCount, totalCount) {
    const empNombre = F.getEmpNitNombre();
    const badgeExtra = empNombre ? ` · ${empNombre}` : '';
    const q = this._filterQuery.trim();
    let countLabel;
    if (q && filteredCount !== totalCount) {
      countLabel = `${filteredCount} de ${totalCount} marca(s)`;
    } else {
      countLabel = `${totalCount} marca(s)`;
    }
    return `<i class="fa-solid fa-bookmark me-1"></i>${countLabel}${this.escapeHtml(badgeExtra)}`;
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#marcas-tbody');
    const badge = this._container?.querySelector('#marcas-count');
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
      <div class="marcas-panel catalogo-vista-wrap">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="marcas-badge" id="marcas-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-marcas-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="marcas-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm marcas-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="marcas-search" placeholder="Buscar por código o descripción…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-marcas-search-clear" title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped">
            <thead><tr>${headers}</tr></thead>
            <tbody id="marcas-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-marcas-nuevo')}
      </div>
    `;
  },

  findRow(codmarca) {
    const id = Number(codmarca);
    return this._rows.find((r) => Number(r.CODMARCA) === id);
  },

  async onNuevo() {
    const data = await this.showForm('Nueva marca');
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Marca creada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(codmarca) {
    const row = this.findRow(codmarca);
    if (!row) return;
    const data = await this.showForm('Editar marca', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codmarca)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Marca actualizada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(codmarca) {
    const row = this.findRow(codmarca);
    const nombre = row ? row.DESMARCA || codmarca : codmarca;
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: nombre,
      tipo: 'marca',
      kind: 'registro',
      title: '¿Eliminar marca?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong> (código ${this.escapeHtml(codmarca)})</p>`,
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codmarca)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('Marca eliminada', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.codmarca));
    });
    this._container.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.codmarca));
    });
  },

  bindSearch() {
    const search = document.getElementById('marcas-search');
    const clearBtn = document.getElementById('btn-marcas-search-clear');
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
    document.getElementById('btn-marcas-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.load(this._container);
    });
    document.getElementById('btn-marcas-nuevo')?.addEventListener('click', () => this.onNuevo());
    this.bindSearch();
    this.bindRowActions();
  },

  async load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
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
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando marcas…
      </div>
    `;

    try {
      const data = await F.fetchJson(`${this.apiBase()}&_=${Date.now()}`, { cache: 'no-store' });
      this._rows = data.rows || [];
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar marcas: ${this.escapeHtml(err.message)}
        </div>
      `;
      F.toast('Error al cargar marcas', 'error');
    }
  },
};
