/**
 * Login — escena parallax (demo wagerfield/parallax), solo en pantalla de login.
 * Librería: /vendor/parallax/parallax.min.js (local, sin CDN).
 */
(function loginParallax() {
  'use strict';

  const SCENE_ID = 'login-parallax-scene';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  let instance = null;
  let resizeHandler = null;
  let mounted = false;

  function getView() {
    return document.getElementById('view-login');
  }

  function getScene() {
    return document.getElementById(SCENE_ID);
  }

  function resizeScene() {
    const scene = getScene();
    const view = getView();
    if (!scene || !view) return;
    const rect = view.getBoundingClientRect();
    scene.style.width = `${Math.round(rect.width)}px`;
    scene.style.height = `${Math.round(rect.height)}px`;
  }

  function destroyInstance() {
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (instance && typeof instance.destroy === 'function') {
      try {
        instance.destroy();
      } catch (_) {
        /* ignore */
      }
    }
    instance = null;
  }

  function startParallax() {
    if (REDUCED.matches || instance) return;
    const scene = getScene();
    if (!scene || typeof Parallax === 'undefined') {
      console.warn('[LoginParallax] Parallax no disponible (vendor local).');
      return;
    }

    resizeScene();
    resizeHandler = () => resizeScene();
    window.addEventListener('resize', resizeHandler, { passive: true });

    instance = new Parallax(scene, {
      frictionX: 0.1,
      frictionY: 0.1,
      scalarX: 25,
      scalarY: 15,
    });
  }

  function mount() {
    const view = getView();
    if (!view || mounted) return;
    mounted = true;
    view.classList.add('login-parallax-active');

    if (REDUCED.matches) return;
    startParallax();
  }

  function unmount() {
    mounted = false;
    destroyInstance();
    getView()?.classList.remove('login-parallax-active');
  }

  window.LoginParallax = { mount, unmount };
})();
