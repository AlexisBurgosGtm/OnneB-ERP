/**
 * Configuraciones → Usuarios activos
 */
const ParametrosView = {
  _container: null,
  _pollTimer: null,
  _socketHandlers: null,
  _loadGen: 0,
  _lastRows: [],
  _collecting: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatTs(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-GT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: 'short',
    });
  },

  myInstanceId() {
    return typeof PresenceClient !== 'undefined' ? PresenceClient.getInstanceId() : '';
  },

  isSelfRow(row) {
    const inst = this.myInstanceId();
    if (inst && row.clientInstanceId === inst) return true;
    const user = F.session('user') || {};
    return (
      String(row.usuario || '').toUpperCase() === String(user.usuario || '').toUpperCase() &&
      String(row.codempleado) === String(user.codempleado)
    );
  },

  viewActive() {
    if (typeof F !== 'undefined' && typeof F.getActiveMenuKey === 'function') {
      const key = F.getActiveMenuKey();
      if (key && key !== 'parametros') return false;
    }
    return !!(this._container && this._container.isConnected);
  },

  socket() {
    return typeof F !== 'undefined' && F.getSocket ? F.getSocket() : window.OnnebSocket;
  },

  stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    const sock = this.socket();
    if (sock && this._socketHandlers) {
      sock.off('presence:results', this._socketHandlers.onResults);
      sock.off('presence:error', this._socketHandlers.onError);
    }
    this._socketHandlers = null;
    this._collecting = false;
  },

  startPolling() {
    this.stopPolling();
    const sock = this.socket();
    if (!sock) {
      this.setStatus('Sin conexión Socket.IO. Recargue la página.', 'warning');
      return;
    }

    const onResults = (payload) => {
      if (!this.viewActive()) return;
      this._collecting = false;
      this._lastRows = Array.isArray(payload?.rows) ? payload.rows : [];
      this.renderTable(this._lastRows, payload);
    };
    const onError = (payload) => {
      if (!this.viewActive()) return;
      this._collecting = false;
      this.setStatus(payload?.message || 'Error al consultar', 'danger');
    };

    this._socketHandlers = { onResults, onError };
    sock.on('presence:results', onResults);
    sock.on('presence:error', onError);

    const runCollect = () => {
      if (!this.viewActive()) {
        this.stopPolling();
        return;
      }
      if (!F.isLoggedIn()) return;
      if (!sock.connected) {
        this.setStatus('Socket desconectado…', 'warning');
        return;
      }
      if (this._collecting) return;
      const user = F.session('user') || {};
      const codtipo =
        typeof TipoEmpleadoAccess !== 'undefined'
          ? TipoEmpleadoAccess.getCodTipo(user)
          : Number(user.codtipoempleado);
      this._collecting = true;
      this.setStatus('Consultando dispositivos con la app abierta…', 'info');
      sock.emit('presence:collect', {
        empnit: F.getEmpNit(),
        superUser: user.superUser === true,
        codtipoempleado: codtipo,
      });
    };

    runCollect();
    this._pollTimer = setInterval(runCollect, 5000);
  },

  setStatus(message, tone = 'muted') {
    const el = this._container?.querySelector('#param-presence-status');
    if (!el) return;
    const cls =
      tone === 'danger'
        ? 'text-danger'
        : tone === 'warning'
          ? 'text-warning'
          : tone === 'info'
            ? 'text-primary'
            : 'text-muted';
    el.className = `small mb-2 ${cls}`;
    el.textContent = message;
  },

  renderTable(rows, meta) {
    const tbody = this._container?.querySelector('#param-presence-tbody');
    const summary = this._container?.querySelector('#param-presence-summary');
    if (!tbody) return;

    const others = rows.filter((r) => !this.isSelfRow(r));
    if (summary) {
      summary.textContent = `${rows.length} sesión(es) detectada(s) · ${others.length} de otro(s) usuario(s)/pestaña(s)`;
    }

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="11" class="text-muted text-center py-4">Ningún dispositivo respondió en esta ronda.</td></tr>`;
      this.setStatus(
        'No hay otras respuestas. Solo esta pestaña podría estar conectada, o los demás no tienen socket activo.',
        'muted'
      );
      return;
    }

    this.setStatus(
      meta?.collectedAt
        ? `Última consulta: ${this.formatTs(meta.collectedAt)}`
        : 'Lista actualizada',
      'muted'
    );

    tbody.innerHTML = rows
      .map((r) => {
        const self = this.isSelfRow(r);
        const tipo = r.codtipoempleado != null ? String(r.codtipoempleado) : '—';
        return `<tr class="${self ? 'table-primary' : ''}">
          <td>${self ? '<span class="badge text-bg-primary">Usted</span>' : ''}</td>
          <td class="font-monospace small">${this.escapeHtml(String(r.usuario || '—'))}</td>
          <td>${this.escapeHtml(String(r.codempleado ?? '—'))}</td>
          <td>${this.escapeHtml(tipo)}</td>
          <td>${this.escapeHtml(String(r.dbMode || '—'))}</td>
          <td class="small">${this.escapeHtml(String(r.menuKey || '—'))}</td>
          <td class="small">${this.escapeHtml(String(r.screen || '—'))}</td>
          <td class="small">${r.buildCount != null ? this.escapeHtml(String(r.buildCount)) : '—'}</td>
          <td class="small">${this.escapeHtml(String(r.buildDate || '—'))}</td>
          <td class="small text-truncate" style="max-width:10rem" title="${this.escapeHtml(String(r.userAgent || ''))}">${this.escapeHtml(String(r.userAgent || '—'))}</td>
          <td class="small">${this.formatTs(r.clientReportedAt)}</td>
        </tr>`;
      })
      .join('');
  },

  renderShell() {
    return `
      <div class="parametros-wrap w-100">
        <section class="card shadow-sm" aria-labelledby="param-usuarios-activos-title">
          <div class="card-header py-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
            <h5 class="mb-0" id="param-usuarios-activos-title">
              <i class="fa-solid fa-users-viewfinder me-2 text-primary"></i>Usuarios activos
            </h5>
            <span class="badge text-bg-secondary" id="param-presence-live">Solo mientras esta vista esté abierta</span>
          </div>
          <div class="card-body">
            <p class="small text-muted">
              Mientras permanezca aquí, el sistema pregunta por Socket.IO a los dispositivos con la app abierta
              (una fila por pestaña conectada). Use esto antes de reiniciar el servidor o aplicar una actualización.
            </p>
            <p class="small fw-semibold mb-1" id="param-presence-summary">—</p>
            <p class="small mb-2" id="param-presence-status">Iniciando…</p>
            <div class="table-responsive">
              <table class="table table-sm table-striped table-hover align-middle mb-0 parametros-presence-table">
                <thead class="table-light">
                  <tr>
                    <th></th>
                    <th>Usuario</th>
                    <th>Cód. emp.</th>
                    <th>Tipo</th>
                    <th>BD</th>
                    <th>Vista</th>
                    <th>Pantalla</th>
                    <th>Build #</th>
                    <th>Build fecha</th>
                    <th>Navegador</th>
                    <th>Reporte</th>
                  </tr>
                </thead>
                <tbody id="param-presence-tbody">
                  <tr><td colspan="11" class="text-muted text-center py-4">Esperando primera consulta…</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>`;
  },

  async load(container) {
    this._loadGen += 1;
    const loadGen = this._loadGen;
    this.stopPolling();
    this._container = container;
    container.className =
      'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = this.renderShell();

    if (!F.isAdminOrSuperUser()) {
      container.innerHTML = `
        <div class="alert alert-warning mb-0 w-100">
          Solo administradores pueden consultar usuarios activos.
        </div>`;
      return;
    }

    if (!F.isLoggedIn()) {
      container.innerHTML = `<div class="alert alert-info mb-0 w-100">Inicie sesión para continuar.</div>`;
      return;
    }

    if (typeof PresenceClient !== 'undefined') {
      PresenceClient.bindSocket(this.socket());
    }
    if (typeof F !== 'undefined' && F.getSocket?.()?.connected) {
      const user = F.session('user') || {};
      const codtipo =
        typeof TipoEmpleadoAccess !== 'undefined'
          ? TipoEmpleadoAccess.getCodTipo(user)
          : Number(user.codtipoempleado);
      F.getSocket().emit('session:register', {
        empnit: user.empNit,
        codtipoempleado: codtipo,
        codempleado: user.codempleado ?? null,
        usuario: user.usuario,
        nomempleado: user.nomempleado,
        empNombre: user.empNombre,
        email: user.email,
        superUser: user.superUser === true,
        dbMode: F.getDbMode(),
        clientInstanceId: PresenceClient.getInstanceId(),
      });
    }

    if (loadGen !== this._loadGen || !this.viewActive()) return;
    this.startPolling();
  },

  unload() {
    this.stopPolling();
    this._container = null;
  },
};

window.ParametrosView = ParametrosView;
