/**
 * Pace.js — barra de carga y porcentaje visible.
 * Opciones en index.html (antes de pace.min.js): sin trackWebSockets ni /socket.io
 * para que un reinicio del servidor no muestre el overlay de “Cargando”.
 */
(function initPace() {
  const overlay = document.createElement('div');
  overlay.id = 'onneb-pace-overlay';
  overlay.className = 'onneb-pace-overlay';
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-busy', 'false');
  overlay.innerHTML = `
    <div class="onneb-pace-ring" role="presentation"></div>
    <div class="onneb-pace-percent" id="onneb-pace-percent">0%</div>
    <span class="onneb-pace-label">Cargando</span>
  `;

  function setPercent(value) {
    const el = document.getElementById('onneb-pace-percent');
    if (!el) return;
    const n = Math.min(100, Math.max(0, Math.floor(Number(value) || 0)));
    el.textContent = `${n}%`;
  }

  function showOverlay() {
    overlay.classList.add('is-active');
    overlay.setAttribute('aria-busy', 'true');
  }

  function hideOverlay() {
    overlay.classList.remove('is-active');
    overlay.setAttribute('aria-busy', 'false');
  }

  function stopAll() {
    if (typeof Pace !== 'undefined') {
      try {
        Pace.stop();
      } catch (_) {
        /* ignore */
      }
    }
    hideOverlay();
    setPercent(0);
  }

  function bindPaceEvents() {
    if (typeof Pace === 'undefined') {
      console.warn('[Pace] No cargado');
      return;
    }

    Pace.on('start', () => {
      showOverlay();
      setPercent(0);
    });

    Pace.on('progress', (progress) => {
      setPercent(progress);
    });

    Pace.on('done', () => {
      setPercent(100);
      setTimeout(hideOverlay, 320);
    });

    if (Pace.running) {
      showOverlay();
      setPercent(Pace.bar?.progress ?? 0);
    }
  }

  function mountOverlay() {
    if (!overlay.parentNode) {
      document.body.appendChild(overlay);
    }
    bindPaceEvents();
  }

  if (document.body) {
    mountOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', mountOverlay);
  }

  window.OnnebPace = {
    start() {
      if (typeof Pace !== 'undefined') Pace.restart();
    },
    stop() {
      stopAll();
    },
  };
})();
