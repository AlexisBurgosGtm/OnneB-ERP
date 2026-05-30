/**
 * PWA — registro de manifest (service worker / caché desactivado en desarrollo)
 */
(function registerPwa() {
  /* --- Caché y Service Worker (desactivado para desarrollo fluido) ---
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[PWA] Service Worker registrado:', reg.scope);
      })
      .catch((err) => console.warn('[PWA] Error SW:', err));
  });
  --- fin caché SW --- */

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((reg) => reg.unregister());
    });
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
    }
  }

  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.OnnebInstallPrompt = deferredPrompt;
  });

  window.promptInstall = async function promptInstall() {
    if (!deferredPrompt) {
      F.toast('La app ya está instalada o el navegador no permite instalación', 'info');
      return false;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  };
})();
