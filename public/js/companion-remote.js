/**
 * Teléfono — emparejamiento, login y control remoto (navegación en PC).
 */
(function () {
  const REPORT_ICONS = {
    VENTADIA: 'fa-cash-register',
    VENTAMES: 'fa-calendar-days',
    CUENTAPAGAR: 'fa-file-invoice-dollar',
    CUENTACOBRAR: 'fa-hand-holding-dollar',
    INVENTCOSTO: 'fa-boxes-stacked',
  };

  const state = {
    token: '',
    pairingId: '',
    socket: null,
    favorites: [],
    reports: [],
    lastAuth: null,
    scanner: null,
    sessionActive: false,
    isAdministrator: false,
    empNit: '',
    empNombre: '',
    speaking: false,
  };

  const el = {
    statusText: document.getElementById('companion-status-text'),
    statusDot: document.querySelector('#companion-status-line .companion-status-dot'),
    panelPair: document.getElementById('panel-pair'),
    panelLogin: document.getElementById('panel-login'),
    panelRemote: document.getElementById('panel-remote'),
    tokenInput: document.getElementById('companion-token-input'),
    empresa: document.getElementById('companion-empresa'),
    usuario: document.getElementById('companion-usuario'),
    password: document.getElementById('companion-password'),
    favGrid: document.getElementById('companion-fav-grid'),
    noFavs: document.getElementById('companion-no-favs'),
    userLine: document.getElementById('companion-user-line'),
    scanRegion: document.getElementById('companion-scan-region'),
    reportsSection: document.getElementById('companion-reports-section'),
    reportsGrid: document.getElementById('companion-reports-grid'),
    noReports: document.getElementById('companion-no-reports'),
    pointerPanel: document.getElementById('companion-pointer-panel'),
    loginDivider: document.getElementById('companion-login-divider'),
  };

  function setStatus(text, level) {
    if (el.statusText) el.statusText.textContent = text;
    if (el.statusDot) {
      el.statusDot.classList.remove('ok', 'wait', 'off');
      el.statusDot.classList.add(level || 'off');
    }
  }

  function parseTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t') || params.get('token') || '';
    return String(t).trim();
  }

  function extractTokenFromScan(decodedText) {
    const raw = String(decodedText || '').trim();
    if (!raw) return '';
    try {
      const u = new URL(raw);
      return u.searchParams.get('t') || u.searchParams.get('token') || '';
    } catch {
      return raw;
    }
  }

  async function fetchJson(url, options = {}) {
    const res = await fetch(url, { cache: 'no-store', ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText || 'Error de red');
    return data;
  }

  function isCompanionSessionActive() {
    return Boolean(state.sessionActive && state.empNit);
  }

  function applyAdministratorFlags(summary) {
    if (summary && summary.isAdministrator != null) {
      state.isAdministrator = Boolean(summary.isAdministrator);
      return;
    }
    state.isAdministrator = Boolean(
      summary?.superUser || Number(summary?.codtipoempleado) === 1
    );
  }

  function initSocket() {
    if (typeof io === 'undefined') return;
    state.socket = io();
    state.socket.on('connect', () => {
      if (state.token) bindController();
    });
    state.socket.on('companion:controller-bound', (data) => {
      state.pairingId = data.pairingId || state.pairingId;
      setStatus(
        data.hostConnected ? 'Emparejado — PC conectada' : 'Emparejado — esperando PC',
        data.hostConnected ? 'ok' : 'wait'
      );
      showLoginPanel();
      if (data.session) {
        activateSession({
          username: data.session.username,
          empNombre: data.session.empNombre,
          empNit: data.session.empNit,
        });
      }
      if (data.favorites?.length) {
        state.favorites = data.favorites;
        renderFavorites();
      }
    });
    state.socket.on('companion:session-active', (summary) => {
      activateSession(summary);
      setStatus('Sesión activa en PC', 'ok');
    });
    state.socket.on('companion:qr-session-linked', () => {
      state.sessionActive = true;
      updateSessionOnlySections();
    });
    state.socket.on('companion:favorites', ({ items }) => {
      state.favorites = Array.isArray(items) ? items : [];
      renderFavorites();
    });
    state.socket.on('companion:error', ({ message }) => {
      setStatus(message || 'Error', 'off');
      alert(message || 'Error de emparejamiento');
    });
  }

  function bindController() {
    if (!state.token || !state.socket?.connected) return;
    state.socket.emit('companion:controller-bind', { token: state.token });
  }

  async function joinWithToken(token) {
    state.token = String(token || '').trim();
    if (!state.token) {
      alert('Ingrese o escanee un código válido');
      return;
    }
    setStatus('Emparejando…', 'wait');
    await fetchJson(`/api/remote-companion/pairing/status?t=${encodeURIComponent(state.token)}`);
    bindController();
    await loadEmpresas();
  }

  async function loadEmpresas() {
    if (!el.empresa) return;
    try {
      const data = await fetchJson(`/api/empresas/combo?_=${Date.now()}`);
      const rows = (data.rows || []).filter((e) => e.EMPNIT);
      el.empresa.innerHTML = rows
        .map((e) => {
          const nit = String(e.EMPNIT).trim();
          const nom = String(e.EMPNOMBRE || nit).trim();
          const tip = e.CODTIPOEMPRESA != null ? String(e.CODTIPOEMPRESA) : '';
          return `<option value="${nit.replace(/"/g, '&quot;')}" data-codtipoempresa="${tip.replace(/"/g, '&quot;')}">${nom.replace(/</g, '&lt;')}</option>`;
        })
        .join('');
    } catch (err) {
      el.empresa.innerHTML = '<option value="">Error al cargar empresas</option>';
      console.warn(err);
    }
  }

  function showLoginPanel() {
    el.panelPair?.setAttribute('hidden', '');
    el.panelLogin?.removeAttribute('hidden');
    refreshBiometricUiForLogin().catch(() => {});
  }

  async function refreshBiometricUiForLogin() {
    const bioBtn = document.getElementById('btn-companion-biometric');
    if (!bioBtn) return;
    try {
      const data = await fetchJson(`/api/auth/biometric-config?_=${Date.now()}`);
      const permite = String(data?.permiteBiometrico || 'NO').toUpperCase() === 'SI';
      const showBio =
        permite && typeof WebAuthnClient !== 'undefined' && WebAuthnClient.isSupported();
      bioBtn.hidden = !showBio;
      if (el.loginDivider) el.loginDivider.hidden = !showBio;
    } catch {
      bioBtn.hidden = true;
      if (el.loginDivider) el.loginDivider.hidden = true;
    }
  }

  function activateSession(summary) {
    state.sessionActive = true;
    state.empNit = String(summary?.empNit || summary?.empnit || el.empresa?.value || '').trim();
    state.empNombre = String(summary?.empNombre || '').trim();
    applyAdministratorFlags(summary);
    showRemotePanel(summary);
  }

  function showRemotePanel(summary) {
    el.panelLogin?.setAttribute('hidden', '');
    el.panelRemote?.removeAttribute('hidden');
    if (summary) {
      const user = summary.username || summary.user?.nomempleado || 'Usuario';
      const emp =
        summary.empNombre || summary.empNit || state.empNombre || state.empNit || '';
      if (el.userLine) {
        el.userLine.innerHTML = `<i class="fa-solid fa-circle-user me-1"></i>${escapeHtml(user)}<span class="opacity-75"> · ${escapeHtml(emp)}</span>`;
      }
      if (summary.empNit || summary.empnit) {
        state.empNit = String(summary.empNit || summary.empnit).trim();
      }
      if (summary.empNombre) state.empNombre = String(summary.empNombre).trim();
    }
    updateSessionOnlySections();
    bindPointerRemote();
    loadReportsCatalog().catch(() => renderReports());
  }

  function updateSessionOnlySections() {
    const show = isCompanionSessionActive();
    const showReports = show && state.isAdministrator;
    if (el.pointerPanel) {
      if (show) el.pointerPanel.removeAttribute('hidden');
      else el.pointerPanel.setAttribute('hidden', '');
    }
    if (el.reportsSection) {
      if (showReports) el.reportsSection.removeAttribute('hidden');
      else el.reportsSection.setAttribute('hidden', '');
    }
    if (!show && typeof CompanionPointerRemote !== 'undefined') {
      CompanionPointerRemote.stop?.();
    }
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function bindPointerRemote() {
    if (typeof CompanionPointerRemote === 'undefined' || !state.socket) return;
    CompanionPointerRemote.attach(state.socket, isCompanionSessionActive);
  }

  function reportIcon(codigo) {
    const key = String(codigo || '').toUpperCase();
    return REPORT_ICONS[key] || 'fa-chart-line';
  }

  async function loadReportsCatalog() {
    if (!state.isAdministrator) {
      state.reports = [];
      renderReports();
      return;
    }
    const empnit = state.empNit || el.empresa?.value?.trim();
    if (!empnit) {
      state.reports = [];
      renderReports();
      return;
    }
    const params = new URLSearchParams({ empnit, _: String(Date.now()) });
    const data = await fetchJson(`/api/consultas-externas/catalog?${params.toString()}`);
    state.reports = (data.reports || []).filter((r) => r.implementado);
    renderReports();
  }

  function renderReports() {
    if (!el.reportsGrid) return;
    const items = state.reports || [];
    el.reportsGrid.innerHTML = '';
    if (!items.length) {
      el.noReports?.removeAttribute('hidden');
      return;
    }
    el.noReports?.setAttribute('hidden', '');
    for (const r of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'companion-report-btn';
      btn.dataset.codigo = r.codigo;
      btn.innerHTML = `
        <span class="companion-report-icon"><i class="fa-solid ${reportIcon(r.codigo)}" aria-hidden="true"></i></span>
        <span class="companion-report-label">${escapeHtml(r.nombre || r.codigo)}</span>`;
      btn.addEventListener('click', () => playReport(r, btn));
      el.reportsGrid.appendChild(btn);
    }
  }

  function speakText(text) {
    if (!('speechSynthesis' in window)) {
      alert(text);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text || '').trim());
    utter.lang = 'es-GT';
    utter.rate = 0.95;
    state.speaking = true;
    utter.onend = () => {
      state.speaking = false;
    };
    utter.onerror = () => {
      state.speaking = false;
    };
    window.speechSynthesis.speak(utter);
  }

  async function playReport(report, btn) {
    if (!state.isAdministrator) {
      alert('Reportes de voz solo para administrador');
      return;
    }
    const codigo = report?.codigo;
    if (!state.token || !codigo) return;
    if (state.speaking) window.speechSynthesis.cancel();
    btn?.classList.add('is-loading');
    setStatus(`Consultando ${report.nombre || codigo}…`, 'wait');
    try {
      const params = new URLSearchParams({
        t: state.token,
        ventadia: codigo,
        _: String(Date.now()),
      });
      const data = await fetchJson(`/api/remote-companion/report-mensaje?${params.toString()}`);
      const msg = data.mensaje || 'Sin datos';
      speakText(msg);
      setStatus('Leyendo reporte…', 'ok');
    } catch (err) {
      setStatus(err.message, 'off');
      alert(err.message || 'No se pudo obtener el reporte');
    } finally {
      btn?.classList.remove('is-loading');
    }
  }

  function renderFavorites() {
    if (!el.favGrid) return;
    const items = state.favorites || [];
    el.favGrid.innerHTML = '';
    if (!items.length) {
      el.noFavs?.removeAttribute('hidden');
      return;
    }
    el.noFavs?.setAttribute('hidden', '');
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'companion-fav-btn';
      btn.innerHTML = `
        <i class="fa-solid fa-window-maximize companion-fav-icon" aria-hidden="true"></i>
        <span>${escapeHtml(item.label || item.key)}</span>`;
      btn.addEventListener('click', () => {
        state.socket?.emit('companion:navigate', { menu: item.key });
        setStatus(`Enviado: ${item.label || item.key}`, 'ok');
      });
      el.favGrid.appendChild(btn);
    }
  }

  function selectedEmpresaMeta() {
    const empnit = el.empresa?.value?.trim();
    const opt = el.empresa?.selectedOptions?.[0];
    return {
      empnit,
      empNombre: opt?.textContent?.trim() || empnit,
      codTipoEmpresa: opt?.dataset?.codtipoempresa || '',
    };
  }

  async function loginPassword() {
    const { empnit, empNombre, codTipoEmpresa } = selectedEmpresaMeta();
    const usuario = el.usuario?.value?.trim();
    const password = el.password?.value;
    if (!empnit || !usuario || !password) {
      alert('Complete empresa, usuario y contraseña');
      return;
    }
    setStatus('Iniciando sesión…', 'wait');
    const auth = await fetchJson('/api/remote-companion/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: state.token,
        empnit,
        usuario,
        password,
        empNombre,
        codTipoEmpresa,
        dbMode: 'local',
      }),
    });
    state.lastAuth = auth;
    activateSession({
      username: auth.user?.nomempleado || usuario,
      empNombre,
      empNit: empnit,
      codtipoempleado: auth.user?.codtipoempleado,
      superUser: auth.user?.superUser,
      isAdministrator: Boolean(auth.user?.superUser || Number(auth.user?.codtipoempleado) === 1),
    });
    setStatus('Sesión vinculada a la PC', 'ok');
    updateBiometricButtons(auth);
  }

  function updateBiometricButtons(auth) {
    const bioBtn = document.getElementById('btn-companion-biometric');
    const regBtn = document.getElementById('btn-companion-register-bio');
    const showBio =
      typeof WebAuthnClient !== 'undefined' &&
      WebAuthnClient.isSupported() &&
      String(auth?.permiteBiometrico || 'NO').toUpperCase() === 'SI';
    if (bioBtn) bioBtn.hidden = !showBio;
    if (regBtn) {
      regBtn.hidden = !(showBio && auth?.webauthnRegToken && !auth?.hasPasskey);
    }
    if (el.loginDivider) el.loginDivider.hidden = !showBio;
  }

  async function loginBiometric() {
    const { empnit, empNombre, codTipoEmpresa } = selectedEmpresaMeta();
    if (!empnit) {
      alert('Seleccione empresa');
      return;
    }
    if (!state.token) {
      alert('Empareje con la PC primero');
      return;
    }
    const usuario = el.usuario?.value?.trim();
    setStatus('Passkey…', 'wait');
    const auth = await WebAuthnClient.companionLogin({
      token: state.token,
      empnit,
      empNombre,
      codTipoEmpresa,
      ...(usuario ? { usuario } : {}),
    });
    state.lastAuth = auth;
    activateSession({
      username: auth.user?.nomempleado || auth.user?.usuario,
      empNombre,
      empNit: empnit,
      codtipoempleado: auth.user?.codtipoempleado,
      superUser: auth.user?.superUser,
      isAdministrator: Boolean(auth.user?.superUser || Number(auth.user?.codtipoempleado) === 1),
    });
    setStatus('Sesión vinculada a la PC', 'ok');
    updateBiometricButtons(auth);
  }

  async function registerBiometric() {
    const auth = state.lastAuth;
    if (!auth?.webauthnRegToken || !auth?.user?.codempleado) {
      alert('Inicie sesión con contraseña primero para registrar passkey');
      return;
    }
    const empnit = el.empresa?.value?.trim();
    await WebAuthnClient.register({
      empnit,
      codempleado: auth.user.codempleado,
      usuario: auth.user.usuario,
      regToken: auth.webauthnRegToken,
    });
    alert('Passkey registrado en este teléfono');
    auth.hasPasskey = true;
    updateBiometricButtons(auth);
  }

  async function startScanner() {
    if (typeof Html5Qrcode === 'undefined') {
      alert('Lector QR no disponible');
      return;
    }
    el.scanRegion?.removeAttribute('hidden');
    if (!state.scanner) {
      state.scanner = new Html5Qrcode('companion-scan-region');
    }
    const cameras = await Html5Qrcode.getCameras();
    if (!cameras?.length) {
      alert('No se encontró cámara');
      return;
    }
    const camId = cameras[cameras.length - 1].id;
    await state.scanner.start(
      camId,
      { fps: 8, qrbox: { width: 220, height: 220 } },
      async (decoded) => {
        const token = extractTokenFromScan(decoded);
        if (!token) return;
        try {
          await state.scanner.stop();
        } catch {
          /* ignore */
        }
        el.scanRegion?.setAttribute('hidden', '');
        if (el.tokenInput) el.tokenInput.value = token;
        await joinWithToken(token);
      },
      () => {}
    );
  }

  document.getElementById('btn-companion-join')?.addEventListener('click', () => {
    joinWithToken(el.tokenInput?.value).catch((err) => {
      setStatus(err.message, 'off');
      alert(err.message);
    });
  });

  document.getElementById('btn-companion-scan')?.addEventListener('click', () => {
    startScanner().catch((err) => alert(err.message || 'No se pudo abrir la cámara'));
  });

  document.getElementById('btn-companion-login')?.addEventListener('click', () => {
    loginPassword().catch((err) => {
      setStatus(err.message, 'off');
      alert(err.message);
    });
  });

  document.getElementById('btn-companion-biometric')?.addEventListener('click', () => {
    loginBiometric().catch((err) => {
      setStatus(err.message, 'off');
      if (err?.name === 'NotAllowedError') {
        alert('Autenticación cancelada');
        return;
      }
      alert(err.message);
    });
  });

  document.getElementById('btn-companion-register-bio')?.addEventListener('click', () => {
    registerBiometric().catch((err) => alert(err.message || 'No se pudo registrar'));
  });

  initSocket();
  bindPointerRemote();
  const urlToken = parseTokenFromUrl();
  if (urlToken) {
    if (el.tokenInput) el.tokenInput.value = urlToken;
    joinWithToken(urlToken).catch((err) => setStatus(err.message, 'off'));
  }
})();
