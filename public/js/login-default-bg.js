/**
 * Estilo login «Default» (setting TEMA): imagen de fondo a pantalla completa.
 * Solo en este navegador/dispositivo (localStorage); no se sincroniza con el servidor.
 */
(function loginDefaultBgModule() {
  'use strict';

  const STORAGE_KEY = 'onneb-login-default-bg-v1';
  const MAX_BYTES = 900000;
  const MAX_DIM = 1920;

  function getView() {
    return document.getElementById('view-login');
  }

  function getLayer() {
    return document.getElementById('login-custom-bg');
  }

  function getBtn() {
    return document.getElementById('btn-login-custom-bg');
  }

  function getFileInput() {
    return document.getElementById('login-custom-bg-file');
  }

  function readStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw && String(raw).startsWith('data:image/') ? raw : '';
    } catch {
      return '';
    }
  }

  function writeStored(dataUrl) {
    try {
      if (!dataUrl) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, dataUrl);
    } catch (err) {
      console.warn('[LoginDefaultBg] No se pudo guardar el fondo:', err?.message || err);
    }
  }

  function applyToLayer(dataUrl) {
    const view = getView();
    const layer = getLayer();
    if (!view || !layer) return;
    if (dataUrl) {
      layer.style.backgroundImage = `url(${JSON.stringify(dataUrl)})`;
      layer.hidden = false;
      layer.removeAttribute('aria-hidden');
      view.classList.add('login-custom-bg-active');
    } else {
      layer.style.backgroundImage = '';
      layer.hidden = true;
      layer.setAttribute('aria-hidden', 'true');
      view.classList.remove('login-custom-bg-active');
    }
  }

  function isUiDefaultLoginActive() {
    return getView()?.classList.contains('login-style-tema');
  }

  function restoreFromStorage() {
    if (!isUiDefaultLoginActive()) return;
    applyToLayer(readStored());
  }

  function syncButtonVisibility(active) {
    const btn = getBtn();
    const file = getFileInput();
    if (!btn) return;
    if (active) {
      btn.hidden = false;
      btn.removeAttribute('aria-hidden');
    } else {
      btn.hidden = true;
      btn.setAttribute('aria-hidden', 'true');
    }
    if (file && !active) file.value = '';
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
      reader.readAsDataURL(file);
    });
  }

  function optimizeDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          reject(new Error('Imagen inválida'));
          return;
        }
        const scale = Math.min(1, MAX_DIM / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.88;
        let out = canvas.toDataURL('image/jpeg', quality);
        while (out.length > MAX_BYTES && quality > 0.45) {
          quality -= 0.08;
          out = canvas.toDataURL('image/jpeg', quality);
        }
        if (out.length > MAX_BYTES) {
          reject(new Error('La imagen es demasiado grande; use un archivo más pequeño'));
          return;
        }
        resolve(out);
      };
      img.onerror = () => reject(new Error('No se pudo procesar la imagen'));
      img.src = dataUrl;
    });
  }

  async function onFileSelected(file) {
    if (!file || !/^image\//i.test(file.type)) {
      if (typeof F !== 'undefined' && F.toast) F.toast('Seleccione un archivo de imagen', 'warning');
      return;
    }
    try {
      const raw = await fileToDataUrl(file);
      const optimized = await optimizeDataUrl(raw);
      writeStored(optimized);
      applyToLayer(optimized);
      if (typeof F !== 'undefined' && F.toast) F.toast('Fondo de login actualizado', 'success');
    } catch (err) {
      const msg = err?.message || 'No se pudo usar la imagen';
      if (typeof F !== 'undefined' && F.toast) F.toast(msg, 'error');
      else console.warn('[LoginDefaultBg]', msg);
    }
  }

  function clearBackground() {
    writeStored('');
    applyToLayer('');
    if (typeof F !== 'undefined' && F.toast) F.toast('Fondo predeterminado restaurado', 'info');
  }

  let wired = false;

  function wireUi() {
    if (wired) return;
    wired = true;
    const btn = getBtn();
    const file = getFileInput();
    btn?.addEventListener('click', (e) => {
      if (e.shiftKey && getView()?.classList.contains('login-custom-bg-active')) {
        clearBackground();
        return;
      }
      file?.click();
    });
    file?.addEventListener('change', () => {
      const picked = file.files?.[0];
      file.value = '';
      if (picked) onFileSelected(picked);
    });
  }

  function onDefaultThemeActive() {
    wireUi();
    syncButtonVisibility(true);
    restoreFromStorage();
  }

  function onDefaultThemeInactive() {
    syncButtonVisibility(false);
    const layer = getLayer();
    const view = getView();
    if (layer) {
      layer.hidden = true;
      layer.setAttribute('aria-hidden', 'true');
    }
    view?.classList.remove('login-custom-bg-active');
  }

  window.LoginDefaultBg = {
    onDefaultThemeActive,
    onDefaultThemeInactive,
    restoreFromStorage,
    clearBackground,
  };
})();