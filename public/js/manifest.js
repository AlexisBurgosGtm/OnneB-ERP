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

  function showBannerIfReady() {
    if (isStandalone() || isDismissed() || !deferredPrompt) return;
    const el = document.getElementById('onneb-pwa-install-banner');
    if (el) el.hidden = false;
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
        F.toast('Use el menú del navegador para instalar o abra en Chrome/Edge', 'info');
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

  function bindBannerUi() {
    const banner = document.getElementById('onneb-pwa-install-banner');
    const btnInstall = document.getElementById('onneb-pwa-install-btn');
    const btnClose = document.getElementById('onneb-pwa-install-close');
    btnInstall?.addEventListener('click', () => {
      window.promptInstall().catch(() => {});
    });
    btnClose?.addEventListener('click', () => dismissBanner());
    showBannerIfReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBannerUi);
  } else {
    bindBannerUi();
  }
})();
