/**
 * Anuncio de hora en voz alta — una vez cada hora en punto (solo con sesión activa).
 */
(function hourlyVoiceModule() {
  'use strict';

  const SETTING_OPCION = 'DICE LA HORA EN VOZ ALTA';
  const STORAGE_PREFIX = 'onneb-hour-voice-';
  let timerId = null;
  let enabled = false;

  function speak(text) {
    const msg = String(text || '').trim();
    if (!msg) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(msg);
      utter.lang = 'es-GT';
      utter.rate = 0.92;
      window.speechSynthesis.speak(utter);
      return;
    }
    if (typeof F !== 'undefined' && typeof F.toast === 'function') {
      F.toast(msg, 'info');
    }
  }

  function hourPhrase(date) {
    const h = date.getHours();
    if (h === 1 || h === 13) return 'Son la una en punto';
    if (h === 0) return 'Son las doce en punto';
    if (h === 12) return 'Son las doce del día en punto';
    return `Son las ${h} horas en punto`;
  }

  function storageKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    return `${STORAGE_PREFIX}${y}-${m}-${d}-${h}`;
  }

  function alreadyAnnounced(date) {
    try {
      return sessionStorage.getItem(storageKey(date)) === '1';
    } catch {
      return false;
    }
  }

  function markAnnounced(date) {
    try {
      sessionStorage.setItem(storageKey(date), '1');
    } catch {
      /* ignore */
    }
  }

  function msUntilNextHour(from) {
    const next = new Date(from);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return Math.max(500, next.getTime() - from.getTime());
  }

  function clearTimer() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function tick() {
    if (!enabled) return;
    const now = new Date();
    if (now.getMinutes() === 0 && now.getSeconds() < 5 && !alreadyAnnounced(now)) {
      markAnnounced(now);
      speak(hourPhrase(now));
    }
    timerId = window.setTimeout(tick, msUntilNextHour(new Date()));
  }

  async function fetchEnabled() {
    if (typeof F === 'undefined' || !F.session('user')) return false;
    try {
      const q = `opcion=${encodeURIComponent(SETTING_OPCION)}&_=${Date.now()}`;
      const data = await F.fetchJson(`/api/config/sino?${q}`, { cache: 'no-store' });
      return String(data?.sino || 'NO').trim().toUpperCase() === 'SI';
    } catch {
      return false;
    }
  }

  async function syncFromServer() {
    enabled = await fetchEnabled();
    clearTimer();
    if (enabled && F.session('user')) {
      const now = new Date();
      if (now.getMinutes() === 0 && !alreadyAnnounced(now)) {
        markAnnounced(now);
        speak(hourPhrase(now));
      }
      timerId = window.setTimeout(tick, msUntilNextHour(now));
    }
  }

  function stop() {
    enabled = false;
    clearTimer();
  }

  function startAfterLogin() {
    syncFromServer().catch(() => stop());
  }

  function onSettingChanged(opcion, sino) {
    if (opcion !== SETTING_OPCION) return;
    if (!F.session('user')) return;
    enabled = String(sino || 'NO').trim().toUpperCase() === 'SI';
    clearTimer();
    if (enabled) {
      timerId = window.setTimeout(tick, msUntilNextHour(new Date()));
    }
  }

  window.HourlyVoice = {
    startAfterLogin,
    stop,
    syncFromServer,
    onSettingChanged,
    SETTING_OPCION,
  };
})();
