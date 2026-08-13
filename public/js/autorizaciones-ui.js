/**
 * Helper global de autorizaciones (frontend).
 * Crea solicitudes en dbo.AUTORIZACIONES y espera el socket de autorización.
 */
const AutorizacionesUI = {
  TIPO_CAMBIO_PRECIO: 'AUTORIZACION PRECIOS',
  TIPO_EDITAR_DOCUMENTO: 'EDITAR DOCUMENTO',
  TIPO_ELIMINAR_DOCUMENTO: 'ELIMINAR DOCUMENTO',
  TIPO_ANULAR_DOCUMENTO: 'ANULAR DOCUMENTO',
  TIPO_ELIMINAR_REGISTRO: 'ELIMINAR REGISTRO',
  OPCION_SOLICITA: 'SOLICITA AUTORIZACIONES',

  _socketBound: false,
  _enabledCache: null,
  _enabledCacheAt: 0,
  _waiters: new Map(),
  _listaListeners: new Set(),
  /** Grant solo válido mientras el modal de precio sigue abierto. */
  _precioAuthGranted: null,
  /** Modal de espera activo: no disparar toasts Swal (cierran el modal). */
  _waitModalActive: false,

  usuario() {
    const u = typeof F !== 'undefined' ? F.session('user') : null;
    return u?.username || u?.CODIGO || u?.codempleado || 'USER';
  },

  todayIso() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  nowHora() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  apiUrl(path = '', extra = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extra });
    return `/api/autorizaciones${segment}?${params}`;
  },

  /**
   * Usa el socket compartido de la app (con session:register / rooms).
   * Antes se abría un segundo io() sin rooms → no llegaban notificaciones ni el unlock.
   */
  bindSocket() {
    if (typeof io === 'undefined') return null;

    let socket =
      (typeof F !== 'undefined' && typeof F.getSocket === 'function' && F.getSocket()) ||
      window.OnnebSocket ||
      null;

    if (!socket) {
      socket = io();
      if (typeof F !== 'undefined' && typeof F.setSocket === 'function') {
        F.setSocket(socket);
      } else {
        window.OnnebSocket = socket;
      }
    }

    if (!this._socketBound) {
      socket.on('autorizacion:nueva', (data) => this._onAutorizacionNueva(data));
      socket.on('autorizacion:autorizada', (data) => this._onAutorizacionAutorizada(data));
      socket.on('autorizacion:lista', (data) => this._onAutorizacionLista(data));
      this._socketBound = true;
    }

    this._registerSocketSession(socket);
    return socket;
  },

  _registerSocketSession(socket) {
    const s = socket;
    if (!s) return;
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    const empnit = user?.empNit || (typeof F !== 'undefined' ? F.getEmpNit() : null);
    if (!empnit) return;
    const codtipo =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.getCodTipo(user)
        : Number(user?.codtipoempleado);
    if (!codtipo) return;
    const emitRegister = () => {
      s.emit('session:register', {
        empnit,
        codtipoempleado: codtipo,
        codempleado: user?.codempleado ?? null,
      });
    };
    if (s.connected) emitRegister();
    else s.once('connect', emitRegister);
  },

  _sameEmpnit(data) {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    if (data?.empnit && user?.empNit && String(data.empnit) !== String(user.empNit)) {
      return false;
    }
    return true;
  },

  _isAdminViewer() {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    const codtipo =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.getCodTipo(user)
        : Number(user?.codtipoempleado);
    const adminTipos = [
      TipoEmpleadoAccess?.TIPO_ADMIN ?? 1,
      TipoEmpleadoAccess?.TIPO_SUPERVISOR ?? 2,
    ];
    return adminTipos.includes(Number(codtipo));
  },

  _onAutorizacionNueva(data) {
    if (!this._sameEmpnit(data)) return;
    // F.toast usa Swal y reemplaza cualquier modal abierto (p. ej. espera de autorización).
    if (this._isAdminViewer() && !this._waitModalActive && !Swal.isVisible()) {
      const msg = String(data?.mensaje || '').trim() || 'Nueva solicitud de autorización';
      F.toast(msg, 'warning');
    }
    this._notifyLista(data);
  },

  _onAutorizacionAutorizada(data) {
    if (!this._sameEmpnit(data)) return;
    const idKey = String(data?.id ?? '');
    if (idKey && this._waiters.has(idKey)) {
      const set = this._waiters.get(idKey);
      this._waiters.delete(idKey);
      set.forEach((fn) => {
        try {
          fn(data);
        } catch (_) {
          /* ignore */
        }
      });
    }
    this._notifyLista(data);
  },

  _onAutorizacionLista(data) {
    if (!this._sameEmpnit(data)) return;
    this._notifyLista(data);
  },

  _notifyLista(data) {
    this._listaListeners.forEach((fn) => {
      try {
        fn(data);
      } catch (_) {
        /* ignore */
      }
    });
  },

  onListaChange(fn) {
    if (typeof fn !== 'function') return () => {};
    this.bindSocket();
    this._listaListeners.add(fn);
    return () => this._listaListeners.delete(fn);
  },

  onAutorizada(id, fn) {
    const idKey = String(id ?? '');
    if (!idKey || typeof fn !== 'function') return () => {};
    this.bindSocket();
    if (!this._waiters.has(idKey)) this._waiters.set(idKey, new Set());
    this._waiters.get(idKey).add(fn);
    return () => {
      const set = this._waiters.get(idKey);
      if (!set) return;
      set.delete(fn);
      if (!set.size) this._waiters.delete(idKey);
    };
  },

  async isEnabled({ force = false } = {}) {
    const now = Date.now();
    if (!force && this._enabledCache != null && now - this._enabledCacheAt < 15000) {
      return this._enabledCache;
    }
    try {
      const params = new URLSearchParams({
        opcion: this.OPCION_SOLICITA,
        _: String(Date.now()),
      });
      const data = await F.fetchJson(`/api/config/sino?${params}`, { cache: 'no-store' });
      this._enabledCache = String(data.sino || 'NO').trim().toUpperCase() === 'SI';
    } catch {
      this._enabledCache = false;
    }
    this._enabledCacheAt = now;
    return this._enabledCache;
  },

  /**
   * Inserta en AUTORIZACIONES (EMPNIT, FECHA, HORA, TIPO, DESCRIPCION, USUARIO).
   * AUTORIZADO = NO por defecto. Dispara socket de notificación a administradores.
   */
  async crear({ EMPNIT, FECHA, HORA, TIPO, DESCRIPCION, USUARIO } = {}) {
    this.bindSocket();
    const empnit = String(EMPNIT || F.getEmpNit() || '').trim();
    const body = {
      FECHA: FECHA || this.todayIso(),
      HORA: HORA || this.nowHora(),
      TIPO: String(TIPO || '').trim(),
      DESCRIPCION: String(DESCRIPCION || '').trim(),
      USUARIO: String(USUARIO || this.usuario()).trim(),
    };
    if (!body.TIPO) throw new Error('TIPO requerido');
    const data = await F.fetchJson(this.apiUrl('', { empnit }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return data.row;
  },

  async autorizar(id, usuarioAutoriza) {
    const data = await F.fetchJson(this.apiUrl(`/${encodeURIComponent(id)}/autorizar`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        USUARIOAUTORIZA: String(usuarioAutoriza || this.usuario()).trim(),
      }),
    });
    return data.row;
  },

  async listar() {
    const data = await F.fetchJson(this.apiUrl('', { _: String(Date.now()) }), {
      cache: 'no-store',
    });
    return data.rows || [];
  },

  markPrecioAuthorized(precio, authId, usuarioAutoriza) {
    this._precioAuthGranted = {
      authId: Number(authId),
      precio: Number(precio),
      at: Date.now(),
      usuarioAutoriza: String(usuarioAutoriza || ''),
    };
  },

  /** Tras usar el precio autorizado en una línea, invalidar el grant (un solo uso). */
  consumePrecioGrant() {
    this._precioAuthGranted = null;
  },

  /**
   * Validación dura: baja de precio (menor al de lista) requiere autorización vigente.
   * Precio igual o mayor al de lista se permite sin autorización.
   */
  precioChangeAllowed(precio, catalogo) {
    const p = Number(precio);
    const c = Number(catalogo);
    if (!Number.isFinite(p)) return true;
    if (p >= c - 0.0005) return true;
    const g = this._precioAuthGranted;
    if (!g) return false;
    return Math.abs(Number(g.precio) - p) < 0.0005;
  },

  formatPrecioDesc(precio) {
    const n = Number(precio);
    if (!Number.isFinite(n)) return String(precio ?? '');
    return n.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  },

  /**
   * Gate de precio en modales Swal.
   * Solo solicita autorización si el precio es menor al de lista.
   * Bloquea Agregar solo mientras este modal está abierto y el precio fue modificado
   * esperando autorización. Al cerrar, se libera el bloqueo (puede agregar otros productos).
   */
  wirePrecioAuthGate({
    popup,
    precioInput,
    medidaSelect,
    cantidadInput,
    priceByMedida,
    permiteCambiarPrecio,
    solicitaAutorizaciones,
    buildDescripcion,
    statusElId = 'authz-precio-status',
  }) {
    this.bindSocket();
    const confirmBtn =
      (popup && popup.querySelector('.swal2-confirm')) ||
      (typeof Swal !== 'undefined' ? Swal.getConfirmButton() : null);
    if (!confirmBtn || !permiteCambiarPrecio || !solicitaAutorizaciones) {
      return {
        dispose() {},
        isReady() {
          return true;
        },
      };
    }

    let disposed = false;
    let requestSeq = 0;
    let unsub = null;
    let precioAutorizado = null;
    let lastRequestedPrecio = null;

    const statusEl =
      (statusElId && popup?.querySelector(`#${statusElId}`)) ||
      (() => {
        const el = document.createElement('p');
        el.id = statusElId;
        el.className = 'small mb-0 mt-2 text-center';
        popup?.querySelector('.swal2-html-container')?.appendChild(el);
        return el;
      })();

    const setStatus = (text, cls = 'text-muted') => {
      if (!statusEl) return;
      statusEl.className = `small mb-0 mt-2 text-center ${cls}`;
      statusEl.textContent = text || '';
    };

    const setConfirmEnabled = (enabled) => {
      confirmBtn.disabled = !enabled;
      confirmBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      confirmBtn.classList.toggle('authz-confirm-locked', !enabled);
      confirmBtn.style.pointerEvents = enabled ? '' : 'none';
      confirmBtn.style.opacity = enabled ? '' : '0.65';
    };

    const catalogPrecio = () => {
      const med = medidaSelect?.value;
      return Number(priceByMedida[String(med)] ?? 0) || 0;
    };

    const currentPrecio = () => Number(precioInput?.value) || 0;

    const currentCantidad = () => {
      const n = Number(cantidadInput?.value);
      return Number.isFinite(n) && n > 0 ? n : 1;
    };

    const currentMedida = () => String(medidaSelect?.value || '').trim() || '—';

    /** Solo precios menores al de lista requieren autorización. */
    const precioRequiereAuth = () => {
      const p = currentPrecio();
      const c = catalogPrecio();
      return Number.isFinite(p) && p < c - 0.0005;
    };

    const clearWaiter = () => {
      if (typeof unsub === 'function') {
        unsub();
        unsub = null;
      }
    };

    const nombreQuienAutorizo = (data) => {
      const name = String(
        data?.usuarioAutoriza ||
          data?.USUARIOAUTORIZA ||
          data?.usuario_autoriza ||
          ''
      ).trim();
      return name || 'administrador';
    };

    /** Solo actualiza UI; no envía solicitud (esperar blur/Enter). */
    const syncGateUi = () => {
      if (disposed) return;

      if (!precioRequiereAuth()) {
        clearWaiter();
        precioAutorizado = null;
        lastRequestedPrecio = null;
        this._precioAuthGranted = null;
        setConfirmEnabled(true);
        setStatus('');
        return;
      }

      const precioSnap = currentPrecio();
      setConfirmEnabled(false);

      if (precioAutorizado != null && Math.abs(precioAutorizado - precioSnap) < 0.0005) {
        setConfirmEnabled(true);
        setStatus('Cambio de precio autorizado', 'text-success');
        return;
      }

      if (this.precioChangeAllowed(precioSnap, catalogPrecio())) {
        precioAutorizado = precioSnap;
        setConfirmEnabled(true);
        setStatus('Cambio de precio autorizado', 'text-success');
        return;
      }

      if (lastRequestedPrecio != null && Math.abs(lastRequestedPrecio - precioSnap) < 0.0005) {
        setStatus('Esperando autorización…', 'text-warning');
        return;
      }

      setStatus('Confirme el precio (Enter o salga del campo) para solicitar autorización', 'text-muted');
    };

    const requestAuth = async () => {
      if (disposed) return;
      if (!precioRequiereAuth()) {
        syncGateUi();
        return;
      }

      const precioNow = currentPrecio();
      const catalogNow = catalogPrecio();
      const cantidadNow = currentCantidad();
      const medidaNow = currentMedida();

      if (precioAutorizado != null && Math.abs(precioAutorizado - precioNow) < 0.0005) {
        setConfirmEnabled(true);
        setStatus('Cambio de precio autorizado', 'text-success');
        return;
      }
      if (this.precioChangeAllowed(precioNow, catalogNow)) {
        precioAutorizado = precioNow;
        setConfirmEnabled(true);
        setStatus('Cambio de precio autorizado', 'text-success');
        return;
      }
      if (lastRequestedPrecio != null && Math.abs(lastRequestedPrecio - precioNow) < 0.0005) {
        setConfirmEnabled(false);
        setStatus('Esperando autorización…', 'text-warning');
        return;
      }

      setConfirmEnabled(false);
      setStatus('Solicitando autorización…', 'text-warning');
      lastRequestedPrecio = precioNow;
      const seq = ++requestSeq;

      try {
        const desc =
          typeof buildDescripcion === 'function'
            ? buildDescripcion({
                precio: precioNow,
                catalogo: catalogNow,
                cantidad: cantidadNow,
                medida: medidaNow,
              })
            : `${this.usuario()} quiere agregar el producto ${cantidadNow} ${medidaNow} al precio ${this.formatPrecioDesc(precioNow)}`;
        const row = await this.crear({
          TIPO: this.TIPO_CAMBIO_PRECIO,
          DESCRIPCION: desc,
        });
        if (disposed || seq !== requestSeq) return;
        const authId = row?.ID;
        if (authId == null || authId === '') {
          lastRequestedPrecio = null;
          setConfirmEnabled(false);
          setStatus('No se pudo solicitar autorización', 'text-danger');
          return;
        }
        setStatus(`Esperando autorización (#${authId})…`, 'text-warning');
        setConfirmEnabled(false);
        clearWaiter();
        unsub = this.onAutorizada(authId, (data) => {
          if (disposed) return;
          if (Math.abs(currentPrecio() - precioNow) > 0.0005) return;
          precioAutorizado = precioNow;
          const quien = nombreQuienAutorizo(data);
          this.markPrecioAuthorized(precioNow, authId, quien);
          setConfirmEnabled(true);
          setStatus(`Autorizado por ${quien}`, 'text-success');
        });
      } catch (err) {
        if (disposed || seq !== requestSeq) return;
        lastRequestedPrecio = null;
        setConfirmEnabled(false);
        setStatus(err.message || 'Error al solicitar autorización', 'text-danger');
      }
    };

    const onPrecioInput = () => {
      // Al tipear, invalidar solicitud previa si el precio ya no coincide.
      if (
        lastRequestedPrecio != null &&
        Math.abs(lastRequestedPrecio - currentPrecio()) > 0.0005
      ) {
        clearWaiter();
        lastRequestedPrecio = null;
        requestSeq += 1;
      }
      if (
        precioAutorizado != null &&
        Math.abs(precioAutorizado - currentPrecio()) > 0.0005
      ) {
        precioAutorizado = null;
        this._precioAuthGranted = null;
      }
      syncGateUi();
    };

    const onPrecioCommit = (e) => {
      if (e?.type === 'keydown' && e.key !== 'Enter') return;
      if (e?.type === 'keydown') {
        e.preventDefault();
        e.stopPropagation();
      }
      requestAuth();
    };

    precioInput?.addEventListener('input', onPrecioInput);
    precioInput?.addEventListener('blur', onPrecioCommit);
    precioInput?.addEventListener('keydown', onPrecioCommit);
    medidaSelect?.addEventListener('change', () => {
      clearWaiter();
      lastRequestedPrecio = null;
      precioAutorizado = null;
      this._precioAuthGranted = null;
      syncGateUi();
    });

    return {
      dispose() {
        disposed = true;
        clearWaiter();
        precioAutorizado = null;
        lastRequestedPrecio = null;
        AutorizacionesUI._precioAuthGranted = null;
      },
      isReady() {
        if (!precioRequiereAuth()) return true;
        return (
          (precioAutorizado != null &&
            Math.abs(precioAutorizado - currentPrecio()) < 0.0005) ||
          AutorizacionesUI.precioChangeAllowed(currentPrecio(), catalogPrecio())
        );
      },
      syncGate: syncGateUi,
      requestAuth,
    };
  },

  /**
   * Crea una solicitud y muestra un modal de espera hasta que un administrador autorice.
   * Si el usuario cierra/cancela el modal, se deja de escuchar: la autorización ya no surte efecto.
   * @returns {Promise<{ ok: boolean, cancelled?: boolean, row?: object, data?: object, error?: string }>}
   */
  async solicitarYEsperar({
    tipo,
    descripcion,
    title = 'Autorización requerida',
    waitingMessage = 'Se está solicitando autorización a un administrador…',
  } = {}) {
    this.bindSocket();
    const tipoVal = String(tipo || '').trim();
    if (!tipoVal) throw new Error('TIPO requerido');

    let unsub = null;
    let settled = false;
    let cancelled = false;
    let authId = null;
    this._waitModalActive = true;

    const clearWaiter = () => {
      if (typeof unsub === 'function') {
        unsub();
        unsub = null;
      }
    };

    try {
      const result = await new Promise((resolve) => {
        const finish = (payload) => {
          if (settled) return;
          settled = true;
          clearWaiter();
          resolve(payload);
        };

        const cancelWaiting = () => {
          cancelled = true;
          clearWaiter();
          finish({ ok: false, cancelled: true, authId });
        };

        Swal.fire({
          ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
          title,
          html: `
          <p class="mb-2 text-start">${String(waitingMessage)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</p>
          <div class="text-center py-3">
            <div class="spinner-border text-warning" role="status" aria-label="Esperando"></div>
          </div>
          <p id="authz-wait-status" class="small text-muted mb-0">Enviando solicitud…</p>
        `,
          icon: 'info',
          showConfirmButton: false,
          showCancelButton: true,
          cancelButtonText:
            typeof CatalogosUI !== 'undefined'
              ? CatalogosUI.cancelButtonHtml('Cerrar')
              : 'Cerrar',
          allowOutsideClick: false,
          allowEscapeKey: true,
          didOpen: async () => {
            const statusEl = document.getElementById('authz-wait-status');
            const setStatus = (text, cls = 'text-muted') => {
              if (!statusEl) return;
              statusEl.className = `small mb-0 ${cls}`;
              statusEl.textContent = text || '';
            };

            try {
              const row = await this.crear({
                TIPO: tipoVal,
                DESCRIPCION: String(descripcion || '').trim(),
              });
              if (cancelled || settled) {
                clearWaiter();
                return;
              }
              authId = row?.ID;
              if (authId == null || authId === '') {
                setStatus('No se pudo crear la solicitud', 'text-danger');
                finish({ ok: false, error: 'No se pudo crear la solicitud' });
                setTimeout(() => {
                  if (Swal.isVisible()) Swal.close();
                }, 900);
                return;
              }
              setStatus(`Esperando autorización (#${authId})…`, 'text-warning');
              unsub = this.onAutorizada(authId, (data) => {
                if (cancelled || settled) return;
                const quien = String(
                  data?.usuarioAutoriza || data?.USUARIOAUTORIZA || 'administrador'
                ).trim();
                setStatus(`Autorizado por ${quien}`, 'text-success');
                finish({ ok: true, row, data, authId });
                if (Swal.isVisible()) Swal.close();
              });
              if (cancelled || settled) {
                clearWaiter();
              }
            } catch (err) {
              if (cancelled || settled) return;
              setStatus(err.message || 'Error al solicitar autorización', 'text-danger');
              finish({
                ok: false,
                error: err.message || 'Error al solicitar autorización',
              });
              setTimeout(() => {
                if (Swal.isVisible()) Swal.close();
              }, 1200);
            }
          },
          willClose: () => {
            if (!settled) cancelWaiting();
          },
        }).then((swalResult) => {
          if (settled) return;
          if (swalResult.isDismissed || swalResult.isDenied) {
            cancelWaiting();
          }
        });
      });

      return result;
    } finally {
      this._waitModalActive = false;
    }
  },

  /**
   * Gate para editar / eliminar / anular documentos (si SOLICITA AUTORIZACIONES = SI).
   * Admin/supervisor no piden autorización. Si el usuario cancela el modal → no continúa.
   * @returns {Promise<boolean>} true si puede proceder
   */
  async gateAccionDocumento({
    accion,
    coddoc,
    correlativo,
    tipodoc = '',
    label = '',
  } = {}) {
    const act = String(accion || '').trim().toLowerCase();
    const map = {
      editar: {
        tipo: this.TIPO_EDITAR_DOCUMENTO,
        verb: 'editar',
        title: 'Esperando autorización — Editar',
      },
      eliminar: {
        tipo: this.TIPO_ELIMINAR_DOCUMENTO,
        verb: 'eliminar',
        title: 'Esperando autorización — Eliminar',
      },
      anular: {
        tipo: this.TIPO_ANULAR_DOCUMENTO,
        verb: 'anular',
        title: 'Esperando autorización — Anular',
      },
    };
    const cfg = map[act];
    if (!cfg) return true;

    if (!(await this.isEnabled())) return true;
    if (this._isAdminViewer()) return true;

    this.bindSocket();
    const docLabel =
      String(label || '').trim() ||
      `${String(coddoc || '').trim()} #${correlativo ?? ''}`.trim();
    const tipoDocTxt = String(tipodoc || '').trim();
    const desc =
      `${this.usuario()} solicita ${cfg.verb} el documento ${docLabel}` +
      (tipoDocTxt ? ` (${tipoDocTxt})` : '');

    const result = await this.solicitarYEsperar({
      tipo: cfg.tipo,
      descripcion: desc,
      title: cfg.title,
      waitingMessage: `Se está solicitando autorización a un administrador para ${cfg.verb} ${docLabel}. Mantenga este aviso abierto hasta que le autoricen.`,
    });

    if (result.cancelled) return false;
    if (!result.ok) {
      if (typeof F !== 'undefined' && F.toast) {
        F.toast(result.error || 'No se obtuvo autorización', 'error');
      }
      return false;
    }
    return true;
  },

  /**
   * Gate para eliminar registros clave de catálogo (marcas, clientes, etc.).
   * Si SOLICITA AUTORIZACIONES = NO o el usuario es admin/supervisor → true sin modal.
   * @returns {Promise<boolean>}
   */
  async gateEliminarRegistro({ label = '', tipoEntidad = 'registro' } = {}) {
    if (!(await this.isEnabled())) return true;
    if (this._isAdminViewer()) return true;

    this.bindSocket();
    const ent = String(tipoEntidad || 'registro').trim() || 'registro';
    const nombre = String(label || '').trim() || ent;
    const result = await this.solicitarYEsperar({
      tipo: this.TIPO_ELIMINAR_REGISTRO,
      descripcion: `${this.usuario()} solicita eliminar el ${ent} ${nombre}`,
      title: 'Esperando autorización — Eliminar',
      waitingMessage: `Se está solicitando autorización a un administrador para eliminar ${nombre}. Mantenga este aviso abierto hasta que le autoricen.`,
    });

    if (result.cancelled) return false;
    if (!result.ok) {
      if (typeof F !== 'undefined' && F.toast) {
        F.toast(result.error || 'No se obtuvo autorización', 'error');
      }
      return false;
    }
    return true;
  },
};
