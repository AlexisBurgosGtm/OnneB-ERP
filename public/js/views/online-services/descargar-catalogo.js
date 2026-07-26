/**
 * Online Services → Descargar catálogo (placeholder).
 * Solo empresa SUCURSAL (CODTIPOEMPRESA = 2).
 */
const DescargarCatalogoView = {
  _container: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  renderBlockedHtml() {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Descargar Catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services</p>
        </div>
        <div class="alert alert-warning mb-0">
          Solo las empresas <strong>SUCURSAL</strong> pueden descargar el catálogo.
          La empresa principal debe usar <strong>Subir catálogo</strong>.
        </div>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Descargar Catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services</p>
        </div>
        <div class="alert alert-light border mb-0">
          <i class="fa-solid fa-cloud-arrow-down me-2 text-muted" aria-hidden="true"></i>
          Esta función estará disponible próximamente.
        </div>
      </div>`;
  },

  async load(container) {
    this._container = container;
    await F.ensureCodTipoEmpresa();
    if (!F.isEmpresaSucursal()) {
      this._container.innerHTML = this.renderBlockedHtml();
      return;
    }
    this._container.innerHTML = this.renderHtml();
  },
};
