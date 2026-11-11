/**
 * Responde encuestas de presencia solo cuando el servidor emite presence:survey (sin polling propio).
 */
const PresenceClient = {
  _bound: false,
  _instanceId: null,

  getInstanceId() {
    if (this._instanceId) return this._instanceId;
    const key = 'onneb-client-instance-id';
    try {
      let id = sessionStorage.getItem(key);
      if (!id) {
        id =
          typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `inst-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        sessionStorage.setItem(key, id);
      }
      this._instanceId = id;
      return id;
    } catch {
      this._instanceId = `inst-${Date.now()}`;
      return this._instanceId;
    }
  },

  buildAnswerPayload(queryId) {
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    if (!user?.empNit) return null;
    const codtipo =
      typeof TipoEmpleadoAccess !== 'undefined'
        ? TipoEmpleadoAccess.getCodTipo(user)
        : Number(user.codtipoempleado);
    let buildCount = null;
    let buildDate = '';
    try {
      const el = document.getElementById('build-counter');
      const countEl = el?.querySelector('.build-count');
      const dateEl = el?.querySelector('.build-date');
      if (countEl) {
        const m = countEl.textContent.match(/#(\d+)/);
        if (m) buildCount = Number(m[1]);
      }
      if (dateEl) buildDate = dateEl.textContent.trim();
    } catch {
      /* ignore */
    }
    return {
      queryId,
      empnit: user.empNit,
      empNombre: user.empNombre || '',
      codempleado: user.codempleado ?? null,
      codtipoempleado: codtipo || user.codtipoempleado || null,
      usuario: user.usuario || '',
      nomempleado: user.nomempleado || '',
      email: user.email || '',
      superUser: user.superUser === true,
      dbMode: typeof F !== 'undefined' ? F.getDbMode() : 'local',
      clientInstanceId: this.getInstanceId(),
      menuKey: typeof F !== 'undefined' && F.getActiveMenuKey ? F.getActiveMenuKey() || '' : '',
      userAgent: navigator.userAgent || '',
      platform: navigator.platform || '',
      language: navigator.language || '',
      screen:
        typeof screen !== 'undefined' && screen.width
          ? `${screen.width}x${screen.height}`
          : '',
      buildCount,
      buildDate,
      pageUrl: typeof location !== 'undefined' ? location.pathname || '' : '',
      clientReportedAt: Date.now(),
    };
  },

  onSurvey(payload = {}) {
    const queryId = String(payload.queryId || '').trim();
    const empnit = String(payload.empnit || '').trim();
    if (!queryId || !empnit) return;
    const user = typeof F !== 'undefined' ? F.session('user') : null;
    if (!user?.empNit || String(user.empNit).trim() !== empnit) return;

    const answer = this.buildAnswerPayload(queryId);
    if (!answer) return;

    const sock =
      (typeof F !== 'undefined' && typeof F.getSocket === 'function' && F.getSocket()) ||
      window.OnnebSocket;
    if (!sock?.connected) return;
    sock.emit('presence:answer', answer);
  },

  bindSocket(socket) {
    if (!socket || socket.__presenceClientBound) return;
    socket.__presenceClientBound = true;
    socket.on('presence:survey', (payload) => this.onSurvey(payload));
  },

  init() {
    if (this._bound) return;
    this._bound = true;
    const tryBind = () => {
      const sock =
        (typeof F !== 'undefined' && typeof F.getSocket === 'function' && F.getSocket()) ||
        window.OnnebSocket;
      if (sock) this.bindSocket(sock);
    };
    document.addEventListener('onneb-socket-ready', tryBind);
    tryBind();
  },
};

window.PresenceClient = PresenceClient;
PresenceClient.init();
