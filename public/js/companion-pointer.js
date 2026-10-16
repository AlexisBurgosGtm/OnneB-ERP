/**
 * MODO RC — puntero virtual en PC desde touchpad del teléfono (cursor + clic simulado).
 * Nota: el navegador no puede mover el puntero del sistema operativo; se controla un cursor en pantalla.
 */
(function (global) {
  const PAD_SENS = 1.35;
  const MOVE_THROTTLE_MS = 16;

  function hostAllowsCompanionPointer() {
    return Boolean(global.__OnnebCompanionQrSession);
  }

  const CompanionPointer = {
    attachHost(sock) {
      if (!sock || sock.__companionPointerHost) return;
      sock.__companionPointerHost = true;
      sock.on('companion:qr-session-linked', () => {
        global.__OnnebCompanionQrSession = true;
      });
      sock.on('companion:pointer-mode', (payload) => {
        if (!hostAllowsCompanionPointer()) {
          this.setActive(false);
          return;
        }
        this.setActive(Boolean(payload?.active));
      });
      sock.on('companion:pointer-move', (payload) => {
        if (!this.active || !hostAllowsCompanionPointer()) return;
        const dx = Number(payload?.dx) || 0;
        const dy = Number(payload?.dy) || 0;
        this.moveBy(dx, dy);
      });
      sock.on('companion:pointer-click', () => {
        if (!this.active || !hostAllowsCompanionPointer()) return;
        this.clickAtCursor();
      });
    },

    active: false,
    x: 0,
    y: 0,
    cursor: null,
    lastHoverEl: null,

    ensureCursor() {
      if (this.cursor) return;
      const el = document.createElement('div');
      el.id = 'companion-virtual-cursor';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this.cursor = el;
      this.resetPosition();
    },

    destroyCursor() {
      if (this.cursor?.parentNode) {
        this.cursor.parentNode.removeChild(this.cursor);
      }
      this.cursor = null;
    },

    resetPosition() {
      this.x = window.innerWidth / 2;
      this.y = window.innerHeight / 2;
      this.renderCursor();
    },

    setActive(on) {
      const want = Boolean(on) && hostAllowsCompanionPointer();
      this.active = want;
      document.body.classList.toggle('companion-pointer-active', this.active);
      if (this.active) {
        this.ensureCursor();
        this.resetPosition();
        this.lastHoverEl = null;
      } else {
        this.destroyCursor();
        this.lastHoverEl = null;
      }
    },

    moveBy(dx, dy) {
      this.ensureCursor();
      const pad = 8;
      this.x = Math.min(window.innerWidth - pad, Math.max(pad, this.x + dx));
      this.y = Math.min(window.innerHeight - pad, Math.max(pad, this.y + dy));
      this.renderCursor();
      this.dispatchHover();
    },

    renderCursor() {
      if (!this.cursor) return;
      this.cursor.style.left = `${this.x}px`;
      this.cursor.style.top = `${this.y}px`;
    },

    dispatchHover() {
      const hidden = this.cursor?.style.visibility === 'hidden';
      if (!hidden && this.cursor) this.cursor.style.visibility = 'hidden';
      const target = document.elementFromPoint(this.x, this.y);
      if (this.cursor) this.cursor.style.visibility = 'visible';
      if (target === this.cursor || !target) return;
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: this.x,
        clientY: this.y,
        view: window,
      };
      if (this.lastHoverEl && this.lastHoverEl !== target) {
        this.lastHoverEl.dispatchEvent(new MouseEvent('mouseout', opts));
        this.lastHoverEl.dispatchEvent(new MouseEvent('mouseleave', { ...opts, bubbles: false }));
      }
      if (target !== this.lastHoverEl) {
        target.dispatchEvent(new MouseEvent('mouseover', opts));
        target.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }));
        this.lastHoverEl = target;
      }
      target.dispatchEvent(new MouseEvent('mousemove', opts));
    },

    clickAtCursor() {
      this.ensureCursor();
      if (this.cursor) this.cursor.style.visibility = 'hidden';
      const target = document.elementFromPoint(this.x, this.y);
      if (this.cursor) this.cursor.style.visibility = 'visible';
      if (!target || target === this.cursor) return;
      const opts = {
        bubbles: true,
        cancelable: true,
        clientX: this.x,
        clientY: this.y,
        view: window,
        button: 0,
      };
      target.dispatchEvent(new MouseEvent('mousemove', opts));
      target.dispatchEvent(new MouseEvent('mousedown', opts));
      target.dispatchEvent(new MouseEvent('mouseup', opts));
      target.dispatchEvent(new MouseEvent('click', opts));
      if (typeof target.focus === 'function') {
        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus();
        }
      }
    },
  };

  const CompanionPointerRemote = {
    attach(sock, isRemoteReady) {
      if (!sock || sock.__companionPointerRemote) return;
      sock.__companionPointerRemote = true;
      this.socket = sock;
      this.isRemoteReady = isRemoteReady;
      this.bindUi();
    },

    socket: null,
    active: false,
    padEl: null,
    lastTouch: null,
    lastSend: 0,
    padMoveHandler: null,
    padEndHandler: null,

    bindUi() {
      document.getElementById('btn-companion-pointer')?.addEventListener('click', () => {
        this.toggle().catch((err) => alert(err.message || 'No se pudo activar'));
      });
      document.getElementById('btn-companion-pointer-click')?.addEventListener('click', () => {
        this.socket?.emit('companion:pointer-click', {});
      });
    },

    async toggle() {
      if (this.active) {
        this.stop();
        return;
      }
      if (this.isRemoteReady && !this.isRemoteReady()) {
        alert('Inicie sesión vinculando la PC con el QR antes de usar el puntero (MODO RC)');
        return;
      }
      this.active = true;
      this.socket?.emit('companion:pointer-mode', { active: true });
      this.updateUi();
      this.bindPad();
    },

    stop() {
      if (!this.active) return;
      this.active = false;
      this.unbindPad();
      this.socket?.emit('companion:pointer-mode', { active: false });
      this.updateUi();
    },

    bindPad() {
      this.padEl = document.getElementById('companion-pointer-pad');
      if (!this.padEl) return;
      this.lastTouch = null;
      this.padMoveHandler = (e) => this.onPadTouch(e);
      this.padEndHandler = (e) => this.onPadTouchEnd(e);
      this.padEl.addEventListener('touchstart', this.padMoveHandler, { passive: false });
      this.padEl.addEventListener('touchmove', this.padMoveHandler, { passive: false });
      this.padEl.addEventListener('touchend', this.padEndHandler, { passive: true });
      this.padEl.addEventListener('touchcancel', this.padEndHandler, { passive: true });
    },

    unbindPad() {
      if (!this.padEl) return;
      if (this.padMoveHandler) {
        this.padEl.removeEventListener('touchstart', this.padMoveHandler);
        this.padEl.removeEventListener('touchmove', this.padMoveHandler);
      }
      if (this.padEndHandler) {
        this.padEl.removeEventListener('touchend', this.padEndHandler);
        this.padEl.removeEventListener('touchcancel', this.padEndHandler);
      }
      this.padMoveHandler = null;
      this.padEndHandler = null;
      this.lastTouch = null;
    },

    onPadTouchEnd() {
      this.lastTouch = null;
    },

    onPadTouch(e) {
      if (!this.active) return;
      const t = e.touches?.[0] || e.changedTouches?.[0];
      if (!t) return;
      if (e.type === 'touchmove') e.preventDefault();

      if (!this.lastTouch) {
        this.lastTouch = { x: t.clientX, y: t.clientY };
        return;
      }

      const dx = (t.clientX - this.lastTouch.x) * PAD_SENS;
      const dy = (t.clientY - this.lastTouch.y) * PAD_SENS;
      this.lastTouch = { x: t.clientX, y: t.clientY };

      if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return;

      const now = Date.now();
      if (now - this.lastSend < MOVE_THROTTLE_MS) return;
      this.lastSend = now;

      this.socket?.emit('companion:pointer-move', { dx, dy });
    },

    updateUi() {
      const wrap = document.getElementById('companion-pointer-panel');
      const toggleBtn = document.getElementById('btn-companion-pointer');
      const tools = document.getElementById('companion-pointer-tools');
      const padWrap = document.getElementById('companion-pointer-pad-wrap');
      if (wrap) wrap.classList.toggle('is-active', this.active);
      if (toggleBtn) {
        const label = toggleBtn.querySelector('span:last-child');
        const text = this.active ? 'Detener control del puntero' : 'Iniciar control del puntero';
        if (label) label.textContent = text;
        else toggleBtn.textContent = text;
      }
      if (tools) tools.hidden = !this.active;
      if (padWrap) padWrap.hidden = !this.active;
      const hint = document.getElementById('companion-pointer-hint');
      if (hint) {
        hint.textContent = this.active
          ? 'Deslice el dedo en el touchpad para mover el puntero en la PC.'
          : 'Tras vincular sesión con QR, inicie el control para mostrar el touchpad.';
      }
      if (!this.active) this.unbindPad();
    },
  };

  global.CompanionPointer = CompanionPointer;
  global.CompanionPointerRemote = CompanionPointerRemote;
})(typeof window !== 'undefined' ? window : global);
