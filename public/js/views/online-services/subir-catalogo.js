/**
 * Online Services → Subir catálogo a la nube (COMMUNITY_*).
 * Solo empresa PRINCIPAL (CODTIPOEMPRESA = 1).
 */
const SubirCatalogoView = {
  _container: null,
  _uploading: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path) {
    const empnit = encodeURIComponent(F.getEmpNit() || '');
    const sep = path.includes('?') ? '&' : '?';
    return `/api/community${path}${sep}empnit=${empnit}`;
  },

  renderBlockedHtml() {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Subir catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services</p>
        </div>
        <div class="alert alert-warning mb-0">
          Solo la empresa <strong>PRINCIPAL</strong> puede subir el catálogo a la nube.
          Las sucursales deben usar <strong>Descargar Catálogo</strong>.
        </div>
      </div>`;
  },

  renderHtml() {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Subir catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services · nube comunitaria</p>
        </div>
        <div class="card border-0 shadow-sm" style="max-width:36rem">
          <div class="card-body">
            <p class="mb-3 text-muted small">
              Se enviarán maestros (<strong>Marcas</strong>, <strong>Medidas</strong>,
              <strong>Clasificación 1</strong>, <strong>Proveedores</strong>→nube Clasificación 3)
              más <strong>PRODUCTOS</strong>, <strong>PRECIOS</strong> e <strong>INVSALDO</strong>
              (inventario en cero) a la nube con <code>EMPNIT = GENERAL</code> y el TOKEN de esta instalación.
            </p>
            <button type="button" class="btn btn-primary" id="os-subir-catalogo-btn">
              <i class="fa-solid fa-cloud-arrow-up me-2" aria-hidden="true"></i>Subir catálogo
            </button>
          </div>
        </div>
      </div>`;
  },

  async checkTokenActivo() {
    const data = await F.fetchJson(`/api/community/token-status?_=${Date.now()}`, {
      cache: 'no-store',
    });
    return data;
  },

  async onSubir() {
    if (this._uploading) return;
    if (!F.isEmpresaPrincipal()) {
      F.toast('Solo la empresa PRINCIPAL puede subir el catálogo', 'warning');
      return;
    }
    const btn = this._container?.querySelector('#os-subir-catalogo-btn');

    try {
      await this.checkTokenActivo();
    } catch (err) {
      F.toast(err.message || 'Su TOKEN no tiene acceso a la nube', 'error');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Subir catálogo a la nube?',
      html: `<p class="mb-0 text-start">Se <strong>eliminarán</strong> primero los registros existentes en la nube
        (marcas, medidas, clasificaciones, productos, precios e inventarios)
        con este TOKEN y <code>EMPNIT = GENERAL</code>, y luego se subirán los datos de la empresa actual
        (proveedores como Clasificación 3; INVSALDO en cero).</p>`,
      icon: 'warning',
      confirmText: 'Subir',
      confirmClass: 'btn-modal-guardar',
    });
    if (!ok) return;

    this._uploading = true;
    if (btn) btn.disabled = true;

    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Subiendo catálogo…',
      html: '<p class="small text-muted mb-0">Eliminando registros previos y subiendo datos. Puede tardar con muchos productos.</p>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const data = await F.fetchJson(this.apiUrl('/catalogo/subir'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      Swal.close();
      const el = data.eliminados || {};
      F.toast(
        `Catálogo actualizado. Subidos: ${data.marcas ?? 0} marcas, ${data.medidas ?? 0} medidas, ${data.clasificacionuno ?? 0} clasif.1, ${data.proveedores ?? 0} prov., ${data.productos ?? 0} productos, ${data.precios ?? 0} precios, ${data.invsaldo ?? 0} saldos (elim. nube prod/pre/inv ${el.productos ?? 0}/${el.precios ?? 0}/${el.invsaldo ?? 0})`,
        'success'
      );
    } catch (err) {
      Swal.close();
      F.toast(err.message || 'Error al subir catálogo', 'error');
    } finally {
      this._uploading = false;
      if (btn) btn.disabled = false;
    }
  },

  bindEvents() {
    this._container
      ?.querySelector('#os-subir-catalogo-btn')
      ?.addEventListener('click', () => {
        this.onSubir().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
  },

  async load(container) {
    this._container = container;
    this._uploading = false;
    await F.ensureCodTipoEmpresa();
    if (!F.isEmpresaPrincipal()) {
      this._container.innerHTML = this.renderBlockedHtml();
      return;
    }
    this._container.innerHTML = this.renderHtml();
    this.bindEvents();
  },
};
