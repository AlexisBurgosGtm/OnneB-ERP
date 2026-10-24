/**
 * Estilos visuales del login (SETTINGS → ESTILO DEL LOGIN). No afecta el tema del POS tras iniciar sesión.
 */
(function loginStyleModule() {
  'use strict';

  const STYLES = ['DEFAULT', 'TEMA', 'HALLOWEEN', 'NAVIDAD', 'DIA CARINO', 'ANO NUEVO'];
  const CLASS_SUFFIX = {
    DEFAULT: 'default',
    TEMA: 'tema',
    HALLOWEEN: 'halloween',
    NAVIDAD: 'navidad',
    'DIA CARINO': 'dia-carino',
    'ANO NUEVO': 'ano-nuevo',
  };
  const CLASS_PREFIX = 'login-style-';
  let cachedEstilo = 'TEMA';

  function getView() {
    return document.getElementById('view-login');
  }

  function normalizeEstilo(raw) {
    let s = String(raw ?? 'TEMA')
      .trim()
      .toUpperCase();
    if (s === 'DEFAUL') return 'DEFAULT';
    s = s.replace(/Ñ/g, 'N').replace(/Á/g, 'A').replace(/É/g, 'E').replace(/Í/g, 'I').replace(/Ó/g, 'O').replace(/Ú/g, 'U');
    if (s === 'DIA DEL CARINO') return 'DIA CARINO';
    if (s === 'AÑO NUEVO') return 'ANO NUEVO';
    return STYLES.includes(s) ? s : 'TEMA';
  }

  function classSuffix(estilo) {
    return CLASS_SUFFIX[estilo] || String(estilo).toLowerCase().replace(/\s+/g, '-');
  }

  function clearStyleClasses(view) {
    if (!view) return;
    Object.values(CLASS_SUFFIX).forEach((slug) => view.classList.remove(`${CLASS_PREFIX}${slug}`));
    view.classList.remove('login-parallax-active');
  }

  function hideParallaxHost(view) {
    const host = view?.querySelector('.login-parallax-host');
    if (host) host.hidden = true;
  }

  function showParallaxHost(view) {
    const host = view?.querySelector('.login-parallax-host');
    if (host) host.hidden = false;
  }

  function buildHalloweenDecor(container) {
    const icons = [
      { cls: 'fa-solid fa-jack-o-lantern', color: '#fbbf24' },
      { cls: 'fa-solid fa-skull', color: '#f8fafc' },
      { cls: 'fa-solid fa-ghost', color: '#e2e8f0' },
      { cls: 'fa-solid fa-spider', color: '#fbbf24' },
    ];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 16; i += 1) {
      const pick = icons[i % icons.length];
      const el = document.createElement('i');
      el.className = `${pick.cls} login-festive-icon`;
      el.setAttribute('aria-hidden', 'true');
      el.style.color = pick.color;
      el.style.left = `${4 + Math.random() * 88}%`;
      el.style.top = `${4 + Math.random() * 88}%`;
      el.style.fontSize = `${1.1 + Math.random() * 1.4}rem`;
      el.style.animationDelay = `${Math.random() * 4}s`;
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  function buildNavidadDecor(container) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 28; i += 1) {
      const flake = document.createElement('span');
      flake.className = 'login-snowflake';
      flake.textContent = '❄';
      flake.style.left = `${Math.random() * 100}%`;
      flake.style.animationDuration = `${4 + Math.random() * 8}s`;
      flake.style.animationDelay = `${Math.random() * 6}s`;
      flake.style.fontSize = `${0.65 + Math.random() * 0.9}rem`;
      flake.style.opacity = String(0.35 + Math.random() * 0.55);
      frag.appendChild(flake);
    }
    container.appendChild(frag);
  }

  function buildDiaCarinoDecor(container) {
    const icons = [
      { cls: 'fa-solid fa-heart', color: '#f43f5e' },
      { cls: 'fa-solid fa-heart', color: '#fb7185' },
      { cls: 'fa-solid fa-gift', color: '#fda4af' },
      { cls: 'fa-solid fa-face-kiss-wink-heart', color: '#fecdd3' },
    ];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 18; i += 1) {
      const pick = icons[i % icons.length];
      const el = document.createElement('i');
      el.className = `${pick.cls} login-festive-icon login-festive-icon--heart`;
      el.setAttribute('aria-hidden', 'true');
      el.style.color = pick.color;
      el.style.left = `${2 + Math.random() * 92}%`;
      el.style.top = `${2 + Math.random() * 92}%`;
      el.style.fontSize = `${1 + Math.random() * 1.6}rem`;
      el.style.animationDelay = `${Math.random() * 3}s`;
      frag.appendChild(el);
    }
    container.appendChild(frag);
  }

  function buildAnoNuevoDecor(container) {
    const colors = ['#fbbf24', '#f472b6', '#38bdf8', '#4ade80', '#fb923c', '#a78bfa'];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 8; i += 1) {
      const fw = document.createElement('span');
      fw.className = 'login-firework';
      fw.style.left = `${8 + Math.random() * 84}%`;
      fw.style.top = `${8 + Math.random() * 55}%`;
      fw.style.setProperty('--fw-color', colors[i % colors.length]);
      fw.style.animationDelay = `${Math.random() * 2.5}s`;
      frag.appendChild(fw);
    }
    const partyIcons = [
      'fa-solid fa-champagne-glasses',
      'fa-solid fa-star',
      'fa-solid fa-music',
      'fa-solid fa-wand-magic-sparkles',
    ];
    for (let i = 0; i < 10; i += 1) {
      const el = document.createElement('i');
      el.className = `${partyIcons[i % partyIcons.length]} login-festive-icon login-festive-icon--party`;
      el.setAttribute('aria-hidden', 'true');
      el.style.color = colors[(i + 2) % colors.length];
      el.style.left = `${4 + Math.random() * 88}%`;
      el.style.top = `${4 + Math.random() * 88}%`;
      el.style.fontSize = `${1 + Math.random() * 1.2}rem`;
      el.style.opacity = '0.65';
      el.style.animationDelay = `${Math.random() * 4}s`;
      frag.appendChild(el);
    }
    for (let i = 0; i < 24; i += 1) {
      const c = document.createElement('span');
      c.className = 'login-confetti';
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = `${3 + Math.random() * 5}s`;
      c.style.animationDelay = `${Math.random() * 4}s`;
      frag.appendChild(c);
    }
    container.appendChild(frag);
  }

  function paintYearBadge(estilo) {
    const badge = document.getElementById('login-year-badge');
    if (!badge) return;
    badge.hidden = true;
    badge.textContent = '';
    if (estilo !== 'ANO NUEVO') return;
    badge.hidden = false;
    badge.textContent = String(new Date().getFullYear());
  }

  function paintFestiveDecor(estilo) {
    const layer = document.getElementById('login-festive-decor');
    if (!layer) return;
    layer.innerHTML = '';
    layer.hidden = true;
    paintYearBadge(estilo);
    if (estilo === 'HALLOWEEN') {
      layer.hidden = false;
      buildHalloweenDecor(layer);
    } else if (estilo === 'NAVIDAD') {
      layer.hidden = false;
      buildNavidadDecor(layer);
    } else if (estilo === 'DIA CARINO') {
      layer.hidden = false;
      buildDiaCarinoDecor(layer);
    } else if (estilo === 'ANO NUEVO') {
      layer.hidden = false;
      buildAnoNuevoDecor(layer);
    }
  }

  function showThemeScene(show) {
    const scene = document.getElementById('login-theme-scene');
    if (scene) scene.hidden = !show;
  }

  function apply(estiloRaw) {
    const estilo = normalizeEstilo(estiloRaw);
    cachedEstilo = estilo;
    const view = getView();
    if (!view) return;

    if (typeof LoginParallax !== 'undefined') LoginParallax.unmount();

    clearStyleClasses(view);
    hideParallaxHost(view);
    showThemeScene(false);
    paintFestiveDecor(estilo);

    if (estilo === 'DEFAULT') {
      showParallaxHost(view);
      view.classList.add('login-parallax-active');
      if (typeof LoginParallax !== 'undefined') LoginParallax.mount();
      return;
    }

    view.classList.add(`${CLASS_PREFIX}${classSuffix(estilo)}`);
    if (estilo === 'TEMA') showThemeScene(true);
  }

  async function fetchEstiloFromServer() {
    try {
      const data = await fetch(`/api/auth/login-presentation?_=${Date.now()}`, { cache: 'no-store' }).then(
        (r) => (r.ok ? r.json() : {})
      );
      return normalizeEstilo(data?.estiloLogin);
    } catch {
      return cachedEstilo;
    }
  }

  async function applyForCurrentSetting() {
    const estilo = await fetchEstiloFromServer();
    apply(estilo);
  }

  function teardown() {
    paintYearBadge('');
    if (typeof LoginParallax !== 'undefined') LoginParallax.unmount();
  }

  function getCachedEstilo() {
    return cachedEstilo;
  }

  window.LoginStyle = {
    apply,
    applyForCurrentSetting,
    teardown,
    normalizeEstilo,
    fetchEstiloFromServer,
    getCachedEstilo,
    STYLES,
  };
})();
