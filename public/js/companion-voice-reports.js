/**
 * Reportes por voz (consultas externas) — Modo Teléfono.
 */
const CompanionVoiceReports = {
  REPORT_ICONS: {
    VENTADIA: 'fa-cash-register',
    VENTAMES: 'fa-calendar-days',
    CUENTAPAGAR: 'fa-file-invoice-dollar',
    CUENTACOBRAR: 'fa-hand-holding-dollar',
    INVENTCOSTO: 'fa-boxes-stacked',
  },

  escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  },

  reportIcon(codigo) {
    const key = String(codigo || '').toUpperCase();
    return this.REPORT_ICONS[key] || 'fa-chart-line';
  },

  speakText(text) {
    if (!('speechSynthesis' in window)) {
      alert(text);
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(String(text || '').trim());
    utter.lang = 'es-GT';
    utter.rate = 0.95;
    window.speechSynthesis.speak(utter);
  },

  async loadCatalog(empnit) {
    const params = new URLSearchParams({ empnit, _: String(Date.now()) });
    const data = await F.fetchJson(`/api/consultas-externas/catalog?${params.toString()}`);
    return (data.reports || []).filter((r) => r.implementado);
  },

  renderGrid(gridEl, emptyEl, reports, onPlay) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const items = reports || [];
    if (!items.length) {
      emptyEl?.removeAttribute('hidden');
      return;
    }
    emptyEl?.setAttribute('hidden', '');
    for (const r of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'companion-report-btn';
      btn.dataset.codigo = r.codigo;
      btn.innerHTML = `
        <span class="companion-report-icon"><i class="fa-solid ${this.reportIcon(r.codigo)}" aria-hidden="true"></i></span>
        <span class="companion-report-label">${this.escapeHtml(r.nombre || r.codigo)}</span>`;
      btn.addEventListener('click', () => onPlay(r, btn));
      gridEl.appendChild(btn);
    }
  },

  async fetchMensajeErp(codigo, empnit) {
    const params = new URLSearchParams({
      empnit,
      ventadia: codigo,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/consultas-externas/mensaje?${params.toString()}`);
    return data.mensaje || 'Sin datos';
  },

  async fetchMensajeRc(codigo, token) {
    const params = new URLSearchParams({
      t: token,
      ventadia: codigo,
      _: String(Date.now()),
    });
    const data = await F.fetchJson(`/api/remote-companion/report-mensaje?${params.toString()}`);
    return data.mensaje || 'Sin datos';
  },
};
