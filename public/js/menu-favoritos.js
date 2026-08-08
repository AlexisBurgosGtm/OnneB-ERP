/**
 * Favoritos del menú lateral — preferencia por dispositivo (localStorage).
 * Clona opciones autorizadas del sidebar; no altera permisos del servidor.
 * Incluye FAB flotante arrastrable para abrir el menú de favoritos.
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

  favoriteItems() {
    const catalog = this.catalogByKey();
    return this.loadKeys()
      .filter((k) => this.canAccess(k) && catalog.has(k))
      .map((k) => catalog.get(k))
      .filter(Boolean);
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

  navigateTo(key) {
    const link =
      document.querySelector(`#sidebar .sidebar-link[data-menu="${key}"]:not(.js-favorito)`) ||
      document.querySelector(`#sidebar .sidebar-link[data-menu="${key}"]`);
    if (link) {
      link.click();
      return;
    }
    if (typeof F !== 'undefined') {
      F.toast('No se encontró la opción en el menú', 'warning');
    }
  },

  /** Modal rápido con los favoritos guardados (navegación). */
  openMenu() {
    const items = this.favoriteItems();
    const modalOpts =
      typeof CatalogosUI !== 'undefined'
        ? CatalogosUI.modalBase()
        : { customClass: { popup: 'modal-catalogo' } };

    if (!items.length) {
      Swal.fire({
        ...modalOpts,
        title: 'Favoritos',
        html: `<p class="small text-muted mb-0">Aún no tiene favoritos. Puede configurarlos desde el menú lateral (Favoritos).</p>`,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText:
          typeof CatalogosUI !== 'undefined'
            ? CatalogosUI.cancelButtonHtml('Cerrar')
            : 'Cerrar',
      });
      return;
    }

    const rows = items
      .map(
        (c) => `
        <button type="button" class="favoritos-menu-item" data-favorito-nav="${this.escapeHtml(c.key)}">
          <span class="favoritos-config-icon">${c.iconHtml}</span>
          <span class="favoritos-config-label">${this.escapeHtml(c.label)}</span>
        </button>`
      )
      .join('');

    Swal.fire({
      ...modalOpts,
      title: 'Favoritos',
      width: 'min(26rem, 96vw)',
      html: `<div class="favoritos-menu-list text-start">${rows}</div>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText:
        typeof CatalogosUI !== 'undefined'
          ? CatalogosUI.cancelButtonHtml('Cerrar')
          : 'Cerrar',
      didOpen: () => {
        const popup = Swal.getPopup();
        popup?.querySelectorAll('[data-favorito-nav]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-favorito-nav');
            Swal.close();
            this.navigateTo(key);
          });
        });
      },
    });
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
    FavoritosFab.init();
  },
};

/**
 * Botón flotante arrastrable (Asistente) → abre el modal de menú Favoritos.
 * Posición persistida en localStorage por dispositivo.
 */
const FavoritosFab = {
  POS_KEY: 'onneb-favoritos-fab-pos',
  SIZE: 56,
  WIDTH_FALLBACK: 56,
  MARGIN: 8,
  BOTTOM_DEFAULT: 20, // ~1.25rem
  DRAG_THRESHOLD: 6,

  el() {
    return document.getElementById('btn-favoritos-fab');
  },

  measure() {
    const btn = this.el();
    if (!btn) return { w: this.WIDTH_FALLBACK, h: this.SIZE };
    const rect = btn.getBoundingClientRect();
    return {
      w: Math.max(rect.width || this.WIDTH_FALLBACK, 1),
      h: Math.max(rect.height || this.SIZE, 1),
    };
  },

  loadPos() {
    try {
      const raw = localStorage.getItem(this.POS_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      const left = Number(p?.left);
      const top = Number(p?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left, top };
    } catch {
      return null;
    }
  },

  savePos(left, top) {
    try {
      localStorage.setItem(this.POS_KEY, JSON.stringify({ left, top }));
    } catch {
      /* ignore quota */
    }
  },

  defaultPos() {
    const w = window.innerWidth || 360;
    const h = window.innerHeight || 640;
    const size = this.measure();
    return {
      left: Math.max(this.MARGIN, (w - size.w) / 2),
      top: Math.max(this.MARGIN, h - this.BOTTOM_DEFAULT - size.h),
    };
  },

  clamp(left, top) {
    const size = this.measure();
    const maxL = Math.max(this.MARGIN, (window.innerWidth || 0) - size.w - this.MARGIN);
    const maxT = Math.max(this.MARGIN, (window.innerHeight || 0) - size.h - this.MARGIN);
    return {
      left: Math.min(Math.max(this.MARGIN, left), maxL),
      top: Math.min(Math.max(this.MARGIN, top), maxT),
    };
  },

  applyPos(left, top) {
    const btn = this.el();
    if (!btn) return;
    const p = this.clamp(left, top);
    btn.style.left = `${p.left}px`;
    btn.style.top = `${p.top}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    return p;
  },

  restoreOrDefault() {
    const saved = this.loadPos();
    const pos = saved || this.defaultPos();
    this.applyPos(pos.left, pos.top);
  },

  setVisible(visible) {
    const btn = this.el();
    if (!btn) return;
    btn.classList.toggle('is-visible', Boolean(visible));
    btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) this.restoreOrDefault();
  },

  init() {
    if (this._bound) return;
    const btn = this.el();
    if (!btn) return;
    this._bound = true;

    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let pointerId = null;

    const onPointerDown = (e) => {
      if (e.button != null && e.button !== 0) return;
      const rect = btn.getBoundingClientRect();
      dragging = true;
      moved = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left;
      originTop = rect.top;
      btn.classList.add('is-dragging');
      try {
        btn.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      e.preventDefault();
    };

    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) >= this.DRAG_THRESHOLD) moved = true;
      if (!moved) return;
      this.applyPos(originLeft + dx, originTop + dy);
    };

    const onPointerUp = (e) => {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove('is-dragging');
      try {
        if (pointerId != null) btn.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      pointerId = null;
      if (moved) {
        const rect = btn.getBoundingClientRect();
        const p = this.applyPos(rect.left, rect.top);
        this.savePos(p.left, p.top);
        return;
      }
      if (typeof MenuFavoritos !== 'undefined') MenuFavoritos.openMenu();
    };

    btn.addEventListener('pointerdown', onPointerDown);
    btn.addEventListener('pointermove', onPointerMove);
    btn.addEventListener('pointerup', onPointerUp);
    btn.addEventListener('pointercancel', onPointerUp);
    btn.addEventListener('click', (e) => {
      // Evita click nativo tras drag; el openMenu se dispara en pointerup si no hubo drag.
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('resize', () => {
      if (!btn.classList.contains('is-visible')) return;
      const rect = btn.getBoundingClientRect();
      const p = this.applyPos(rect.left, rect.top);
      this.savePos(p.left, p.top);
    });

    this.restoreOrDefault();
  },
};
