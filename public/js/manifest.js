/**
 * PWA — instalación como app + banner flotante
 */
(function registerPwa() {
  const DISMISS_KEY = 'onneb-pwa-install-dismissed';

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    });
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  }

  let deferredPrompt = null;

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isDismissed() {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }

  function dismissBanner() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch (_) {
      /* ignore */
    }
    const el = document.getElementById('onneb-pwa-install-banner');
    if (el) el.hidden = true;
  }

  /** Instalaciones típicas: localhost / LAN por HTTP (aunque no haya beforeinstallprompt). */
  function isLocalInstallContext() {
    const host = String(window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    return window.location.protocol === 'http:';
  }

  function syncBannerChromeTip() {
    const tip = document.getElementById('onneb-pwa-http-tip');
    const originEl = document.getElementById('onneb-pwa-origin-example');
    if (originEl) originEl.textContent = window.location.origin || 'http://localhost:6500';
    if (tip) tip.hidden = false;
    bindChromeFlagLink();
  }

  function syncInstallButtonState() {
    const btnInstall = document.getElementById('onneb-pwa-install-btn');
    if (!btnInstall) return;
    const canPrompt = Boolean(deferredPrompt);
    btnInstall.disabled = !canPrompt;
    btnInstall.title = canPrompt
      ? 'Instalar OnneB PLUS como aplicación'
      : 'Use el menú del navegador (Instalar aplicación) si no aparece el diálogo';
  }

  function showBannerIfReady() {
    if (isStandalone() || isDismissed()) return;
    const showForInstall = Boolean(deferredPrompt);
    const showForLocalHelp = isLocalInstallContext();
    if (!showForInstall && !showForLocalHelp) return;
    const el = document.getElementById('onneb-pwa-install-banner');
    if (!el) return;
    el.hidden = false;
    syncBannerChromeTip();
    syncInstallButtonState();
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.OnnebInstallPrompt = deferredPrompt;
    showBannerIfReady();
  });

  window.promptInstall = async function promptInstall() {
    if (isStandalone()) {
      if (typeof F !== 'undefined') F.toast('La aplicación ya está instalada', 'info');
      return false;
    }
    if (!deferredPrompt) {
      if (typeof F !== 'undefined') {
        F.toast('Use el menú del navegador → Instalar aplicación (Chrome/Edge)', 'info');
      }
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    window.OnnebInstallPrompt = null;
    dismissBanner();
    return outcome === 'accepted';
  };

  const CHROME_INSECURE_FLAG_URL = 'chrome://flags/#unsafely-treat-insecure-origin-as-secure';

  function bindChromeFlagLink() {
    const link = document.getElementById('onneb-pwa-chrome-flag-link');
    if (!link || link.dataset.bound === '1') return;
    link.dataset.bound = '1';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const opened = window.open(CHROME_INSECURE_FLAG_URL, '_blank');
      if (!opened) {
        window.location.assign(CHROME_INSECURE_FLAG_URL);
      }
      if (typeof F !== 'undefined' && typeof F.toast === 'function') {
        F.toast(
          'Si no se abrió, pegue en la barra de Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure',
          'info'
        );
      }
    });
  }

  function bindBannerUi() {
    const btnInstall = document.getElementById('onneb-pwa-install-btn');
    const btnClose = document.getElementById('onneb-pwa-install-close');
    btnInstall?.addEventListener('click', () => {
      window.promptInstall().catch(() => {});
    });
    btnClose?.addEventListener('click', () => dismissBanner());
    showBannerIfReady();
    window.setTimeout(showBannerIfReady, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBannerUi);
  } else {
    bindBannerUi();
  }
})();
