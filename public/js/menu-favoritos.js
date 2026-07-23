/**
 * Favoritos del menú lateral — preferencia por dispositivo (localStorage).
 * Clona opciones autorizadas del sidebar; no altera permisos del servidor.
 */
const MenuFavoritos = {
  STORAGE_PREFIX: 'onneb-menu-favoritos',
  EXCLUDE_KEYS: new Set(['inicio']),

  escapeHtml(value) {
    if (value == null) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  storageKey() {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    const emp = String(user?.empNit || (typeof F !== 'undefined' ? F.getEmpNit() : '') || 'sin-emp').trim();
    const who = user?.superUser
      ? 'su'
      : String(user?.codempleado || user?.usuario || user?.username || 'anon').trim();
    return `${this.STORAGE_PREFIX}:${emp}:${who}`;
  },

  loadKeys() {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const keys = Array.isArray(parsed?.keys) ? parsed.keys : Array.isArray(parsed) ? parsed : [];
      return keys.map((k) => String(k || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  },

  saveKeys(keys) {
    const clean = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))];
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify({ keys: clean }));
    } catch (err) {
      if (typeof F !== 'undefined') {
        F.toast(err.message || 'No se pudieron guardar los favoritos', 'error');
      }
    }
    return clean;
  },

  canAccess(key) {
    if (!key || this.EXCLUDE_KEYS.has(key)) return false;
    if (typeof TipoEmpleadoAccess === 'undefined') return true;
    return TipoEmpleadoAccess.canAccessMenu(key);
  },

  /** Enlaces canónicos del menú (sin clones de favoritos ni Configurar). */
  catalogLinks() {
    return Array.from(
      document.querySelectorAll(
        '#sidebar .sidebar-link[data-menu]:not(.js-favorito):not([data-favoritos-config])'
      )
    );
  },

  catalogByKey() {
    const map = new Map();
    for (const link of this.catalogLinks()) {
      const key = String(link.dataset.menu || '').trim();
      if (!key || this.EXCLUDE_KEYS.has(key) || map.has(key)) continue;
      const icon = link.querySelector('i')?.outerHTML || '<i class="fa-solid fa-circle" aria-hidden="true"></i>';
      const label = link.textContent.replace(/\s+/g, ' ').trim();
      map.set(key, { key, label, iconHtml: icon });
    }
    return map;
  },

  authorizedCandidates() {
    return [...this.catalogByKey().values()]
      .filter((item) => this.canAccess(item.key))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  },

  listEl() {
    return document.getElementById('sidebar-favoritos-list');
  },

  render() {
    const list = this.listEl();
    if (!list) return;

    list.querySelectorAll('li.js-favorito-wrap').forEach((li) => li.remove());

    const catalog = this.catalogByKey();
    const keys = this.loadKeys().filter((k) => this.canAccess(k) && catalog.has(k));

    for (const key of keys) {
      const item = catalog.get(key);
      if (!item) continue;
      const li = document.createElement('li');
      li.className = 'js-favorito-wrap';
      li.innerHTML = `<a href="#" class="sidebar-link js-favorito" data-menu="${this.escapeHtml(key)}">${item.iconHtml} ${this.escapeHtml(item.label)}</a>`;
      list.appendChild(li);
    }
  },

  openConfig() {
    const candidates = this.authorizedCandidates();
    if (!candidates.length) {
      if (typeof F !== 'undefined') {
        F.toast('No hay opciones de menú disponibles para favoritos', 'warning');
      }
      return;
    }

    const selected = new Set(this.loadKeys().filter((k) => this.canAccess(k)));
    const rows = candidates
      .map((c) => {
        const checked = selected.has(c.key) ? ' checked' : '';
        return `<label class="favoritos-config-row">
          <input type="checkbox" class="form-check-input favoritos-config-check" value="${this.escapeHtml(c.key)}"${checked}>
          <span class="favoritos-config-icon">${c.iconHtml}</span>
          <span class="favoritos-config-label">${this.escapeHtml(c.label)}</span>
        </label>`;
      })
      .join('');

    const modalOpts =
      typeof CatalogosUI !== 'undefined'
        ? CatalogosUI.modalBase()
        : { customClass: { popup: 'modal-catalogo' } };

    Swal.fire({
      ...modalOpts,
      title: 'Configurar Favoritos',
      width: 'min(28rem, 96vw)',
      html: `
        <p class="small text-muted text-start mb-2">
          Elija las vistas autorizadas que desea ver en <strong>Favoritos</strong>. Se guardan solo en este dispositivo.
        </p>
        <div class="favoritos-config-list text-start">${rows}</div>
      `,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined'
          ? CatalogosUI.guardarButtonHtml('Guardar')
          : 'Guardar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined'
          ? CatalogosUI.cancelButtonHtml('Cancelar')
          : 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const checks = Swal.getPopup()?.querySelectorAll('.favoritos-config-check:checked') || [];
        return Array.from(checks).map((el) => el.value);
      },
    }).then((result) => {
      if (!result.isConfirmed) return;
      this.saveKeys(result.value || []);
      this.render();
      if (typeof F !== 'undefined') F.toast('Favoritos actualizados', 'success');
    });
  },

  bind() {
    if (this._bound) return;
    this._bound = true;
    document.getElementById('sidebar')?.addEventListener('click', (e) => {
      const cfg = e.target.closest('[data-favoritos-config], #btn-favoritos-config');
      if (!cfg) return;
      e.preventDefault();
      e.stopPropagation();
      this.openConfig();
    });
  },
};
