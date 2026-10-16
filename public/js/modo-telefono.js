/**
 * Modo Teléfono — vista simplificada del ERP en dispositivos móviles (post-login).
 */
const ModoTelefono = {
  _active: false,

  isNonPcDevice() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    const narrow = window.matchMedia('(max-width: 991.98px)').matches;
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    return (coarse && noHover) || (narrow && uaMobile);
  },

  isAdministrator(session) {
    const s = session || F.session('user') || {};
    return Boolean(s.superUser || Number(s.codtipoempleado) === 1);
  },

  init() {
    const btn = document.getElementById('btn-modo-telefono');
    const exitBtn = document.getElementById('btn-modo-telefono-exit');
    btn?.addEventListener('click', () => this.enter());
    exitBtn?.addEventListener('click', () => this.exit());
    this.syncEntryButton();
    window.matchMedia('(max-width: 991.98px)').addEventListener('change', () => this.syncEntryButton());
    window.matchMedia('(pointer: coarse)').addEventListener('change', () => this.syncEntryButton());
  },

  afterLogin() {
    this.syncEntryButton();
  },

  syncEntryButton() {
    const btn = document.getElementById('btn-modo-telefono');
    const main = document.getElementById('view-main');
    const loggedIn = main?.classList.contains('view-active');
    if (!btn) return;
    const show = loggedIn && this.isNonPcDevice() && !this._active;
    btn.hidden = !show;
  },

  async enter() {
    if (!this.isNonPcDevice()) return;
    this._active = true;
    document.body.classList.add('modo-telefono-active');
    const shell = document.getElementById('modo-telefono-shell');
    shell?.removeAttribute('hidden');
    this.syncEntryButton();
    await this.refreshReports().catch(() => {});
  },

  exit() {
    this._active = false;
    document.body.classList.remove('modo-telefono-active');
    document.getElementById('modo-telefono-shell')?.setAttribute('hidden', '');
    this.syncEntryButton();
  },

  async refreshReports() {
    const section = document.getElementById('modo-telefono-reports');
    const grid = document.getElementById('modo-telefono-reports-grid');
    const empty = document.getElementById('modo-telefono-no-reports');
    const isAdmin = this.isAdministrator();
    if (section) section.hidden = !isAdmin;
    if (!isAdmin || typeof CompanionVoiceReports === 'undefined') return;

    const empnit = F.getEmpNit();
    if (!empnit) {
      CompanionVoiceReports.renderGrid(grid, empty, [], () => {});
      return;
    }
    const reports = await CompanionVoiceReports.loadCatalog(empnit);
    CompanionVoiceReports.renderGrid(grid, empty, reports, (r, btn) => {
      this.playReport(r, btn).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async playReport(report, btn) {
    if (!this.isAdministrator()) {
      F.toast('Reportes de voz solo para administrador', 'warning');
      return;
    }
    const codigo = report?.codigo;
    const empnit = F.getEmpNit();
    if (!codigo || !empnit) return;
    btn?.classList.add('is-loading');
    try {
      const msg = await CompanionVoiceReports.fetchMensajeErp(codigo, empnit);
      CompanionVoiceReports.speakText(msg);
    } finally {
      btn?.classList.remove('is-loading');
    }
  },
};

document.addEventListener('DOMContentLoaded', () => {
  if (typeof F !== 'undefined') ModoTelefono.init();
});
