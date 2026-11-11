/**
 * Botón Finalizar en documentos — posición arrastrable (localStorage por vista).
 * Activo solo si SETTINGS PERMITE MOVER BOTON FINALIZAR EN DOCS = SI.
 * El botón vive en un portal dentro de .pos-vista-wrap (no en body) para no superponer vistas.
 */
const DocFinalizarFab = {
  STORAGE_PREFIX: 'onneb-doc-finalizar-pos',
  STORAGE_VERSION: 2,
  DRAG_THRESHOLD: 6,
  MARGIN: 8,
  INSET_BOTTOM: 20,
  INSET_RIGHT_DESKTOP: 20,
  INSET_RIGHT_MOBILE: 16,

  _registry: new Map(),
  _lastActiveKey: null,

  isEnabled(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase() === 'SI';
  },

  resolveScope(scope, btn) {
    const root =
      scope?.closest?.('.pos-vista-wrap') ||
      btn?.closest?.('.pos-vista-wrap') ||
      scope ||
      btn?.parentElement;
    return root || null;
  },

  storageKey(viewKey) {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    const emp = String(user?.empNit || (typeof F !== 'undefined' ? F.getEmpNit() : '') || 'sin-emp').trim();
    return `${this.STORAGE_PREFIX}:${emp}:${String(viewKey || 'doc').trim()}`;
  },

  loadPos(viewKey) {
    try {
      const raw = localStorage.getItem(this.storageKey(viewKey));
      if (!raw) return null;
      const p = JSON.parse(raw);
      if (Number(p?.v) !== this.STORAGE_VERSION) return null;
      const left = Number(p?.left);
      const top = Number(p?.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
      return { left, top };
    } catch {
      return null;
    }
  },

  savePos(viewKey, left, top) {
    try {
      localStorage.setItem(
        this.storageKey(viewKey),
        JSON.stringify({ v: this.STORAGE_VERSION, left, top })
      );
    } catch {
      /* quota */
    }
  },

  measure(btn) {
    const rect = btn.getBoundingClientRect();
    return {
      w: Math.max(rect.width || 120, 1),
      h: Math.max(rect.height || 44, 1),
    };
  },

  rightInset() {
    try {
      if (window.matchMedia('(max-width: 991.98px)').matches) return this.INSET_RIGHT_MOBILE;
    } catch {
      /* ignore */
    }
    return this.INSET_RIGHT_DESKTOP;
  },

  portalSize(portal) {
    const w = Math.max(portal?.clientWidth || 0, portal?.getBoundingClientRect?.().width || 0, 1);
    const h = Math.max(portal?.clientHeight || 0, portal?.getBoundingClientRect?.().height || 0, 1);
    return { w, h };
  },

  clamp(btn, left, top, portal) {
    const size = this.measure(btn);
    const { w: pw, h: ph } = this.portalSize(portal);
    const maxL = Math.max(this.MARGIN, pw - size.w - this.MARGIN);
    const maxT = Math.max(this.MARGIN, ph - size.h - this.MARGIN);
    return {
      left: Math.min(Math.max(this.MARGIN, left), maxL),
      top: Math.min(Math.max(this.MARGIN, top), maxT),
    };
  },

  applyPos(btn, left, top, portal) {
    const p = this.clamp(btn, left, top, portal);
    btn.style.left = `${p.left}px`;
    btn.style.top = `${p.top}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
    return p;
  },

  /** Esquina inferior derecha (misma que .pos-fab-bar en desktop). */
  defaultPos(btn, portal) {
    const size = this.measure(btn);
    const { w: pw, h: ph } = this.portalSize(portal);
    const insetR = this.rightInset();
    const insetB = this.INSET_BOTTOM;
    return {
      left: Math.max(this.MARGIN, pw - size.w - insetR),
      top: Math.max(this.MARGIN, ph - size.h - insetB),
    };
  },

  restoreOrDefault(btn, viewKey, portal) {
    const saved = this.loadPos(viewKey);
    const pos = saved || this.defaultPos(btn, portal);
    return this.applyPos(btn, pos.left, pos.top, portal);
  },

  isScopeVisible(scope) {
    if (!scope?.isConnected) return false;
    let node = scope;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      node = node.parentElement;
    }
    return scope.getClientRects().length > 0;
  },

  ensurePortal(scope) {
    if (!scope) return null;
    let portal = scope.querySelector(':scope > .doc-finalizar-fab-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.className = 'doc-finalizar-fab-portal';
      portal.setAttribute('aria-hidden', 'true');
      scope.appendChild(portal);
    }
    return portal;
  },

  rememberHome(btn) {
    if (btn._docFinalizarFabHome) return;
    btn._docFinalizarFabHome = {
      parent: btn.parentElement,
      next: btn.nextSibling,
    };
  },

  restoreHome(btn) {
    const home = btn._docFinalizarFabHome;
    if (!home?.parent?.isConnected) return false;
    if (home.next && home.next.parentNode === home.parent) {
      home.parent.insertBefore(btn, home.next);
    } else {
      home.parent.appendChild(btn);
    }
    return true;
  },

  clearDragStyles(btn) {
    btn.classList.remove('doc-finalizar-draggable', 'is-dragging');
    btn.style.position = '';
    btn.style.left = '';
    btn.style.top = '';
    btn.style.right = '';
    btn.style.bottom = '';
    btn.style.zIndex = '';
    btn.style.transform = '';
  },

  unbind(btn) {
    if (btn._docFinalizarFabAbort) {
      btn._docFinalizarFabAbort.abort();
      btn._docFinalizarFabAbort = null;
    }
    btn._docFinalizarFabBound = null;
    btn._docFinalizarFabPortal = null;
  },

  teardown(btn) {
    if (!btn) return;
    this.unbind(btn);
    this.clearDragStyles(btn);
    const homeOk = this.restoreHome(btn);
    if (!homeOk && btn.classList.contains('doc-finalizar-draggable')) {
      try {
        btn.remove();
      } catch {
        /* ignore */
      }
    }
    delete btn._docFinalizarFabHome;
  },

  /** Al cambiar de menú / vaciar main-content (botones que quedaron en body o huérfanos). */
  onViewHostReset() {
    document.querySelectorAll('.doc-finalizar-draggable').forEach((btn) => this.teardown(btn));
    this._registry.clear();
    this._lastActiveKey = null;
  },

  bindDrag(btn, viewKey, portal) {
    if (btn._docFinalizarFabBound === viewKey && btn._docFinalizarFabPortal === portal) return;
    this.unbind(btn);
    const fab = this;

    let dragging = false;
    let moved = false;
    let suppressClick = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let pointerId = null;

    const ac = new AbortController();
    const opt = { signal: ac.signal };

    const onPointerDown = (e) => {
      if (btn.disabled) return;
      if (e.button != null && e.button !== 0) return;
      const rect = btn.getBoundingClientRect();
      const pr = portal.getBoundingClientRect();
      dragging = true;
      moved = false;
      suppressClick = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      originLeft = rect.left - pr.left;
      originTop = rect.top - pr.top;
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
      const pr = portal.getBoundingClientRect();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) >= fab.DRAG_THRESHOLD) moved = true;
      if (!moved) return;
      fab.applyPos(btn, originLeft + dx, originTop + dy, portal);
    };

    const onPointerUp = () => {
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
        suppressClick = true;
        const rect = btn.getBoundingClientRect();
        const pr = portal.getBoundingClientRect();
        const p = fab.applyPos(btn, rect.left - pr.left, rect.top - pr.top, portal);
        fab.savePos(viewKey, p.left, p.top);
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };

    btn.addEventListener(
      'click',
      (e) => {
        if (suppressClick) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true
    );

    btn.addEventListener('pointerdown', onPointerDown, opt);
    btn.addEventListener('pointermove', onPointerMove, opt);
    btn.addEventListener('pointerup', onPointerUp, opt);
    btn.addEventListener('pointercancel', onPointerUp, opt);

    const onResize = () => {
      if (!btn.isConnected || btn.style.display === 'none') return;
      const saved = fab.loadPos(viewKey);
      if (saved) {
        fab.applyPos(btn, saved.left, saved.top, portal);
      } else {
        const p = fab.defaultPos(btn, portal);
        fab.applyPos(btn, p.left, p.top, portal);
      }
    };
    window.addEventListener('resize', onResize, opt);

    btn._docFinalizarFabAbort = ac;
    btn._docFinalizarFabBound = viewKey;
    btn._docFinalizarFabPortal = portal;
  },

  mount(btn, viewKey, scope) {
    const vista = this.resolveScope(scope, btn);
    const portal = this.ensurePortal(vista);
    if (!portal) return;

    this.rememberHome(btn);
    if (btn.parentElement !== portal) portal.appendChild(btn);

    btn.classList.add('doc-finalizar-draggable');
    btn.style.position = 'absolute';
    btn.style.zIndex = '1';

    this.restoreOrDefault(btn, viewKey, portal);
    this.bindDrag(btn, viewKey, portal);
  },

  _applyVisibility() {
    for (const [key, entry] of this._registry) {
      const { btn, scope, visible, enabled } = entry;
      if (!btn?.isConnected) continue;
      if (!enabled) {
        btn.style.display = 'none';
        continue;
      }
      const show =
        visible &&
        key === this._lastActiveKey &&
        this.isScopeVisible(scope);
      btn.style.display = show ? '' : 'none';
      if (show) {
        const portal = this.ensurePortal(this.resolveScope(scope, btn));
        if (portal && btn.parentElement === portal) {
          portal.style.display = '';
        }
      }
    }
  },

  sync({ btn, viewKey, enabled, visible = true, scope = null }) {
    if (!btn || !viewKey) return;

    const root = this.resolveScope(scope, btn);

    if (!enabled) {
      this.teardown(btn);
      this._registry.delete(viewKey);
      if (this._lastActiveKey === viewKey) this._lastActiveKey = null;
      this._applyVisibility();
      return;
    }

    this._registry.set(viewKey, {
      btn,
      scope: root,
      visible: !!visible,
      enabled: true,
    });

    if (visible && root && this.isScopeVisible(root)) {
      this._lastActiveKey = viewKey;
    }

    this._applyVisibility();

    const entry = this._registry.get(viewKey);
    const show =
      entry?.visible &&
      viewKey === this._lastActiveKey &&
      this.isScopeVisible(entry.scope);

    if (!show) return;

    this.mount(btn, viewKey, root);
  },
};
