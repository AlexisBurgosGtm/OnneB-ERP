/**
 * VistaCompartida Fase 1 — pestañas internas (máx. 1 por data-menu).
 * Sin keep-alive: al activar una pestaña se remonta la vista en #main-content.
 */
(function (global) {
  const OPCION = 'VISTAS EN PESTAÑAS';

  let enabled = false;
  let tabs = [];
  let activeKey = '';
  let mountFn = null;
  let getLabelFn = null;
  let barEl = null;

  function normalizeSino(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase() === 'SI'
      ? 'SI'
      : 'NO';
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureBar() {
    barEl = document.getElementById('view-tabs-bar');
    if (barEl) return barEl;
    const main = document.getElementById('main-content');
    if (!main?.parentElement) return null;
    barEl = document.createElement('div');
    barEl.id = 'view-tabs-bar';
    barEl.className = 'view-tabs-bar';
    barEl.hidden = true;
    barEl.setAttribute('role', 'tablist');
    barEl.setAttribute('aria-label', 'Vistas abiertas');
    main.parentElement.insertBefore(barEl, main);
    return barEl;
  }

  function getIconClass(key) {
    try {
      const link = document.querySelector(`.sidebar-link[data-menu="${CSS.escape(key)}"]`);
      const icon = link?.querySelector('i[class]');
      return icon?.className || 'fa-solid fa-file-lines';
    } catch (_) {
      return 'fa-solid fa-file-lines';
    }
  }

  function labelFor(key) {
    if (typeof getLabelFn === 'function') {
      const t = getLabelFn(key);
      if (t) return t;
    }
    return key;
  }

  function remount(key) {
    if (typeof mountFn === 'function') mountFn(key);
  }

  function renderBar() {
    const bar = ensureBar();
    if (!bar) return;

    if (!enabled || !tabs.length) {
      bar.hidden = true;
      bar.classList.remove('is-visible');
      bar.innerHTML = '';
      return;
    }

    bar.hidden = false;
    bar.classList.add('is-visible');
    bar.innerHTML = tabs
      .map((t) => {
        const active = t.key === activeKey;
        return `<div class="view-tab${active ? ' is-active' : ''}" data-tab-key="${escapeHtml(t.key)}" role="tab" aria-selected="${active}" title="${escapeHtml(t.label)}">
        <button type="button" class="view-tab-select" data-tab-select="${escapeHtml(t.key)}" aria-label="${escapeHtml(t.label)}">
          <i class="${getIconClass(t.key)}" aria-hidden="true"></i>
          <span class="view-tab-label">${escapeHtml(t.label)}</span>
        </button>
        <button type="button" class="view-tab-close" data-tab-close="${escapeHtml(t.key)}" aria-label="Cerrar ${escapeHtml(t.label)}" title="Cerrar">
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </div>`;
      })
      .join('');

    bar.querySelectorAll('[data-tab-select]').forEach((btn) => {
      btn.addEventListener('click', () => activate(btn.getAttribute('data-tab-select')));
    });
    bar.querySelectorAll('[data-tab-close]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        close(btn.getAttribute('data-tab-close'));
      });
    });
  }

  function openOrFocus(key, label) {
    const k = String(key || '');
    if (!k) return;

    if (!enabled) {
      remount(k);
      return;
    }

    const lab = label || labelFor(k);
    const existing = tabs.find((t) => t.key === k);
    if (!existing) tabs.push({ key: k, label: lab });
    else existing.label = lab;

    activeKey = k;
    renderBar();
    remount(k);
  }

  function activate(key) {
    if (!enabled) return;
    const k = String(key || '');
    if (!tabs.some((t) => t.key === k)) return;
    if (activeKey === k) return;
    activeKey = k;
    renderBar();
    remount(k);
  }

  function close(key) {
    if (!enabled) return;
    const k = String(key || '');
    const idx = tabs.findIndex((t) => t.key === k);
    if (idx === -1) return;

    tabs.splice(idx, 1);

    if (!tabs.length) {
      activeKey = '';
      renderBar();
      openOrFocus('inicio', labelFor('inicio'));
      return;
    }

    if (activeKey === k) {
      const next = tabs[idx] || tabs[idx - 1] || tabs[0];
      activeKey = next.key;
      renderBar();
      remount(activeKey);
    } else {
      renderBar();
    }
  }

  function setEnabled(on) {
    const next = !!on;
    if (next === enabled) {
      renderBar();
      return;
    }
    enabled = next;
    if (!enabled) {
      tabs = [];
      activeKey = '';
      renderBar();
      return;
    }
    const cur =
      typeof F !== 'undefined' && typeof F.getActiveMenuKey === 'function'
        ? F.getActiveMenuKey()
        : '';
    if (cur) {
      tabs = [{ key: cur, label: labelFor(cur) }];
      activeKey = cur;
    }
    renderBar();
  }

  function isEnabled() {
    return enabled;
  }

  function reset() {
    enabled = false;
    tabs = [];
    activeKey = '';
    renderBar();
  }

  async function refreshEnabled() {
    try {
      const data = await F.fetchJson(
        `/api/config/sino?opcion=${encodeURIComponent(OPCION)}&_=${Date.now()}`,
        { cache: 'no-store' }
      );
      setEnabled(normalizeSino(data?.sino) === 'SI');
    } catch (_) {
      setEnabled(false);
    }
  }

  function init(opts) {
    mountFn = typeof opts?.mount === 'function' ? opts.mount : null;
    getLabelFn = typeof opts?.getLabel === 'function' ? opts.getLabel : null;
    ensureBar();
  }

  global.ViewTabs = {
    OPCION,
    init,
    isEnabled,
    setEnabled,
    refreshEnabled,
    openOrFocus,
    activate,
    close,
    reset,
    normalizeSino,
  };
})(typeof window !== 'undefined' ? window : globalThis);
