/**
 * Consultorio — CRUD pacientes (CONSULTORIO_PACIENTES).
 * Lista + FAB; alta/edición en modal (patrón catálogos).
 */
const ConsultorioPacientesView = {
  _container: null,
  _rows: [],
  _filterQuery: '',

  SINO_FIELDS: [
    { key: 'HIPERTENSION', label: 'Hipertensión' },
    { key: 'HIPOTENSION', label: 'Hipotensión' },
    { key: 'DIABETES', label: 'Diabetes' },
    { key: 'INSUFICIENCIA_RENAL', label: 'Insuficiencia renal' },
    { key: 'CARDIOPATIAS', label: 'Cardiopatías' },
    { key: 'TAQUICARDIAS', label: 'Taquicardias' },
    { key: 'HIGADOGRASO', label: 'Hígado graso' },
    { key: 'HISTERECTOMIA', label: 'Histerectomía' },
    { key: 'COLESISTECTOMIA', label: 'Colesistectomía' },
    { key: 'ALERGIAS', label: 'Alergias' },
  ],

  fechaInputValue(iso) {
    if (!iso) return '';
    return String(iso).slice(0, 10);
  },

  formatFechaNacDisplay(iso) {
    if (!iso) return '—';
    const s = this.fechaInputValue(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  },

  edadLabel(fechaNac, refFecha) {
    if (typeof ConsultorioEdad === 'undefined') return '—';
    return ConsultorioEdad.label(fechaNac, refFecha);
  },

  emptyRow() {
    const row = {
      NOMBRE: '',
      DIRECCION: '',
      TELEFONOS: '',
      EMAIL: '',
      FECHA_NACIMIENTO: null,
      NOTAS: '',
    };
    for (const f of this.SINO_FIELDS) row[f.key] = 'NO';
    return row;
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
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const sep = path.includes('?') ? '&' : '?';
    return `/api/consultorio/pacientes${path}${sep}empnit=${encodeURIComponent(emp)}`;
  },

  normalizeSino(v) {
    return String(v ?? 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
  },

  sinoButtonHtml(fieldKey, value) {
    const val = this.normalizeSino(value);
    const cls = val === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
    return `<button type="button" class="btn btn-sm btn-empleado-activo ${cls} cons-pac-sino"
      data-field="${fieldKey}" data-value="${val}">${val}</button>`;
  },

  bindSinoToggles(popup) {
    if (!popup || popup.dataset.consPacSinoBound === '1') return;
    popup.dataset.consPacSinoBound = '1';
    popup.addEventListener('click', (e) => {
      const btn = e.target.closest('.cons-pac-sino');
      if (!btn) return;
      const cur = this.normalizeSino(btn.getAttribute('data-value'));
      const next = cur === 'SI' ? 'NO' : 'SI';
      btn.setAttribute('data-value', next);
      btn.textContent = next;
      btn.classList.remove('btn-empleado-activo--si', 'btn-empleado-activo--no');
      btn.classList.add(next === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no');
    });
  },

  buildModalHtml(row = {}, isEdit = false) {
    const cod = isEdit ? row.CODPACIENTE ?? '—' : '—';
    const sinoRows = this.SINO_FIELDS.map((f) => {
      return `
        <div class="d-flex align-items-center justify-content-between gap-2 py-1 border-bottom border-light-subtle">
          <span class="small">${this.escapeHtml(f.label)}</span>
          ${this.sinoButtonHtml(f.key, row[f.key])}
        </div>`;
    }).join('');

    return `
      <div class="row g-3 cons-pac-modal-grid">
        <div class="col-md-6">
          <div class="card h-100 border">
            <div class="card-header py-2 d-flex align-items-center gap-2">
              <strong class="small">Datos del paciente</strong>
              ${isEdit ? `<span class="badge text-bg-secondary ms-auto">Cód. ${this.escapeHtml(cod)}</span>` : ''}
            </div>
            <div class="card-body">
              <div class="mb-2">
                <label class="form-label small mb-0" for="cons-pac-nombre">Nombre <span class="text-danger">*</span></label>
                <input type="text" class="form-control form-control-sm" name="NOMBRE" id="cons-pac-nombre"
                  value="${this.escapeHtml(row.NOMBRE || '')}" autocomplete="off">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="cons-pac-direccion">Dirección</label>
                <input type="text" class="form-control form-control-sm" name="DIRECCION" id="cons-pac-direccion"
                  value="${this.escapeHtml(row.DIRECCION || '')}" autocomplete="off">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="cons-pac-fechanac">Fecha de nacimiento</label>
                <input type="date" class="form-control form-control-sm" name="FECHA_NACIMIENTO" id="cons-pac-fechanac"
                  value="${this.escapeHtml(this.fechaInputValue(row.FECHA_NACIMIENTO))}">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="cons-pac-telefonos">Teléfonos</label>
                <input type="text" class="form-control form-control-sm" name="TELEFONOS" id="cons-pac-telefonos"
                  value="${this.escapeHtml(row.TELEFONOS || '')}" autocomplete="off">
              </div>
              <div class="mb-2">
                <label class="form-label small mb-0" for="cons-pac-email">Correo</label>
                <input type="email" class="form-control form-control-sm" name="EMAIL" id="cons-pac-email"
                  value="${this.escapeHtml(row.EMAIL || '')}" autocomplete="off">
              </div>
              <div>
                <label class="form-label small mb-0" for="cons-pac-notas">Notas</label>
                <textarea class="form-control form-control-sm" name="NOTAS" id="cons-pac-notas" rows="4"
                  placeholder="Anotaciones del paciente…">${this.escapeHtml(row.NOTAS || '')}</textarea>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="card h-100 border">
            <div class="card-header py-2"><strong class="small">Antecedentes / condiciones</strong></div>
            <div class="card-body py-2">${sinoRows}</div>
          </div>
        </div>
      </div>`;
  },

  readPayloadFromPopup(popup) {
    const q = (sel) => popup?.querySelector(sel)?.value ?? '';
    const fechaRaw = String(q('[name="FECHA_NACIMIENTO"]')).trim();
    const data = {
      NOMBRE: String(q('[name="NOMBRE"]')).trim(),
      DIRECCION: String(q('[name="DIRECCION"]')).trim() || null,
      TELEFONOS: String(q('[name="TELEFONOS"]')).trim() || null,
      EMAIL: String(q('[name="EMAIL"]')).trim() || null,
      FECHA_NACIMIENTO: fechaRaw ? fechaRaw : null,
      NOTAS: String(q('[name="NOTAS"]')).trim() || null,
    };
    for (const f of this.SINO_FIELDS) {
      const btn = popup?.querySelector(`.cons-pac-sino[data-field="${f.key}"]`);
      data[f.key] = this.normalizeSino(btn?.getAttribute('data-value'));
    }
    return data;
  },

  async showPacienteForm(title, row = {}, isEdit = false) {
    return CatalogosUI.fireForm({
      title,
      html: this.buildModalHtml(row, isEdit),
      width: 920,
      customClass: { popup: 'modal-catalogo cons-pac-modal' },
      didOpen: (popup) => {
        this.bindSinoToggles(popup);
        popup?.querySelector('#cons-pac-nombre')?.focus();
      },
      preConfirm: (popup) => {
        const data = this.readPayloadFromPopup(popup);
        if (!data.NOMBRE) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return data;
      },
    });
  },

  getFilteredRows() {
    const q = this._filterQuery.trim().toLowerCase();
    if (!q) return this._rows;
    return this._rows.filter((r) => {
      const blob = [r.CODPACIENTE, r.NOMBRE, r.DIRECCION, r.TELEFONOS, r.EMAIL]
        .map((x) => String(x ?? '').toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  },

  badgeText(filteredCount, totalCount) {
    const empNombre = F.getEmpNitNombre?.() || '';
    const badgeExtra = empNombre ? ` · ${empNombre}` : '';
    const q = this._filterQuery.trim();
    const countLabel =
      q && filteredCount !== totalCount
        ? `${filteredCount} de ${totalCount} pacientes`
        : `${totalCount} paciente(s)`;
    return `<i class="fa-solid fa-user-injured me-1"></i>${countLabel}${this.escapeHtml(badgeExtra)}`;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún paciente coincide con la búsqueda'
        : 'Sin pacientes registrados';
      return `<tr><td colspan="7" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return rows
      .map((r) => {
        const id = r.CODPACIENTE;
        const acciones = CatalogosUI.accionesRow(id, 'codpaciente');
        return `
          <tr>
            <td>${this.escapeHtml(id)}</td>
            <td>${this.escapeHtml(r.NOMBRE || '—')}</td>
            <td class="text-nowrap small">${this.escapeHtml(this.formatFechaNacDisplay(r.FECHA_NACIMIENTO))}</td>
            <td class="text-nowrap small">${this.escapeHtml(this.edadLabel(r.FECHA_NACIMIENTO))}</td>
            <td>${this.escapeHtml(r.TELEFONOS || '—')}</td>
            <td class="small">${this.escapeHtml(r.EMAIL || '—')}</td>
            <td class="text-end">${acciones}</td>
          </tr>`;
      })
      .join('');
  },

  updateTableView() {
    const filtered = this.getFilteredRows();
    const tbody = this._container?.querySelector('#cons-pac-tbody');
    const badge = this._container?.querySelector('#cons-pac-count');
    if (tbody) {
      tbody.innerHTML = this.renderTableBodyHtml(filtered);
      this.bindRowActions();
    }
    if (badge) badge.innerHTML = this.badgeText(filtered.length, this._rows.length);
  },

  renderTable() {
    const filtered = this.getFilteredRows();
    return `
      <div class="catalogo-empresa-panel catalogo-vista-wrap consultorio-vista-wrap cons-pac-wrap">
        <h2 class="catalogo-vista-title h5 mb-2 px-1">Pacientes</h2>
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="cons-pac-count">${this.badgeText(filtered.length, this._rows.length)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-cons-pac-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="catalogo-empresa-search-wrap px-1 mb-2">
          <div class="input-group input-group-sm catalogo-empresa-search">
            <span class="input-group-text" aria-hidden="true"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control" id="cons-pac-search"
              placeholder="Buscar por código, nombre, teléfono, correo…"
              value="${this.escapeHtml(this._filterQuery)}" autocomplete="off" spellcheck="false">
            <button type="button" class="btn btn-outline-secondary" id="btn-cons-pac-search-clear"
              title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>
        <div class="table-responsive px-1">
          <table class="table table-sm table-hover table-striped">
            <thead>
              <tr>
                <th scope="col">Cód.</th>
                <th scope="col">Nombre</th>
                <th scope="col">F. nac.</th>
                <th scope="col">Edad</th>
                <th scope="col">Teléfonos</th>
                <th scope="col">Correo</th>
                <th scope="col" class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="cons-pac-tbody">${this.renderTableBodyHtml(filtered)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-cons-pac-nuevo')}
      </div>`;
  },

  findRow(codpaciente) {
    return this._rows.find((r) => String(r.CODPACIENTE) === String(codpaciente));
  },

  async fetchRows() {
    const data = await F.fetchJson(`${this.apiBase()}&_=${Date.now()}`, { cache: 'no-store' });
    this._rows = data.rows || [];
  },

  async createPaciente(payload) {
    const data = await F.fetchJson(this.apiBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return data;
  },

  async onNuevo() {
    const payload = await this.showPacienteForm('Nuevo paciente', this.emptyRow(), false);
    if (!payload) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Paciente creado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(codpaciente) {
    const row = this.findRow(codpaciente);
    if (!row) return;
    const payload = await this.showPacienteForm('Editar paciente', row, true);
    if (!payload) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codpaciente)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      F.toast('Paciente actualizado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(codpaciente) {
    const row = this.findRow(codpaciente);
    const nombre = row?.NOMBRE || codpaciente;
    const auth = await CatalogosUI.authorizeEliminarRegistro({
      label: nombre,
      tipo: 'paciente',
      kind: 'registro',
      title: '¿Eliminar paciente?',
      html: `<p class="mb-0">Se eliminará <strong>${this.escapeHtml(nombre)}</strong></p>`,
      confirmText: 'Eliminar',
    });
    if (!auth) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(codpaciente)}`), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass: auth.pass != null ? String(auth.pass) : '__AUTORIZADO__' }),
      });
      F.toast('Paciente eliminado', 'success');
      await this.load(this._container);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    this._container?.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEditar(btn.dataset.codpaciente));
    });
    this._container?.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => this.onEliminar(btn.dataset.codpaciente));
    });
  },

  bindEvents() {
    document.getElementById('btn-cons-pac-refresh')?.addEventListener('click', () => {
      this._filterQuery = '';
      this.load(this._container);
    });
    document.getElementById('btn-cons-pac-nuevo')?.addEventListener('click', () => this.onNuevo());
    const search = document.getElementById('cons-pac-search');
    const clearBtn = document.getElementById('btn-cons-pac-search-clear');
    if (search) {
      const applyFilter = F.debounce(() => {
        this._filterQuery = search.value;
        this.updateTableView();
      }, 200);
      search.addEventListener('input', applyFilter);
      search.addEventListener('search', applyFilter);
    }
    clearBtn?.addEventListener('click', () => {
      if (search) search.value = '';
      this._filterQuery = '';
      this.updateTableView();
      search?.focus();
    });
    this.bindRowActions();
  },

  async load(container) {
    const navToken =
      typeof F !== 'undefined' && typeof F.getMenuNavToken === 'function' ? F.getMenuNavToken() : 0;
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100" role="alert">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese seleccionando una empresa.
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="text-center text-muted py-4 w-100">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando pacientes…
      </div>`;

    try {
      await this.fetchRows();
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = this.renderTable();
      this.bindEvents();
    } catch (err) {
      if (typeof F.isMenuNavigationCurrent === 'function' && !F.isMenuNavigationCurrent(navToken)) return;
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100" role="alert">
          <i class="fa-solid fa-circle-exclamation me-2"></i>
          No se pudo cargar: ${this.escapeHtml(err.message)}
        </div>`;
      F.toast('Error al cargar pacientes', 'error');
    }
  },
};