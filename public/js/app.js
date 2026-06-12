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

  const LOGIN_REMEMBER_KEY = 'onneb-login-remember';

  function getLoginRemember() {
    try {
      const raw = localStorage.getItem(LOGIN_REMEMBER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveLoginRemember({ username, empNit, enabled }) {
    try {
      if (!enabled) {
        localStorage.removeItem(LOGIN_REMEMBER_KEY);
        return;
      }
      localStorage.setItem(
        LOGIN_REMEMBER_KEY,
        JSON.stringify({ username: username || '', empNit: empNit || '' }),
      );
    } catch (err) {
      console.warn('[Login] Recordarme:', err);
    }
  }

  function applyLoginRememberFields() {
    const saved = getLoginRemember();
    const rememberCheck = document.getElementById('login-remember');
    const userInput = document.getElementById('username');
    if (!saved) {
      if (rememberCheck) rememberCheck.checked = false;
      return '';
    }
    if (rememberCheck) rememberCheck.checked = true;
    if (userInput && saved.username) userInput.value = saved.username;
    return saved.empNit || '';
  }

  function restoreLoginFieldsAfterLogout() {
    const saved = getLoginRemember();
    const userInput = document.getElementById('username');
    const passInput = document.getElementById('password');
    const rememberCheck = document.getElementById('login-remember');
    if (passInput) passInput.value = '';
    if (saved?.username && userInput) {
      userInput.value = saved.username;
      if (rememberCheck) rememberCheck.checked = true;
      return saved.empNit || '';
    }
    if (userInput) userInput.value = '';
    if (rememberCheck) rememberCheck.checked = false;
    return '';
  }

  let socket = null;
  let currentView = 'login';

  const VIEW_CLASSES = [
    'view-active',
    'view-next',
    'view-exit-left',
    'view-exit-right',
    'view-enter-from-right',
    'view-enter-from-left',
    'view-start-left',
  ];

  /** Cambio de vista sin animación (evita pantalla congelada al salir). */
  function setViewImmediate(showLogin) {
    if (!views.login || !views.main) return;

    [views.login, views.main].forEach((el) => {
      VIEW_CLASSES.forEach((c) => el.classList.remove(c));
      el.classList.remove('view-hidden');
      el.style.transition = 'none';
    });

    if (showLogin) {
      views.main.classList.add('view-hidden');
      views.login.classList.add('view-active');
      views.login.classList.remove('view-hidden', 'view-next');
      views.main.classList.remove('view-active');
      currentView = 'login';
    } else {
      views.login.classList.add('view-hidden');
      views.main.classList.add('view-active');
      views.main.classList.remove('view-hidden', 'view-next');
      views.login.classList.remove('view-active');
      currentView = 'main';
    }

    void views.main.offsetHeight;
    [views.login, views.main].forEach((el) => {
      el.style.transition = '';
    });
    updateFabVisibility();
  }

  function stopLoadingOverlays() {
    if (window.OnnebPace) OnnebPace.stop();
    if (typeof Pace !== 'undefined' && Pace.running) Pace.stop();
    const paceOverlay = document.getElementById('onneb-pace-overlay');
    if (paceOverlay) {
      paceOverlay.classList.remove('is-active');
      paceOverlay.setAttribute('aria-busy', 'false');
    }
  }

  function dismissBlockingLayers() {
    stopLoadingOverlays();
    if (typeof Swal !== 'undefined' && Swal.isVisible()) Swal.close();
    closeSidebar();
  }

  /** Muestra la pantalla de login y oculta la vista principal. */
  function ensureLoginView(clearSession = true) {
    if (clearSession) {
      F.clearSession('user');
      window.OnnebContext = {};
      if (typeof EmpresaLogo !== 'undefined') EmpresaLogo.clearSession();
    }
    setViewImmediate(true);
  }

  /** Cerrar sesión y volver al login (botón Salir). */
  function goToLogin() {
    dismissBlockingLayers();

    F.clearSession('user');
    window.OnnebContext = {};
    if (typeof EmpresaLogo !== 'undefined') EmpresaLogo.clearSession();

    const userInput = document.getElementById('username');
    const passInput = document.getElementById('password');
    if (passInput) passInput.value = '';
    if (userInput && !getLoginRemember()?.username) userInput.value = '';

    if (mainTitle) mainTitle.textContent = 'OnneB POS';
    clearHeaderSessionInfo();
    if (mainContent) {
      mainContent.className = 'main-content flex-grow-1 d-flex align-items-center justify-content-center';
      mainContent.innerHTML = '<p class="text-muted mb-0">Seleccione una opción del menú</p>';
    }
    document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('is-active'));

    setViewImmediate(true);
    loadLoginEmpresas(restoreLoginFieldsAfterLogout());
  }

  function updateFabVisibility() {
    if (!btnMenuFab) return;
    btnMenuFab.classList.toggle('is-visible', currentView === 'main');
  }

  function updateHeaderEmpresaLogo() {
    const logoWrap = document.getElementById('header-empresa-logo');
    const iconEl = document.getElementById('header-empresa-icon-fallback');
    if (!logoWrap) return;
    const dataUrl = typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.getDataUrl() : null;
    if (dataUrl) {
      logoWrap.innerHTML = `<img src="${dataUrl}" alt="" class="header-empresa-logo-img">`;
      logoWrap.hidden = false;
      if (iconEl) iconEl.hidden = true;
    } else {
      logoWrap.innerHTML = '';
      logoWrap.hidden = true;
      if (iconEl) iconEl.hidden = false;
    }
  }

  function updateHeaderSessionInfo() {
    const empNameEl = document.getElementById('header-empresa-name');
    const userNameEl = document.getElementById('header-user-name');
    const empBadge = document.getElementById('header-empresa');
    const userBadge = document.getElementById('header-user');
    const user = F.session('user');
    const empNombre = user?.empNombre || F.getEmpNitNombre() || '—';
    const username = user?.username || '—';

    if (empNameEl) empNameEl.textContent = empNombre;
    if (userNameEl) userNameEl.textContent = username;
    if (empBadge) empBadge.title = empNombre !== '—' ? `Empresa: ${empNombre}` : 'Empresa activa';
    if (userBadge) userBadge.title = username !== '—' ? `Usuario: ${username}` : 'Usuario activo';
    updateHeaderEmpresaLogo();
  }

  function clearHeaderSessionInfo() {
    const empNameEl = document.getElementById('header-empresa-name');
    const userNameEl = document.getElementById('header-user-name');
    if (empNameEl) empNameEl.textContent = '—';
    if (userNameEl) userNameEl.textContent = '—';
    updateHeaderEmpresaLogo();
  }

  window.updateHeaderEmpresaLogo = updateHeaderEmpresaLogo;

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
    return F.fetchJson(`/api/empresas/combo?_=${Date.now()}`, { cache: 'no-store' });
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

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {

      e.preventDefault();
      const empresaSelect = document.getElementById('login-empresa');
      const empNit = empresaSelect?.value?.trim();
      if (!empNit || empresaSelect?.disabled) {
        F.toast('No hay empresa disponible', 'warning');
        return;
      }
      const empNombre = empresaSelect.selectedOptions[0]?.textContent?.trim() || empNit;
      const username = document.getElementById('username').value.trim() || 'invitado';
      const password = document.getElementById('password').value;
      if (window.OnnebPace) OnnebPace.start();
      try {
        let authUser = null;
        if (password) {
          const auth = await F.fetchJson('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: username, password }),
          });
          authUser = auth.user;
        }
        const sessionData = {
          username: authUser?.usuario || username,
          userId: authUser?.id ?? null,
          nivel: authUser?.nivel ?? null,
          email: authUser?.email ?? '',
          empNit,
          empNombre,
          at: new Date().toISOString(),
        };
        F.session('user', sessionData);
        F.setEmpresaGlobal(empNit, empNombre);
        saveLoginRemember({
          username,
          empNit,
          enabled: Boolean(document.getElementById('login-remember')?.checked),
        });
        document.getElementById('password').value = '';
        stopLoadingOverlays();
        setViewImmediate(false);
        updateHeaderSessionInfo();
        loadInicio();
        F.toast(`Bienvenido — ${empNombre}`, 'success');
        if (typeof EmpresaLogo !== 'undefined') {
          EmpresaLogo.loadForSession(empNit)
            .then(() => updateHeaderEmpresaLogo())
            .catch(() => updateHeaderEmpresaLogo());
        }
      } catch (err) {
        stopLoadingOverlays();
        F.toast(err.message || 'Error al iniciar sesión', 'error');
      }
    });
  }

  document.getElementById('btn-login-forgot')?.addEventListener('click', () => {
    F.toast('Contacte al administrador del sistema para restablecer su contraseña.', 'info');
  });

  function setMenuExpanded(expanded) {
    const value = expanded ? 'true' : 'false';
    if (btnMenuToggle) btnMenuToggle.setAttribute('aria-expanded', value);
    if (btnMenuFab) btnMenuFab.setAttribute('aria-expanded', value);
  }

  function openSidebar() {
    if (!sidebar || !sidebarOverlay) return;
    sidebar.classList.add('is-open');
    sidebarOverlay.classList.add('is-visible');
    setMenuExpanded(true);
  }

  function closeSidebar() {
    if (!sidebar || !sidebarOverlay) return;
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

  function loadInicio() {
    if (!mainContent || typeof PosView === 'undefined') return;
    if (mainTitle) mainTitle.textContent = 'Inicio';
    document.querySelectorAll('.sidebar-link').forEach((l) => l.classList.remove('is-active'));
    document.querySelector('.sidebar-link[data-menu="inicio"]')?.classList.add('is-active');
    mainContent.className = 'main-content flex-grow-1 d-flex p-3';
    PosView.load(mainContent);
  }

  const menuLabels = {
    inicio: 'Inicio',
    'pedidos-mostrador': 'Pedidos de Mostrador',
    suscripciones: 'Suscripciones',
    facturacion: 'Facturación',
    'notas-credito': 'Notas de Crédito',
    compras: 'Compras',
    'notas-debito': 'Notas de Débito',
    gastos: 'Gastos',
    developer: 'Developer',
    updater: 'Actualizador BD',
    'productos-precios': 'Productos y precios',
    inventario: 'Inventario',
    'entradas-inventario': 'Entradas de inventario',
    'salidas-inventario': 'Salidas de inventario',
    'inventario-retroactivo': 'Inventario Retroactivo',
    documentos: 'Documentos',
    empleados: 'Empleados',
    municipios: 'Municipios',
    departamentos: 'Departamentos',
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
    cajas: 'Cajas',
    usuarios: 'Usuarios',
  };

  if (btnMenuToggle) btnMenuToggle.addEventListener('click', toggleSidebar);
  if (btnMenuFab) btnMenuFab.addEventListener('click', toggleSidebar);
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', closeSidebar);

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

      if (key === 'inicio') {
        loadInicio();
      } else if (key === 'compras' && typeof ComprasView !== 'undefined') {
        ComprasView.load(mainContent);
      } else if (key === 'pedidos-mostrador' && typeof PosView !== 'undefined') {
        PosView.load(mainContent);
      } else if (key === 'entradas-inventario' && typeof EntradasInventarioView !== 'undefined') {
        EntradasInventarioView.load(mainContent);
      } else if (key === 'salidas-inventario' && typeof SalidasInventarioView !== 'undefined') {
        SalidasInventarioView.load(mainContent);
      } else if (key === 'inventario' && typeof InventarioView !== 'undefined') {
        InventarioView.load(mainContent);
      } else if (key === 'suscripciones' && typeof SuscripcionesView !== 'undefined') {
        SuscripcionesView.load(mainContent);
      } else if (key === 'documentos' && typeof DocumentosView !== 'undefined') {
        DocumentosView.load(mainContent);
      } else if (
        (key === 'productos-precios' || key === 'productos') &&
        typeof ProductosView !== 'undefined'
      ) {
        ProductosView.load(mainContent);
      } else if (key === 'developer' && typeof DeveloperView !== 'undefined') {
        DeveloperView.load(mainContent);
      } else if (key === 'updater' && typeof UpdaterView !== 'undefined') {
        UpdaterView.load(mainContent);
      } else if (key === 'empresas' && typeof EmpresasView !== 'undefined') {
        EmpresasView.load(mainContent);
      } else if (key === 'marcas' && typeof MarcasView !== 'undefined') {
        MarcasView.load(mainContent);
      } else if (key === 'medidas' && typeof MedidasView !== 'undefined') {
        MedidasView.load(mainContent);
      } else if (key === 'rutas' && typeof RutasView !== 'undefined') {
        RutasView.load(mainContent);
      } else if (key === 'fabricantes' && typeof FabricantesView !== 'undefined') {
        FabricantesView.load(mainContent);
      } else if (key === 'ubicaciones' && typeof UbicacionesView !== 'undefined') {
        UbicacionesView.load(mainContent);
      } else if (key === 'clientes' && typeof ClientesView !== 'undefined') {
        ClientesView.load(mainContent);
      } else if (key === 'proveedores' && typeof ProveedoresView !== 'undefined') {
        ProveedoresView.load(mainContent);
      } else if (key === 'municipios' && typeof MunicipiosView !== 'undefined') {
        MunicipiosView.load(mainContent);
      } else if (key === 'departamentos' && typeof DepartamentosView !== 'undefined') {
        DepartamentosView.load(mainContent);
      } else if (key === 'empleados' && typeof EmpleadosView !== 'undefined') {
        EmpleadosView.load(mainContent);
      } else if (key === 'tipo-documentos' && typeof TipoDocumentosView !== 'undefined') {
        TipoDocumentosView.load(mainContent);
      } else if (key === 'cajas' && typeof CajasView !== 'undefined') {
        CajasView.load(mainContent);
      } else if (key === 'usuarios' && typeof UsuariosView !== 'undefined') {
        UsuariosView.load(mainContent);
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

  async function handleLogoutClick() {
    if (currentView !== 'main') return;

    dismissBlockingLayers();

    let salir = true;
    if (typeof CatalogosUI !== 'undefined' && CatalogosUI.confirmSalir) {
      salir = await CatalogosUI.confirmSalir({
        title: '¿Cerrar sesión?',
        text: 'Se cerrará la sesión y volverá al inicio de sesión.',
      });
    }
    if (!salir) return;

    dismissBlockingLayers();
    goToLogin();
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('#btn-logout')) {
      e.preventDefault();
      e.stopPropagation();
      handleLogoutClick();
    }
  });

  async function bootApp() {
    if (typeof OnnebThemes !== 'undefined') OnnebThemes.init();

    ensureLoginView();
    await loadLoginEmpresas(applyLoginRememberFields());

    if (F.isLoggedIn()) {
      updateHeaderSessionInfo();
      const empNit = F.getEmpNit();
      if (empNit && typeof EmpresaLogo !== 'undefined') {
        EmpresaLogo.loadForSession(empNit)
          .then(() => updateHeaderEmpresaLogo())
          .catch(() => updateHeaderEmpresaLogo());
      }
    }

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
