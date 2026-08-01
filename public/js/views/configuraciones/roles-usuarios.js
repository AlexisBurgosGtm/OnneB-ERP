/**
 * Configuración → Roles de usuarios
 * Asigna opciones de menú por tipo de empleado + Series por defecto (EMPLEADOS_DEFAULT).
 */
const RolesUsuariosView = {
  _container: null,
  _tipos: [],
  _groups: [],
  _acceso: {},
  _selectedCod: null,
  _dirty: false,
  _saving: false,
  _seriesRows: [],
  _seriesEmpleados: [],
  _seriesTipodocs: [],
  _seriesCajas: [],
  _seriesOpciones: [],
  _seriesReglas: {},
  _seriesLoading: false,
  _seriesSaving: false,
  _seriesFilterEmp: '',
  _seriesFilterQ: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  async load(container) {
    this._container = container;
    this._selectedCod = null;
    this._dirty = false;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = `
      <div class="roles-usuarios-wrap w-100">
        <div class="text-muted small py-4 text-center">Cargando roles…</div>
      </div>
    `;
    try {
      await this.fetchAll();
      this.render();
      await this.fetchSeriesDefault();
      this.refreshSeriesPanel();
    } catch (err) {
      container.innerHTML = `
        <div class="roles-usuarios-wrap w-100">
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error al cargar')}</div>
        </div>
      `;
    }
  },

  async fetchAll() {
    const data = await F.fetchJson(`/api/roles-usuarios?_=${Date.now()}`, { cache: 'no-store' });
    this._tipos = data.tipos || [];
    this._groups = data.groups || [];
    this._acceso = data.acceso || {};
    this._seriesOpciones = data.opcionSeries || [];
    window._onnebTiposEmpleadoCache = this._tipos;
    if (typeof TipoEmpleadoAccess !== 'undefined') {
      TipoEmpleadoAccess.applyMenuAccesoMap(this._acceso);
    }
    return data;
  },

  seriesApiUrl(extra = '') {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const base = `/api/roles-usuarios/series-default${extra}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(emp)}`;
  },

  async fetchSeriesDefault() {
    if (!F.getEmpNit()) {
      this._seriesRows = [];
      this._seriesEmpleados = [];
      this._seriesTipodocs = [];
      this._seriesCajas = [];
      return;
    }
    this._seriesLoading = true;
    this.refreshSeriesPanel();
    try {
      const data = await F.fetchJson(`${this.seriesApiUrl()}&_=${Date.now()}`, { cache: 'no-store' });
      this._seriesRows = data.rows || [];
      this._seriesEmpleados = data.empleados || [];
      this._seriesTipodocs = data.tipodocs || [];
      this._seriesCajas = data.cajas || [];
      this._seriesOpciones = data.opciones || this._seriesOpciones || [];
      this._seriesReglas = data.reglas || {};
    } catch (err) {
      F.toast(err.message || 'No se pudieron cargar las series por defecto', 'error');
      this._seriesRows = [];
    } finally {
      this._seriesLoading = false;
      this.refreshSeriesPanel();
    }
  },

  menusForTipo(cod) {
    const raw = this._acceso[String(cod)];
    if (raw === null) return null;
    if (Array.isArray(raw)) return raw;
    return ['inicio'];
  },

  isFullAccess(cod) {
    return this.menusForTipo(cod) === null;
  },

  countMenus(cod) {
    if (this.isFullAccess(cod)) {
      return this._groups.reduce((n, g) => n + (g.menus?.length || 0), 0);
    }
    return (this.menusForTipo(cod) || []).length;
  },

  selectedTipo() {
    return this._tipos.find((t) => Number(t.value) === Number(this._selectedCod)) || null;
  },

  render() {
    const wrap = this._container?.querySelector('.roles-usuarios-wrap') || this._container;
    if (!wrap) return;
    const tipo = this.selectedTipo();
    wrap.innerHTML = `
      <div class="roles-usuarios-panel w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Roles de usuarios</h2>
            <p class="text-muted small mb-0">
              ${
                tipo
                  ? 'Marque las opciones de cada submenú a las que tendrá acceso este tipo de empleado.'
                  : 'Seleccione un tipo de empleado a la izquierda o configure series por defecto a la derecha.'
              }
            </p>
          </div>
          ${
            tipo
              ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="roles-btn-volver">
                   <i class="fa-solid fa-arrow-left me-1" aria-hidden="true"></i> Volver
                 </button>`
              : ''
          }
        </div>
        ${tipo ? this.renderEditor(tipo) : this.renderHome()}
      </div>
    `;
    this.bindEvents();
  },

  renderHome() {
    return `
      <div class="row g-3 roles-home-row align-items-start">
        <div class="col-12 col-lg-4">
          <div class="roles-tipo-column">
            <h3 class="roles-section-title">Tipos de usuario</h3>
            ${this.renderTipoList()}
          </div>
        </div>
        <div class="col-12 col-lg-8">
          ${this.renderSeriesCard()}
        </div>
      </div>
    `;
  },

  renderTipoList() {
    const cards = (this._tipos || [])
      .map((t) => {
        const cod = Number(t.value);
        const full = this.isFullAccess(cod);
        const n = this.countMenus(cod);
        const badge = full
          ? '<span class="badge text-bg-primary">Acceso total</span>'
          : `<span class="badge text-bg-secondary">${n} opciones</span>`;
        return `
          <button type="button" class="roles-tipo-card text-start" data-codtipo="${cod}">
            <span class="roles-tipo-icon" aria-hidden="true"><i class="fa-solid fa-user-shield"></i></span>
            <span class="roles-tipo-body">
              <span class="roles-tipo-title">${this.escapeHtml(t.label || t.code)}</span>
              <span class="roles-tipo-meta">Código ${cod}${t.code ? ` · ${this.escapeHtml(t.code)}` : ''}</span>
            </span>
            <span class="roles-tipo-badge">${badge}</span>
            <span class="roles-tipo-chevron" aria-hidden="true"><i class="fa-solid fa-chevron-right"></i></span>
          </button>
        `;
      })
      .join('');
    return `
      <div class="roles-tipo-list">
        ${cards || '<p class="text-muted mb-0">No hay tipos de empleado definidos.</p>'}
      </div>
    `;
  },

  renderSeriesCard() {
    const empOpts = (this._seriesEmpleados || [])
      .map((e) => {
        const sel = String(this._seriesFilterEmp) === String(e.CODEMPLEADO) ? ' selected' : '';
        const label = `${e.NOMEMPLEADO || '—'} (${e.CODEMPLEADO})`;
        return `<option value="${this.escapeHtml(e.CODEMPLEADO)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    return `
      <div class="card roles-series-card h-100" id="roles-series-card">
        <div class="card-body">
          <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
            <div>
              <h3 class="h6 mb-1">Series por defecto</h3>
              <p class="text-muted small mb-0">Predetermina el CODDOC por empleado y vista (p. ej. Pedidos de mostrador).</p>
            </div>
            <button type="button" class="btn btn-sm btn-success" id="roles-series-nuevo"
              ${this._seriesSaving ? ' disabled' : ''}>
              <i class="fa-solid fa-plus me-1" aria-hidden="true"></i> Nuevo
            </button>
          </div>
          <div class="row g-2 align-items-end mb-2 roles-series-filters">
            <div class="col-12 col-sm-5 col-md-4">
              <label class="form-label small mb-0" for="roles-series-filter-emp">Empleado</label>
              <select id="roles-series-filter-emp" class="form-select form-select-sm">
                <option value="">Todos los empleados</option>
                ${empOpts}
              </select>
            </div>
            <div class="col-12 col-sm-7 col-md-8">
              <label class="form-label small mb-0" for="roles-series-filter-q">Buscar</label>
              <div class="input-group input-group-sm">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i></span>
                <input type="search" id="roles-series-filter-q" class="form-control"
                  placeholder="Opción, empleado, CODDOC…"
                  value="${this.escapeHtml(this._seriesFilterQ || '')}"
                  autocomplete="off">
              </div>
            </div>
          </div>
          <div id="roles-series-body">${this.renderSeriesTableHtml()}</div>
        </div>
      </div>
    `;
  },

  filteredSeriesRows() {
    let rows = [...(this._seriesRows || [])];
    const emp = String(this._seriesFilterEmp || '').trim();
    if (emp) {
      rows = rows.filter((r) => String(r.CODEMP) === emp);
    }
    const q = String(this._seriesFilterQ || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const hay = [
          r.OPCION,
          r.CODEMP,
          r.NOMEMPLEADO,
          r.CODDOC,
          r.DESDOC,
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      });
    }
    rows.sort((a, b) => {
      const na = String(a.NOMEMPLEADO || a.CODEMP || '').localeCompare(
        String(b.NOMEMPLEADO || b.CODEMP || ''),
        'es',
        { sensitivity: 'base' }
      );
      if (na !== 0) return na;
      return String(a.OPCION || '').localeCompare(String(b.OPCION || ''), 'es', { sensitivity: 'base' });
    });
    return rows;
  },

  renderSeriesTableHtml() {
    if (this._seriesLoading) {
      return '<p class="text-muted small mb-0 py-3 text-center"><i class="fa-solid fa-spinner fa-spin me-1"></i>Cargando…</p>';
    }
    const all = this._seriesRows || [];
    if (!all.length) {
      return '<p class="text-muted small mb-0 py-3 text-center">Sin series por defecto. Agregue una para predeterminar CODDOC por empleado.</p>';
    }
    const rows = this.filteredSeriesRows();
    if (!rows.length) {
      return '<p class="text-muted small mb-0 py-3 text-center">Ningún registro coincide con el filtro.</p>';
    }
    const body = rows
      .map((r) => {
        const empLabel = r.NOMEMPLEADO
          ? `${r.NOMEMPLEADO} (${r.CODEMP})`
          : `Empleado ${r.CODEMP ?? '—'}`;
        const docLabel =
          String(r.OPCION || '') === 'CAJAS'
            ? r.DESDOC
              ? `${r.CODDOC} — ${r.DESDOC}`
              : `Caja ${r.CODDOC || '—'}`
            : r.DESDOC
              ? `${r.CODDOC} — ${r.DESDOC}`
              : r.CODDOC || '—';
        return `
          <tr data-series-id="${this.escapeHtml(r.ID)}">
            <td>${this.escapeHtml(empLabel)}</td>
            <td>${this.escapeHtml(r.OPCION || '—')}</td>
            <td>${this.escapeHtml(docLabel)}</td>
            <td class="text-end">
              <div class="catalogo-acciones">
                ${typeof CatalogosUI !== 'undefined' ? CatalogosUI.btnEditar(r.ID, 'id') : ''}
                ${typeof CatalogosUI !== 'undefined' ? CatalogosUI.btnEliminar(r.ID, 'id') : ''}
              </div>
            </td>
          </tr>
        `;
      })
      .join('');
    return `
      <div class="table-responsive roles-series-table-wrap">
        <table class="table table-sm align-middle mb-0 roles-series-table">
          <thead>
            <tr>
              <th>Empleado</th>
              <th>Opción</th>
              <th>Serie / Caja</th>
              <th class="text-end">Acciones</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
  },

  refreshSeriesPanel() {
    if (this._selectedCod != null) return;
    const card = this._container?.querySelector('#roles-series-card');
    if (!card) return;
    const empSel = card.querySelector('#roles-series-filter-emp');
    const qInp = card.querySelector('#roles-series-filter-q');
    if (empSel) {
      // Rehydrate options if empleados acabaron de cargar
      const prev = this._seriesFilterEmp || empSel.value || '';
      const empOpts = [
        '<option value="">Todos los empleados</option>',
        ...(this._seriesEmpleados || []).map((e) => {
          const sel = String(prev) === String(e.CODEMPLEADO) ? ' selected' : '';
          const label = `${e.NOMEMPLEADO || '—'} (${e.CODEMPLEADO})`;
          return `<option value="${this.escapeHtml(e.CODEMPLEADO)}"${sel}>${this.escapeHtml(label)}</option>`;
        }),
      ].join('');
      empSel.innerHTML = empOpts;
      this._seriesFilterEmp = empSel.value || '';
    }
    if (qInp) this._seriesFilterQ = qInp.value || '';
    const body = card.querySelector('#roles-series-body');
    if (body) body.innerHTML = this.renderSeriesTableHtml();
    this.bindSeriesRowActions();
  },

  syncSeriesFiltersFromDom() {
    const empSel = this._container?.querySelector('#roles-series-filter-emp');
    const qInp = this._container?.querySelector('#roles-series-filter-q');
    this._seriesFilterEmp = empSel?.value || '';
    this._seriesFilterQ = qInp?.value || '';
  },

  renderEditor(tipo) {
    const cod = Number(tipo.value);
    const full = this.isFullAccess(cod);
    const selected = new Set(full ? [] : this.menusForTipo(cod) || []);
    const groupsHtml = (this._groups || [])
      .map((g) => {
        const items = (g.menus || [])
          .map((m) => {
            const checked = full || selected.has(m.key);
            const disabled = full ? ' disabled' : '';
            return `
              <label class="roles-menu-item">
                <input type="checkbox" class="form-check-input roles-menu-check" value="${this.escapeHtml(m.key)}"${
                  checked ? ' checked' : ''
                }${disabled}>
                <span>${this.escapeHtml(m.label || m.key)}</span>
              </label>
            `;
          })
          .join('');
        const checkedCount = full
          ? g.menus.length
          : (g.menus || []).filter((m) => selected.has(m.key)).length;
        return `
          <section class="roles-group-card">
            <div class="roles-group-head">
              <div>
                <h3 class="roles-group-title">${this.escapeHtml(g.title)}</h3>
                <p class="roles-group-meta mb-0">${checkedCount} / ${g.menus.length}</p>
              </div>
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" class="btn btn-outline-secondary roles-group-all" data-group="${this.escapeHtml(
                  g.id
                )}"${full ? ' disabled' : ''}>Todas</button>
                <button type="button" class="btn btn-outline-secondary roles-group-none" data-group="${this.escapeHtml(
                  g.id
                )}"${full ? ' disabled' : ''}>Ninguna</button>
              </div>
            </div>
            <div class="roles-menu-grid" data-group-menus="${this.escapeHtml(g.id)}">${items}</div>
          </section>
        `;
      })
      .join('');

    return `
      <div class="roles-editor">
        <div class="roles-editor-header">
          <div>
            <h3 class="h6 mb-1">${this.escapeHtml(tipo.label || tipo.code)}</h3>
            <p class="text-muted small mb-0">Código ${cod}</p>
          </div>
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" id="roles-full-access"${full ? ' checked' : ''}>
            <label class="form-check-label" for="roles-full-access">Acceso a todas las opciones</label>
          </div>
        </div>
        <div class="roles-groups">${groupsHtml}</div>
        <button type="button" class="btn-roles-guardar-fab" id="roles-btn-guardar"
          title="Guardar acceso" aria-label="Guardar acceso"${this._saving ? ' disabled' : ''}>
          <i class="fa-solid ${this._saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}" aria-hidden="true"></i>
          <span class="roles-guardar-fab-label">${this._saving ? 'Guardando…' : 'Guardar'}</span>
        </button>
      </div>
    `;
  },

  collectCheckedMenus() {
    const full = this._container?.querySelector('#roles-full-access')?.checked;
    if (full) return null;
    const checks = this._container?.querySelectorAll('.roles-menu-check:checked') || [];
    const menus = Array.from(checks).map((el) => el.value).filter(Boolean);
    if (!menus.includes('inicio')) menus.unshift('inicio');
    return [...new Set(menus)];
  },

  seriesRuleFor(opcion) {
    return this._seriesReglas?.[String(opcion || '').trim()] || null;
  },

  seriesCoddocOptionsHtml(opcion, selectedCoddoc = '') {
    const rule = this.seriesRuleFor(opcion);
    if (!rule) {
      return '<option value="">— Seleccione opción primero —</option>';
    }
    if (rule.kind === 'caja') {
      const rows = this._seriesCajas || [];
      if (!rows.length) return '<option value="">Sin cajas</option>';
      return [
        '<option value="">— Seleccione caja —</option>',
        ...rows.map((c) => {
          const val = String(c.CODCAJA);
          const sel = String(selectedCoddoc) === val ? ' selected' : '';
          const label = c.DESCAJA ? `${c.DESCAJA} (${c.CODCAJA})` : `Caja ${c.CODCAJA}`;
          return `<option value="${this.escapeHtml(val)}"${sel}>${this.escapeHtml(label)}</option>`;
        }),
      ].join('');
    }
    const allowed = new Set((rule.tipodocs || []).map((t) => String(t).toUpperCase()));
    const rows = (this._seriesTipodocs || []).filter((t) =>
      allowed.has(String(t.TIPODOC || '').trim().toUpperCase())
    );
    if (!rows.length) {
      return `<option value="">Sin series ${[...allowed].join(', ')}</option>`;
    }
    return [
      '<option value="">— Seleccione CODDOC —</option>',
      ...rows.map((t) => {
        const sel = String(selectedCoddoc) === String(t.CODDOC) ? ' selected' : '';
        const label = t.DESDOC ? `${t.CODDOC} — ${t.DESDOC}` : t.CODDOC;
        return `<option value="${this.escapeHtml(t.CODDOC)}"${sel}>${this.escapeHtml(label)}</option>`;
      }),
    ].join('');
  },

  refreshSeriesCoddocSelect(selectedCoddoc = '') {
    const opcion = document.getElementById('roles-series-opcion')?.value?.trim() || '';
    const sel = document.getElementById('roles-series-coddoc');
    const label = document.getElementById('roles-series-coddoc-label');
    if (!sel) return;
    const rule = this.seriesRuleFor(opcion);
    if (label) {
      label.innerHTML =
        rule?.kind === 'caja'
          ? 'Caja <span class="text-danger">*</span>'
          : 'CODDOC <span class="text-danger">*</span>';
    }
    sel.innerHTML = this.seriesCoddocOptionsHtml(opcion, selectedCoddoc);
  },

  seriesFormHtml(row = null) {
    const opciones = (this._seriesOpciones || [])
      .map((o) => {
        const sel = String(row?.OPCION || '') === o ? ' selected' : '';
        return `<option value="${this.escapeHtml(o)}"${sel}>${this.escapeHtml(o)}</option>`;
      })
      .join('');
    const empleados = (this._seriesEmpleados || [])
      .map((e) => {
        const sel = Number(row?.CODEMP) === Number(e.CODEMPLEADO) ? ' selected' : '';
        const label = `${e.NOMEMPLEADO || '—'} (${e.CODEMPLEADO})`;
        return `<option value="${this.escapeHtml(e.CODEMPLEADO)}"${sel}>${this.escapeHtml(label)}</option>`;
      })
      .join('');
    const opcionInicial = row?.OPCION || '';
    const coddocOpts = this.seriesCoddocOptionsHtml(opcionInicial, row?.CODDOC || '');
    const rule = this.seriesRuleFor(opcionInicial);
    const coddocLabel =
      rule?.kind === 'caja'
        ? 'Caja <span class="text-danger">*</span>'
        : 'CODDOC <span class="text-danger">*</span>';
    return `
      <div class="text-start">
        <div class="mb-2">
          <label class="form-label small mb-0" for="roles-series-codemp">Empleado <span class="text-danger">*</span></label>
          <select id="roles-series-codemp" class="form-select form-select-sm">
            <option value="">— Seleccione —</option>
            ${empleados}
          </select>
        </div>
        <div class="mb-2">
          <label class="form-label small mb-0" for="roles-series-opcion">Opción <span class="text-danger">*</span></label>
          <select id="roles-series-opcion" class="form-select form-select-sm">
            <option value="">— Seleccione —</option>
            ${opciones}
          </select>
        </div>
        <div class="mb-0">
          <label class="form-label small mb-0" id="roles-series-coddoc-label" for="roles-series-coddoc">${coddocLabel}</label>
          <select id="roles-series-coddoc" class="form-select form-select-sm">
            ${coddocOpts}
          </select>
        </div>
      </div>
    `;
  },

  readSeriesForm() {
    return {
      OPCION: document.getElementById('roles-series-opcion')?.value?.trim() || '',
      CODEMP: document.getElementById('roles-series-codemp')?.value?.trim() || '',
      CODDOC: document.getElementById('roles-series-coddoc')?.value?.trim() || '',
    };
  },

  async showSeriesForm(row = null) {
    if (this._seriesSaving) return;
    if (!this._seriesEmpleados.length) {
      F.toast('No hay empleados activos para esta empresa', 'warning');
      return;
    }
    if (!this._seriesTipodocs.length && !this._seriesCajas.length) {
      F.toast('No hay series ni cajas disponibles', 'warning');
      return;
    }
    const editing = Boolean(row?.ID);
    const value = await CatalogosUI.fireForm({
      title: editing ? 'Editar serie por defecto' : 'Nueva serie por defecto',
      html: this.seriesFormHtml(row),
      width: 480,
      didOpen: () => {
        document.getElementById('roles-series-opcion')?.addEventListener('change', () => {
          this.refreshSeriesCoddocSelect('');
        });
      },
      preConfirm: () => {
        const data = this.readSeriesForm();
        if (!data.OPCION) {
          Swal.showValidationMessage('Seleccione la opción');
          return false;
        }
        if (!data.CODEMP) {
          Swal.showValidationMessage('Seleccione el empleado');
          return false;
        }
        const rule = this.seriesRuleFor(data.OPCION);
        if (!data.CODDOC) {
          Swal.showValidationMessage(
            rule?.kind === 'caja' ? 'Seleccione una caja' : 'Seleccione el CODDOC'
          );
          return false;
        }
        return data;
      },
    });
    if (!value) return;

    this._seriesSaving = true;
    try {
      if (editing) {
        await F.fetchJson(this.seriesApiUrl(`/${row.ID}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        F.toast('Serie por defecto actualizada', 'success');
      } else {
        await F.fetchJson(this.seriesApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        F.toast('Serie por defecto creada', 'success');
      }
      await this.fetchSeriesDefault();
    } catch (err) {
      F.toast(err.message || 'No se pudo guardar', 'error');
    } finally {
      this._seriesSaving = false;
    }
  },

  async deleteSeriesRow(id) {
    const row = this._seriesRows.find((r) => Number(r.ID) === Number(id));
    if (!row) return;
    const conf = await CatalogosUI.fireConfirm({
      title: '¿Eliminar serie por defecto?',
      text: `${row.OPCION || ''} · empleado ${row.CODEMP || ''} · ${row.CODDOC || ''}`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-modal-eliminar',
    });
    if (!conf) return;
    try {
      await F.fetchJson(this.seriesApiUrl(`/${id}`), { method: 'DELETE' });
      F.toast('Serie eliminada', 'success');
      await this.fetchSeriesDefault();
    } catch (err) {
      F.toast(err.message || 'No se pudo eliminar', 'error');
    }
  },

  bindSeriesEvents() {
    const empSel = this._container?.querySelector('#roles-series-filter-emp');
    const qInp = this._container?.querySelector('#roles-series-filter-q');
    empSel?.addEventListener('change', () => {
      this.syncSeriesFiltersFromDom();
      const body = this._container?.querySelector('#roles-series-body');
      if (body) body.innerHTML = this.renderSeriesTableHtml();
      this.bindSeriesRowActions();
    });
    qInp?.addEventListener('input', () => {
      this.syncSeriesFiltersFromDom();
      const body = this._container?.querySelector('#roles-series-body');
      if (body) body.innerHTML = this.renderSeriesTableHtml();
      this.bindSeriesRowActions();
    });
    this._container?.querySelector('#roles-series-nuevo')?.addEventListener('click', () => {
      this.showSeriesForm(null);
    });
    this.bindSeriesRowActions();
  },

  bindSeriesRowActions() {
    this._container?.querySelectorAll('#roles-series-body .btn-catalogo-editar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const row = this._seriesRows.find((r) => Number(r.ID) === Number(id));
        if (row) this.showSeriesForm(row);
      });
    });
    this._container?.querySelectorAll('#roles-series-body .btn-catalogo-eliminar').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (id) this.deleteSeriesRow(id);
      });
    });
  },

  bindEvents() {
    this._container?.querySelectorAll('.roles-tipo-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._selectedCod = parseInt(btn.dataset.codtipo, 10);
        this._dirty = false;
        this.render();
      });
    });

    this._container?.querySelector('#roles-btn-volver')?.addEventListener('click', async () => {
      if (this._dirty) {
        const conf = await Swal.fire({
          title: '¿Salir sin guardar?',
          text: 'Hay cambios sin guardar en este rol.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Salir',
          cancelButtonText: 'Quedarme',
        });
        if (!conf.isConfirmed) return;
      }
      this._selectedCod = null;
      this._dirty = false;
      this.render();
    });

    this.bindSeriesEvents();

    const fullEl = this._container?.querySelector('#roles-full-access');
    fullEl?.addEventListener('change', () => {
      this._dirty = true;
      if (fullEl.checked) {
        this._acceso[String(this._selectedCod)] = null;
      } else {
        const allKeys = this._groups.flatMap((g) => (g.menus || []).map((m) => m.key));
        this._acceso[String(this._selectedCod)] = [...new Set(['inicio', ...allKeys])];
      }
      this.render();
    });

    this._container?.querySelectorAll('.roles-menu-check').forEach((chk) => {
      chk.addEventListener('change', () => {
        this._dirty = true;
        if (chk.value === 'inicio' && !chk.checked) {
          chk.checked = true;
          F.toast('Inicio siempre debe estar disponible', 'info');
          return;
        }
        this._acceso[String(this._selectedCod)] = this.collectCheckedMenus();
        this.updateGroupCounts();
      });
    });

    this._container?.querySelectorAll('.roles-group-all').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.group;
        this._container
          ?.querySelectorAll(`[data-group-menus="${gid}"] .roles-menu-check`)
          .forEach((chk) => {
            chk.checked = true;
          });
        this._dirty = true;
        this._acceso[String(this._selectedCod)] = this.collectCheckedMenus();
        this.updateGroupCounts();
      });
    });

    this._container?.querySelectorAll('.roles-group-none').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gid = btn.dataset.group;
        this._container
          ?.querySelectorAll(`[data-group-menus="${gid}"] .roles-menu-check`)
          .forEach((chk) => {
            if (chk.value === 'inicio') {
              chk.checked = true;
              return;
            }
            chk.checked = false;
          });
        this._dirty = true;
        this._acceso[String(this._selectedCod)] = this.collectCheckedMenus();
        this.updateGroupCounts();
      });
    });

    this._container?.querySelector('#roles-btn-guardar')?.addEventListener('click', () => this.save());
  },

  updateGroupCounts() {
    this._container?.querySelectorAll('.roles-group-card').forEach((card) => {
      const checks = card.querySelectorAll('.roles-menu-check');
      const checked = card.querySelectorAll('.roles-menu-check:checked').length;
      const meta = card.querySelector('.roles-group-meta');
      if (meta) meta.textContent = `${checked} / ${checks.length}`;
    });
  },

  async save() {
    if (this._saving || this._selectedCod == null) return;
    const full = Boolean(this._container?.querySelector('#roles-full-access')?.checked);
    const menus = full ? null : this.collectCheckedMenus();
    this._saving = true;
    this.render();
    try {
      const body = full ? { fullAccess: true } : { menus };
      const data = await F.fetchJson(`/api/roles-usuarios/${this._selectedCod}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      this._acceso[String(this._selectedCod)] = data.menus === undefined ? (full ? null : menus) : data.menus;
      if (typeof TipoEmpleadoAccess !== 'undefined') {
        TipoEmpleadoAccess.applyMenuAccesoMap(this._acceso);
        TipoEmpleadoAccess.applySidebarVisibility();
      }
      this._dirty = false;
      F.toast('Acceso del rol actualizado', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo guardar', 'error');
    } finally {
      this._saving = false;
      this.render();
    }
  },
};
