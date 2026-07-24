/**
 * Licencia de instalación (módulos comprados).
 * Se combina con TipoEmpleadoAccess: licencia ∩ rol.
 */
const LicenseAccess = {
  _status: null,
  _loading: null,

  async refresh() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      try {
        const data = await F.fetchJson(`/api/license/status?_=${Date.now()}`, {
          cache: 'no-store',
        });
        this._status = data;
        return data;
      } catch (err) {
        console.warn('[LicenseAccess]', err?.message || err);
        this._status = {
          mode: 'open',
          status: 'open',
          menus: null,
          modules: [],
          message: err?.message || 'No se pudo leer la licencia',
        };
        return this._status;
      } finally {
        this._loading = null;
      }
    })();
    return this._loading;
  },

  status() {
    return this._status;
  },

  /** null = todos los menús (modo abierto). */
  allowedMenus() {
    const st = this._status;
    if (!st || st.menus === null || st.mode === 'open') return null;
    return new Set(st.menus || ['inicio', 'licencia']);
  },

  canAccessMenu(menuKey) {
    const key = String(menuKey || '').trim();
    if (!key) return false;
    if (key === 'inicio' || key === 'licencia') return true;
    const allowed = this.allowedMenus();
    if (!allowed) return true;
    return allowed.has(key);
  },

  applyAfterRoleFilter() {
    const licensed = this.allowedMenus();
    if (!licensed) return;
    document.querySelectorAll('.sidebar-link[data-menu]').forEach((link) => {
      const key = link.dataset.menu;
      if (key === 'licencia' || key === 'inicio') {
        const li = link.closest('li');
        if (li) li.hidden = false;
        return;
      }
      if (!licensed.has(key)) {
        const li = link.closest('li');
        if (li) li.hidden = true;
      }
    });
    document.querySelectorAll('.sidebar-accordion .accordion-item').forEach((item) => {
      if (item.classList.contains('sidebar-favoritos-item')) {
        item.hidden = false;
        return;
      }
      const links = item.querySelectorAll('.sidebar-link[data-menu]');
      const anyVisible = Array.from(links).some((link) => {
        const li = link.closest('li');
        return li && !li.hidden;
      });
      item.hidden = !anyVisible;
    });
    if (typeof MenuFavoritos !== 'undefined') {
      MenuFavoritos.render();
    }
  },
};
