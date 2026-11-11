/**
 * CRM — Visitas a clientes y prospectos (estructura inicial).
 */
const CrmVisitasView = {
  _container: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderScreen() {
    return `
      <div class="catalogo-vista-wrap w-100 crm-vista-wrap">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
          <h2 class="h5 mb-0 fw-semibold">
            <i class="fa-solid fa-route me-2 text-muted" aria-hidden="true"></i>Visitas
          </h2>
        </div>
        <div class="alert alert-info py-2 small mb-3">
          <i class="fa-solid fa-circle-info me-1" aria-hidden="true"></i>
          Registro de visitas a <strong>clientes</strong> y <strong>prospectos</strong>. Próximamente podrá planificar rutas,
          registrar resultados y vincular oportunidades.
        </div>
        <div class="card shadow-sm">
          <div class="card-body text-center text-muted py-5">
            <i class="fa-solid fa-map-location-dot fa-2x mb-2 opacity-50" aria-hidden="true"></i>
            <p class="mb-0 small">Sin visitas registradas. Esta vista se ampliará en siguientes versiones.</p>
          </div>
        </div>
      </div>`;
  },

  load(container) {
    this._container = container;
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-2', 'p-md-3');
    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }
    container.innerHTML = this.renderScreen();
  },
};
