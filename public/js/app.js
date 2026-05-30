/**
 * OnneB POS — SPA vanilla JS
 */
(function () {
  const views = {
    login: document.getElementById('view-login'),
    main: document.getElementById('view-main'),
  };

  const loginForm = document.getElementById('login-form');
  const btnLogout = document.getElementById('btn-logout');
  const buildCounterEl = document.getElementById('build-counter');
  const sidebar = document.getElementById('sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  const btnMenuToggle = document.getElementById('btn-menu-toggle');
  const btnMenuFab = document.getElementById('btn-menu-fab');
  const mainContent = document.getElementById('main-content');
  const mainTitle = document.getElementById('main-title');

  let socket = null;
  let currentView = 'login';

  /** Siempre inicia en login al cargar o recargar la página (F5). */
  function ensureLoginView() {
    F.clearSession('user');
    window.OnnebContext = {};
    if (!views.login || !views.main) return;

    views.main.classList.remove(
      'view-active',
      'view-exit-left',
      'view-exit-right',
      'view-enter-from-right',
      'view-start-left'
    );
    views.main.classList.add('view-next');
    views.login.classList.remove(
      'view-next',
      'view-exit-left',
      'view-exit-right',
      'view-enter-from-right',
      'view-start-left'
    );
    views.login.classList.add('view-active');
    currentView = 'login';
    updateFabVisibility();
  }

  function updateFabVisibility() {
    if (!btnMenuFab) return;
    btnMenuFab.classList.toggle('is-visible', currentView === 'main');
  }

  function navigateTo(target) {
    if (target === currentView) return;

    const from = views[currentView];
    const to = views[target];
    if (!from || !to) return;

    const goingForward = target === 'main';

    if (target === 'main') {
      updateFabVisibility();
    } else if (target === 'login') {
      updateFabVisibility();
    }

    if (goingForward) {
      from.classList.remove('view-active');
      from.classList.add('view-exit-left');
      to.classList.remove('view-next');
      to.classList.add('view-enter-from-right');
    } else {
      from.classList.remove('view-active');
      from.classList.add('view-exit-right');
      to.classList.remove('view-next');
      to.classList.add('view-start-left');
      requestAnimationFrame(() => {
        to.classList.remove('view-start-left');
        to.classList.add('view-enter-from-left');
      });
    }

    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      to.removeEventListener('transitionend', onEnd);

      if (goingForward) {
        from.classList.remove('view-active', 'view-exit-left');
        from.classList.add('view-next');
        to.classList.remove('view-enter-from-right');
        to.classList.add('view-active');
      } else {
        from.classList.remove('view-active', 'view-exit-right');
        from.classList.add('view-next');
        to.classList.remove('view-enter-from-left', 'view-start-left');
        to.classList.add('view-active');
      }
      currentView = target;
      updateFabVisibility();
    };

    to.addEventListener('transitionend', onEnd);
  }

  async function loadBuildCounter() {
    if (!buildCounterEl) return;
    try {
      const meta = await F.fetchJson(`/api/build-meta?_=${Date.now()}`, { cache: 'no-store' });
      const n = meta.buildCount ?? 0;
      const date = meta.buildDate || F.formatDateDD(meta.lastBuild);
      buildCounterEl.innerHTML = [
        `<span class="build-count">Compilación #${n}</span>`,
        `<span class="build-date">${date}</span>`,
      ].join('');
      buildCounterEl.title = meta.lastBuild ? `Última actualización: ${meta.lastBuild}` : '';
    } catch {
      buildCounterEl.innerHTML = [
        '<span class="build-count">Compilación #—</span>',
        `<span class="build-date">${F.formatDateDD()}</span>`,
      ].join('');
    }
  }

  function startBuildCounterPoll() {
    if (window._buildPollId) return;
    window._buildPollId = setInterval(loadBuildCounter, 1500);
  }

  function initSocket() {
    if (typeof io === 'undefined') return;
    socket = io();
    socket.on('welcome', (data) => {
      console.log('[Socket.IO]', data.message);
    });
    socket.on('connect', () => {
      console.log('[Socket.IO] Conectado');
    });
    socket.on('disconnect', () => {
      console.log('[Socket.IO] Desconectado');
    });
    socket.on('build:updated', () => {
      loadBuildCounter();
    });
  }

  function escapeOptionText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normEmpNit(value) {
    return String(value ?? '').trim();
  }

  async function fetchEmpresasForLogin() {
    const qs = `?_=${Date.now()}`;
    try {
      return await F.fetchJson(`/api/empresas/combo${qs}`, { cache: 'no-store' });
    } catch (comboErr) {
      console.warn('[Login] /empresas/combo:', comboErr.message);
      return F.fetchJson(`/api/empresas${qs}`, { cache: 'no-store' });
    }
  }

  async function loadLoginEmpresas(selectedNit = '') {
    const select = document.getElementById('login-empresa');
    if (!select) return;
    const nitGuardado = normEmpNit(selectedNit);
    try {
      const data = await fetchEmpresasForLogin();
      const rows = (data.rows || [])
        .map((e) => ({
          EMPNIT: normEmpNit(e.EMPNIT),
          EMPNOMBRE: String(e.EMPNOMBRE ?? '').trim() || normEmpNit(e.EMPNIT),
        }))
        .filter((e) => e.EMPNIT);
      if (!rows.length) {
        select.innerHTML = '<option value="">Sin empresas disponibles</option>';
        select.disabled = true;
        return;
      }
      select.disabled = false;
      select.innerHTML = rows
        .map((e) => {
          const nit = escapeOptionText(e.EMPNIT);
          const nombre = escapeOptionText(e.EMPNOMBRE);
          return `<option value="${nit}">${nombre}</option>`;
        })
        .join('');
      const existe = nitGuardado && rows.some((r) => r.EMPNIT === nitGuardado);
      select.value = existe ? nitGuardado : rows[0].EMPNIT;
    } catch (err) {
      console.warn('[Login] Empresas:', err);
      select.innerHTML = '<option value="">Error al cargar empresas</option>';
      select.disabled = true;
    }
  }

  if (loginForm) loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const empresaSelect = document.getElementById('login-empresa');
    const empNit = empresaSelect?.value?.trim();
    if (!empNit || empresaSelect?.disabled) {
      F.toast('No hay empresa disponible', 'warning');
      return;
    }
    const empNombre = empresaSelect.selectedOptions[0]?.textContent?.trim() || empNit;
    if (window.OnnebPace) OnnebPace.start();
    const username = document.getElementById('username').value.trim() || 'invitado';
    const sessionData = {
      username,
      empNit,
      empNombre,
      at: new Date().toISOString(),
    };
    F.session('user', sessionData);
    F.setEmpresaGlobal(empNit, empNombre);
    document.getElementById('password').value = '';
    navigateTo('main');
    F.toast(`Bienvenido — ${empNombre}`, 'success');
  });

  function setMenuExpanded(expanded) {
    const value = expanded ? 'true' : 'false';
    btnMenuToggle.setAttribute('aria-expanded', value);
    if (btnMenuFab) btnMenuFab.setAttribute('aria-expanded', value);
  }

  function openSidebar() {
    sidebar.classList.add('is-open');
    sidebarOverlay.classList.add('is-visible');
    setMenuExpanded(true);
  }

  function closeSidebar() {
    sidebar.classList.remove('is-open');
    sidebarOverlay.classList.remove('is-visible');
    setMenuExpanded(false);
  }

  function toggleSidebar() {
    if (sidebar.classList.contains('is-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  const menuLabels = {
    'productos-precios': 'Productos y precios',
    marcas: 'Marcas',
    medidas: 'Medidas',
    clientes: 'Clientes',
    rutas: 'Rutas',
    proveedores: 'Proveedores',
    fabricantes: 'Fabricantes',
    ubicaciones: 'Ubicaciones',
    empresas: 'Empresas',
    'config-general': 'Config general',
    'tipo-documentos': 'Tipo documentos',
    'credenciales-fel': 'Credenciales FEL',
  };

  btnMenuToggle.addEventListener('click', toggleSidebar);
  if (btnMenuFab) btnMenuFab.addEventListener('click', toggleSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.OnnebPace) OnnebPace.start();
      const key = link.dataset.menu;
      const label = menuLabels[key] || key;
      document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('is-active'));
      link.classList.add('is-active');
      mainTitle.textContent = label;
      mainContent.className = 'main-content flex-grow-1 d-flex p-3';

      if (key === 'empresas' && typeof EmpresasView !== 'undefined') {
        EmpresasView.load(mainContent);
      } else if (key === 'marcas' && typeof MarcasView !== 'undefined') {
        MarcasView.load(mainContent);
      } else if (key === 'medidas' && typeof MedidasView !== 'undefined') {
        MedidasView.load(mainContent);
      } else if (key === 'rutas' && typeof RutasView !== 'undefined') {
        RutasView.load(mainContent);
      } else if (key === 'fabricantes' && typeof FabricantesView !== 'undefined') {
        FabricantesView.load(mainContent);
      } else if (key === 'proveedores' && typeof ProveedoresView !== 'undefined') {
        ProveedoresView.load(mainContent);
      } else if (key === 'config-general' && typeof ConfigGeneralView !== 'undefined') {
        ConfigGeneralView.load(mainContent);
      } else {
        mainContent.classList.add('align-items-center', 'justify-content-center');
        mainContent.classList.remove('align-items-stretch', 'justify-content-start');
        mainContent.innerHTML = `<p class="text-muted mb-0">${label} — contenido pendiente</p>`;
      }

      closeSidebar();
      setTimeout(() => {
        if (typeof Pace !== 'undefined' && Pace.running) Pace.stop();
      }, 600);
    });
  });

  btnLogout.addEventListener('click', async () => {
    const salir = await CatalogosUI.confirmSalir({
      title: '¿Cerrar sesión?',
      text: 'Se cerrará la sesión y volverá al inicio de sesión.',
    });
    if (!salir) return;
    F.clearSession('user');
    window.OnnebContext = {};
    const userInput = document.getElementById('username');
    const passInput = document.getElementById('password');
    const empresaSelect = document.getElementById('login-empresa');
    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    closeSidebar();
    navigateTo('login');
    await loadLoginEmpresas();
  });

  async function bootApp() {
    ensureLoginView();
    await loadLoginEmpresas('');

    if (buildCounterEl) {
      await loadBuildCounter();
      startBuildCounterPoll();
    }

    try {
      await OnnebDb.init();
    } catch (err) {
      console.warn('[DB] init:', err);
    }

    initSocket();
  }

  ensureLoginView();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bootApp().catch((err) => console.error('[App] boot:', err));
    });
  } else {
    bootApp().catch((err) => console.error('[App] boot:', err));
  }
})();
