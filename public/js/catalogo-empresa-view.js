/**
 * Factory de vistas CRUD por empresa (mismo patrón que Marcas).
 */
function createCatalogoEmpresaView(cfg) {
  return {
    _container: null,
    _rows: [],
    _filterQuery: '',

    escapeHtml(value) {
      if (value === null || value === undefined) return '';
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    apiBase(path = '') {
      const requireEmpresa = cfg.requireEmpresa !== false;
      const base = `${cfg.apiPath}${path}`;
      if (!requireEmpresa) return base;
      const empNit = F.getEmpNit();
      if (!empNit) {
        throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
      }
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}empnit=${encodeURIComponent(empNit)}`;
    },

    formatCell(value, col) {
      if (value === null || value === undefined) return '—';
      if (col?.type === 'number' && typeof value === 'number') {
        return Number.isInteger(value)
          ? value
          : value.toLocaleString('es-GT', { maximumFractionDigits: 2 });
      }
      return this.escapeHtml(value);
    },

    fieldHtml(f, row, isEdit) {
      if (!isEdit && f.hideOnNew) return '';
      const req = f.required ? 'required' : '';
      const ro = f.readonlyOnEdit && isEdit ? 'readonly' : '';
      const val = row[f.key] ?? '';
      const step = f.step ? `step="${f.step}"` : '';

      if (f.type === 'select') {
        const options = f.options || [];
        const strVal = val !== null && val !== undefined ? String(val) : '';
        const optsHtml = options
          .map(
            (o) =>
              `<option value="${this.escapeHtml(o.value)}"${strVal === String(o.value) ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
          )
          .join('');
        return `
          <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
          <select class="form-select form-select-sm" name="${f.key}" ${req} ${ro}>
            <option value="">— Seleccione —</option>
            ${optsHtml}
          </select>
        `;
      }

      const inputType = f.type || 'text';
      let displayVal = val;
      if (inputType === 'date' && val) {
        displayVal = String(val).slice(0, 10);
      }

      return `
        <label class="form-label small mb-0">${this.escapeHtml(f.label)}</label>
        <input type="${inputType}" class="form-control form-control-sm" name="${f.key}"
          value="${this.escapeHtml(displayVal)}" ${req} ${ro} ${step}>
      `;
    },

    buildFormHtml(row = {}, isEdit = false, profile = 'full') {
      const fields =
        profile === 'documento' && cfg.docFormFields?.length ? cfg.docFormFields : cfg.formFields;
      return fields
        .map((f) => {
          const html = this.fieldHtml(f, row, isEdit);
          if (!html) return '';
          return `<div class="mb-2">${html}</div>`;
        })
        .join('');
    },

    readFormData(profile = 'full', popup) {
      const fields =
        profile === 'documento' && cfg.docFormFields?.length ? cfg.docFormFields : cfg.formFields;
      return CatalogosUI.readNamedFields(popup, fields.map((f) => f.key));
    },

    buildPayload(data, isEdit, profile = 'full') {
      if (typeof cfg.mapFormToApi === 'function') {
        return cfg.mapFormToApi(data, isEdit, profile);
      }
      const keys =
        profile === 'documento' && cfg.docCreateKeys?.length && !isEdit
          ? cfg.docCreateKeys
          : isEdit
            ? cfg.updateKeys || cfg.formFields.map((f) => f.key)
            : cfg.createKeys || cfg.formFields.map((f) => f.key);
      const payload = {};
      keys.forEach((key) => {
        if (data[key] !== undefined && data[key] !== '') payload[key] = data[key];
        else if (data[key] === '' && cfg.allowEmpty?.includes(key)) payload[key] = null;
      });
      return payload;
    },

    async showForm(title, row = {}, isEdit = false, options = {}) {
      const profile = options.profile || 'full';
      return CatalogosUI.fireForm({
        title,
        html: this.buildFormHtml(row, isEdit, profile),
        width: cfg.formWidth || 520,
        didOpen: (popup) => {
          if (profile === 'documento' && !isEdit && typeof DocNitSatLookup !== 'undefined') {
            DocNitSatLookup.bindEnterLookup({
              popup,
              nitFieldName: 'NIT',
              nameFieldName: cfg.docNameField || 'EMPRESA',
            });
            popup?.querySelector('[name="NIT"]')?.focus();
          }
        },
        preConfirm: (popup) => {
          const data = this.readFormData(profile, popup);
          const err = cfg.validateForm?.(data, isEdit, profile);
          if (err) {
            Swal.showValidationMessage(err);
            return false;
          }
          return this.buildPayload(data, isEdit, profile);
        },
      });
    },

    getFilteredRows() {
      const q = this._filterQuery.trim().toLowerCase();
      if (!q) return this._rows;
      const keys = cfg.searchKeys || cfg.tableColumns.map((c) => c.key);
      return this._rows.filter((r) =>
        keys.some((key) => String(r[key] ?? '').toLowerCase().includes(q))
      );
    },

    renderTableBodyHtml(rows) {
      const colSpan = cfg.tableColumns.length + 1;
      if (!rows.length) {
        const msg = this._filterQuery.trim()
          ? `Ningún registro coincide con la búsqueda`
          : 'Sin registros';
        return `<tr><td colspan="${colSpan}" class="text-center text-muted py-4">${msg}</td></tr>`;
      }
      return rows
        .map((row) => {
          const cells = cfg.tableColumns
            .map((c) => `<td>${this.formatCell(row[c.key], c)}</td>`)
            .join('');
          return `<tr>${cells}<td class="text-end">${CatalogosUI.accionesRow(row[cfg.idKey], cfg.dataAttr)}</td></tr>`;
        })
        .join('');
    },

    badgeText(filteredCount, totalCount) {
      const requireEmpresa = cfg.requireEmpresa !== false;
      const empNombre = requireEmpresa ? F.getEmpNitNombre() : '';
      const badgeExtra = empNombre ? ` · ${empNombre}` : '';
      const q = this._filterQuery.trim();
      let countLabel;
      if (q && filteredCount !== totalCount) {
        countLabel = `${filteredCount} de ${totalCount} ${cfg.labelPlural}`;
      } else {
        countLabel = `${totalCount} ${cfg.labelPlural}`;
      }
      return `<i class="fa-solid ${cfg.icon} me-1"></i>${countLabel}${this.escapeHtml(badgeExtra)}`;
    },

    updateTableView() {
      const filtered = this.getFilteredRows();
      const tbody = this._container?.querySelector(`#${cfg.slug}-tbody`);
      const badge = this._container?.querySelector(`#${cfg.slug}-count`);
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
        ...cfg.tableColumns.map((c) => `<th scope="col">${this.escapeHtml(c.label)}</th>`),
        '<th scope="col" class="text-end">Acciones</th>',
      ].join('');
      const filtered = this.getFilteredRows();
      const panelClass = cfg.panelClass || 'catalogo-empresa-panel';

      const titleBlock = cfg.viewTitle
        ? `<h2 class="catalogo-vista-title h5 mb-2 px-1">${this.escapeHtml(cfg.viewTitle)}</h2>`
        : '';

      return `
        <div class="${panelClass} catalogo-vista-wrap">
          ${titleBlock}
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
            <span class="catalogo-empresa-badge" id="${cfg.slug}-count">${this.badgeText(filtered.length, this._rows.length)}</span>
            <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-${cfg.slug}-refresh">
              <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
            </button>
          </div>
          <div class="catalogo-empresa-search-wrap px-1 mb-2">
            <div class="input-group input-group-sm catalogo-empresa-search">
              <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="${cfg.slug}-search"
                placeholder="${this.escapeHtml(cfg.searchPlaceholder)}" value="${this.escapeHtml(this._filterQuery)}"
                autocomplete="off" spellcheck="false">
              <button type="button" class="btn btn-outline-secondary" id="btn-${cfg.slug}-search-clear"
                title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
                <i class="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div class="table-responsive">
            <table class="table table-sm table-hover table-striped">
              <thead><tr>${headers}</tr></thead>
              <tbody id="${cfg.slug}-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
            </table>
          </div>
          ${CatalogosUI.btnNuevoFab(`btn-${cfg.slug}-nuevo`)}
        </div>
      `;
    },

    findRow(id) {
      return this._rows.find((r) => String(r[cfg.idKey]) === String(id));
    },

    rowLabel(row, id) {
      if (cfg.getRowLabel) return cfg.getRowLabel(row, id);
      const desc = row?.DESMARCA || row?.DESRUTA || row?.DESCLAUNO || row?.EMPRESA || row?.TIPOPRECIO;
      return desc || id;
    },

    async onNuevo() {
      const data = await this.showForm(`Nuevo ${cfg.labelSingular}`);
      if (!data) return;
      try {
        await F.fetchJson(this.apiBase(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        F.toast(`${cfg.labelSingular} creado`, 'success');
        await this.load(this._container);
      } catch (err) {
        F.alert('Error', err.message, 'error');
      }
    },

    async onEditar(id) {
      const row = this.findRow(id);
      if (!row) return;
      const data = await this.showForm(`Editar ${cfg.labelSingular}`, row, true);
      if (!data) return;
      try {
        await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        F.toast(`${cfg.labelSingular} actualizado`, 'success');
        await this.load(this._container);
      } catch (err) {
        F.alert('Error', err.message, 'error');
      }
    },

    async onEliminar(id) {
      const row = this.findRow(id);
      const nombre = this.rowLabel(row, id);
      const auth = await CatalogosUI.authorizeEliminarRegistro({
        label: nombre,
        tipo: cfg.labelSingular,
        kind: 'registro',
        title: `¿Eliminar ${cfg.labelSingular}?`,
        html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
        confirmText: 'Eliminar',
      });
      if (!auth) return;
      try {
        await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
        });
        F.toast(`${cfg.labelSingular} eliminado`, 'success');
        await this.load(this._container);
      } catch (err) {
        F.alert('Error', err.message, 'error');
      }
    },

    bindRowActions() {
      const attr = cfg.dataAttr;
      this._container.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
        btn.addEventListener('click', () => this.onEditar(btn.dataset[attr]));
      });
      this._container.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
        btn.addEventListener('click', () => this.onEliminar(btn.dataset[attr]));
      });
    },

    bindSearch() {
      const search = document.getElementById(`${cfg.slug}-search`);
      const clearBtn = document.getElementById(`btn-${cfg.slug}-search-clear`);
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
      document.getElementById(`btn-${cfg.slug}-refresh`)?.addEventListener('click', () => {
        this._filterQuery = '';
        this.load(this._container);
      });
      document.getElementById(`btn-${cfg.slug}-nuevo`)?.addEventListener('click', () => this.onNuevo());
      this.bindSearch();
      this.bindRowActions();
    },

    async load(container) {
      const navToken =
        typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function'
          ? F.getMenuNavToken()
          : 0;
      this._container = container;
      container.classList.remove('align-items-center', 'justify-content-center');
      container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

      if (cfg.requireEmpresa !== false && !F.getEmpNit()) {
        if (typeof F !== 'undefined' && typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
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
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando ${cfg.labelPlural}…
        </div>
      `;

      try {
        const baseUrl = this.apiBase();
        const cacheSep = baseUrl.includes('?') ? '&' : '?';
        const data = await F.fetchJson(`${baseUrl}${cacheSep}_=${Date.now()}`, { cache: 'no-store' });
        if (typeof F !== 'undefined' && typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
          return;
        }
        this._rows = data.rows || [];
        container.innerHTML = this.renderTable();
        this.bindEvents();
      } catch (err) {
        if (typeof F !== 'undefined' && typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) {
          return;
        }
        container.innerHTML = `
          <div class="alert alert-danger m-3 w-100" role="alert">
            <i class="fa-solid fa-circle-exclamation me-2"></i>
            No se pudo cargar: ${this.escapeHtml(err.message)}
          </div>
        `;
        F.toast(`Error al cargar ${cfg.labelPlural}`, 'error');
      }
    },
  };
}
