/**
 * Configuración → Roles de usuarios
 * Asigna opciones de menú por tipo de empleado (submenús del sidebar).
 */
const RolesUsuariosView = {
  _container: null,
  _tipos: [],
  _groups: [],
  _acceso: {},
  _selectedCod: null,
  _dirty: false,
  _saving: false,

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
    window._onnebTiposEmpleadoCache = this._tipos;
    if (typeof TipoEmpleadoAccess !== 'undefined') {
      TipoEmpleadoAccess.applyMenuAccesoMap(this._acceso);
    }
    return data;
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
            <p class="text-muted small mb-0">Seleccione un tipo de empleado y marque las opciones de cada submenú a las que tendrá acceso.</p>
          </div>
          ${
            tipo
              ? `<button type="button" class="btn btn-outline-secondary btn-sm" id="roles-btn-volver">
                   <i class="fa-solid fa-arrow-left me-1" aria-hidden="true"></i> Volver
                 </button>`
              : ''
          }
        </div>
        ${tipo ? this.renderEditor(tipo) : this.renderTipoList()}
      </div>
    `;
    this.bindEvents();
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
      <div class="roles-tipo-grid">
        ${cards || '<p class="text-muted mb-0">No hay tipos de empleado definidos.</p>'}
      </div>
    `;
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
