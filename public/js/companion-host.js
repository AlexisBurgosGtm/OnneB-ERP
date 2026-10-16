/**
 * PC — emparejamiento QR y recepción de comandos del teléfono (control remoto).
 */
const CompanionHost = {
  pairing: null,
  modal: null,

  isMobileRemote() {
    return window.matchMedia('(max-width: 767.98px)').matches;
  },

  goToRemoteScanner() {
    window.location.href = '/remote.html';
  },

  onHostButtonClick() {
    if (this.isMobileRemote()) {
      this.goToRemoteScanner();
      return;
    }
    this.openPairingModal().catch((err) => {
      this.setModalStatus(err.message || 'No se pudo crear emparejamiento', 'error');
    });
  },

  init() {
    const bindBtn = (id) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', () => this.onHostButtonClick());
      if (this.isMobileRemote()) {
        btn.title = 'Escanear QR de la PC (control remoto)';
        btn.setAttribute('aria-label', btn.title);
      }
    };
    bindBtn('btn-companion-host');
    bindBtn('btn-companion-host-header');
    this.bindSocket();
    this.syncMobileHostButton();
    window.matchMedia('(max-width: 767.98px)').addEventListener('change', () => this.syncMobileHostButton());
  },

  syncMobileHostButton() {
    const mobile = this.isMobileRemote();
    const title = mobile
      ? 'MODO RC — escanear QR de la PC'
      : 'MODO RC — emparejar teléfono';
    for (const id of ['btn-companion-host', 'btn-companion-host-header']) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-mobile-screen-button', !mobile);
        icon.classList.toggle('fa-qrcode', mobile);
      }
    }
  },

  socket() {
    return typeof F !== 'undefined' && F.getSocket ? F.getSocket() : window.OnnebSocket;
  },

  bindSocket() {
    const attach = (sock) => {
      if (!sock || sock.__companionHostBound) return;
      sock.__companionHostBound = true;
      sock.on('companion:host-bound', () => {
        this.setModalStatus('PC lista — escanee el QR con el teléfono', 'ok');
      });
      sock.on('companion:qr-session-linked', () => {
        window.__OnnebCompanionQrSession = true;
      });
      sock.on('companion:controller-joined', () => {
        this.closePairingModal();
        F?.toast?.('Teléfono conectado (MODO RC)', 'success');
        this.pushFavorites();
      });
      sock.on('companion:controller-present', () => {
        this.pushFavorites();
      });
      sock.on('companion:host-apply-session', (payload) => {
        this.applySession(payload).catch((err) => {
          F?.toast?.(err.message || 'No se pudo aplicar la sesión', 'error');
        });
      });
      sock.on('companion:navigate', ({ menu }) => {
        const key = String(menu || '').trim();
        if (!key) return;
        if (typeof TipoEmpleadoAccess !== 'undefined' && !TipoEmpleadoAccess.canAccessMenu(key)) {
          F?.toast?.('Sin permiso para esa vista en la PC', 'warning');
          return;
        }
        if (typeof LicenseAccess !== 'undefined' && !LicenseAccess.canAccessMenu(key)) {
          F?.toast?.('Módulo no licenciado en la PC', 'warning');
          return;
        }
        if (typeof window.__OnnebNavigateToMenu === 'function') {
          window.__OnnebNavigateToMenu(key);
          F?.toast?.('Navegando en la PC…', 'info');
        }
      });
      sock.on('companion:error', ({ message }) => {
        F?.toast?.(message || 'Error MODO RC', 'warning');
      });
      if (typeof CompanionPointer !== 'undefined') {
        CompanionPointer.attachHost(sock);
      }
    };
    const sock = this.socket();
    if (sock) attach(sock);
    document.addEventListener('onneb-socket-ready', (e) => attach(e.detail?.socket));
  },

  closePairingModal() {
    if (!this.modal) return;
    const bs = window.bootstrap?.Modal?.getInstance(this.modal);
    if (bs) bs.hide();
    else document.body.classList.remove('companion-qr-modal-open');
  },

  setModalStatus(text, level) {
    const el = this.modal?.querySelector('[data-companion-status]');
    if (!el) return;
    el.textContent = text || '';
    el.dataset.level = level || 'info';
  },

  async openPairingModal() {
    this.ensureModal();
    document.body.classList.add('companion-qr-modal-open');
    const img = this.modal.querySelector('[data-companion-qr]');
    const urlEl = this.modal.querySelector('[data-companion-url]');
    const loadingEl = this.modal.querySelector('[data-companion-qr-loading]');
    if (img) {
      img.removeAttribute('src');
      img.hidden = true;
    }
    if (loadingEl) loadingEl.hidden = false;
    if (urlEl) urlEl.textContent = '';
    this.setModalStatus('Generando código…', 'wait');
    const bs = window.bootstrap?.Modal?.getOrCreateInstance(this.modal);
    bs?.show();
    const origin = window.location.origin;
    const data = await F.fetchJson('/api/remote-companion/pairing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin }),
    });
    this.pairing = data;
    if (img) {
      if (data.qrDataUrl) {
        img.src = data.qrDataUrl;
        img.alt = 'QR emparejamiento control remoto';
        img.hidden = false;
        if (loadingEl) loadingEl.hidden = true;
      } else {
        img.hidden = true;
        if (loadingEl) {
          loadingEl.hidden = false;
          loadingEl.textContent = 'No se pudo generar la imagen QR. Use la URL de abajo.';
        }
      }
    }
    if (urlEl) urlEl.textContent = data.remoteUrl || '';
    this.setModalStatus('Esperando lectura del QR en el teléfono…', 'wait');
    this.bindHostSocket();
  },

  ensureModal() {
    if (this.modal) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="modal fade companion-qr-modal" id="companion-qr-modal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title"><i class="fa-solid fa-mobile-screen-button me-2"></i>MODO RC</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
            </div>
            <div class="modal-body">
              <p class="small text-muted mb-2">En el teléfono abra <strong>/remote.html</strong> o escanee este QR (antes o después del login en PC) e inicie sesión en el móvil.</p>
              <p class="companion-qr-status small mb-2" data-companion-status data-level="info"></p>
              <div class="companion-qr-wrap mb-2">
                <p class="small text-muted mb-0" data-companion-qr-loading>Generando código…</p>
                <img data-companion-qr width="280" height="280" alt="" class="companion-qr-img" hidden />
              </div>
              <p class="small mb-0"><code data-companion-url class="user-select-all"></code></p>
            </div>
          </div>
        </div>
      </div>`;
    this.modal = wrap.firstElementChild;
    document.body.appendChild(this.modal);
    this.modal.addEventListener('hidden.bs.modal', () => {
      document.body.classList.remove('companion-qr-modal-open');
    });
  },

  bindHostSocket() {
    const sock = this.socket();
    if (!sock?.connected || !this.pairing) {
      sock?.once?.('connect', () => this.bindHostSocket());
      return;
    }
    sock.emit('companion:host-bind', {
      token: this.pairing.token,
      pairingId: this.pairing.pairingId,
    });
  },

  pushFavorites() {
    if (typeof MenuFavoritos === 'undefined') return;
    const items = MenuFavoritos.favoriteItems().map((i) => ({
      key: i.key,
      label: i.label,
    }));
    this.socket()?.emit('companion:favorites-push', { items });
  },

  async applySession(payload) {
    if (!payload?.auth || !payload.empNit) return;
    if (typeof window.__OnnebCompleteLoginSession !== 'function') {
      throw new Error('La PC no está lista para recibir la sesión');
    }
    if (typeof window.__OnnebSetLoginRemoteMode === 'function') {
      window.__OnnebSetLoginRemoteMode(payload.dbMode === 'remote');
    }
    const user = payload.auth.user;
    await window.__OnnebCompleteLoginSession(
      payload.auth,
      payload.empNit,
      payload.empNombre || payload.empNit,
      user?.usuario || user?.nomempleado || '',
      payload.codTipoEmpresa || '',
      true
    );
    this.pushFavorites();
    this.closePairingModal();
    F?.toast?.('Sesión iniciada en la PC desde el teléfono', 'success');
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof F !== 'undefined') CompanionHost.init();
});
