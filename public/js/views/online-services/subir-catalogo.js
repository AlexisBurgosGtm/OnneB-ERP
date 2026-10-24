/**
 * Online Services → Subir catálogo a la nube (COMMUNITY_*).
 * Solo empresa PRINCIPAL (CODTIPOEMPRESA = 1).
 */
const SubirCatalogoView = {
  _container: null,
  _uploading: false,
  _cloudStatus: null,

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

  formatLastSaleLabel(lastSale) {
    if (!lastSale) return '—';
    const s = String(lastSale).trim();
    if (!s) return '—';
    const parts = s.slice(0, 10).split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return s;
  },

  cloudStatCard(title, stat, loading) {
    const count = stat?.count ?? 0;
    const last = this.formatLastSaleLabel(stat?.lastSale);
    const emptyHint =
      !loading && count === 0
        ? '<span class="text-muted">Sin registros con este TOKEN</span>'
        : '';
    return `
      <div class="col-md-6">
        <div class="card h-100 border-0 bg-light">
          <div class="card-body py-3">
            <div class="fw-semibold small text-uppercase text-muted mb-2">${this.escapeHtml(title)}</div>
            ${
              loading
                ? '<span class="small text-muted"><i class="fa-solid fa-spinner fa-spin me-1"></i>Consultando…</span>'
                : `
              <div class="d-flex flex-wrap gap-3 align-items-baseline">
                <div>
                  <span class="display-6 fw-bold lh-1">${this.escapeHtml(String(count))}</span>
                  <span class="small text-muted ms-1">registro(s)</span>
                </div>
                <div class="small">
                  <span class="text-muted">LASTSALE:</span>
                  <strong>${this.escapeHtml(last)}</strong>
                </div>
              </div>
              ${emptyHint ? `<div class="small mt-2">${emptyHint}</div>` : ''}
            `
            }
          </div>
        </div>
      </div>`;
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

  renderCloudStatusHtml(loading = false) {
    const st = this._cloudStatus;
    return `
      <div class="mb-4" id="os-subir-catalogo-status">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
          <h3 class="h6 mb-0">Catálogo en la nube (<code>EMPNIT = GENERAL</code>)</h3>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="os-subir-catalogo-refresh-status"
            ${loading ? 'disabled' : ''} title="Actualizar conteos">
            <i class="fa-solid fa-rotate-right me-1" aria-hidden="true"></i>Actualizar
          </button>
        </div>
        <p class="small text-muted mb-2">
          Registros asociados al <strong>TOKEN</strong> de esta instalación. <code>LASTSALE</code> indica la fecha de la última subida.
        </p>
        <div class="row g-2">
          ${this.cloudStatCard('Productos (COMMUNITY_PRODUCTOS)', st?.productos, loading)}
          ${this.cloudStatCard('Marcas (COMMUNITY_MARCAS)', st?.marcas, loading)}
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
        ${this.renderCloudStatusHtml(true)}
        <div class="card border-0 shadow-sm" style="max-width:42rem">
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

  updateCloudStatusPanel(loading = false) {
    const host = this._container?.querySelector('#os-subir-catalogo-status');
    if (!host) return;
    const outer = host.parentElement;
    if (!outer) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this.renderCloudStatusHtml(loading);
    const next = tmp.firstElementChild;
    if (next) host.replaceWith(next);
    this.bindStatusRefresh();
  },

  async loadCloudStatus() {
    try {
      const data = await F.fetchJson(this.apiUrl('/catalogo/estado-nube'), { cache: 'no-store' });
      this._cloudStatus = {
        productos: data.productos,
        marcas: data.marcas,
      };
      this.updateCloudStatusPanel(false);
    } catch (err) {
      this._cloudStatus = null;
      this.updateCloudStatusPanel(false);
      const host = this._container?.querySelector('#os-subir-catalogo-status');
      if (host) {
        host.insertAdjacentHTML(
          'beforeend',
          `<div class="alert alert-warning small py-2 mt-2 mb-0">${this.escapeHtml(err.message || 'No se pudo leer el estado en la nube')}</div>`
        );
      }
    }
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
      const refFecha = data.catalogLastSale ? ` Referencia nube (LASTSALE): ${data.catalogLastSale}.` : '';
      F.toast(
        `Catálogo actualizado.${refFecha} Subidos: ${data.marcas ?? 0} marcas, ${data.medidas ?? 0} medidas, ${data.clasificacionuno ?? 0} clasif.1, ${data.proveedores ?? 0} prov., ${data.productos ?? 0} productos, ${data.precios ?? 0} precios, ${data.invsaldo ?? 0} saldos (elim. nube prod/pre/inv ${el.productos ?? 0}/${el.precios ?? 0}/${el.invsaldo ?? 0})`,
        'success'
      );
      await this.loadCloudStatus();
    } catch (err) {
      Swal.close();
      F.toast(err.message || 'Error al subir catálogo', 'error');
    } finally {
      this._uploading = false;
      if (btn) btn.disabled = false;
    }
  },

  bindStatusRefresh() {
    this._container
      ?.querySelector('#os-subir-catalogo-refresh-status')
      ?.addEventListener('click', () => {
        this.updateCloudStatusPanel(true);
        this.loadCloudStatus().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
  },

  bindEvents() {
    this._container
      ?.querySelector('#os-subir-catalogo-btn')
      ?.addEventListener('click', () => {
        this.onSubir().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
    this.bindStatusRefresh();
  },

  async load(container) {
    this._container = container;
    this._uploading = false;
    this._cloudStatus = null;
    await F.ensureCodTipoEmpresa();
    if (!F.isEmpresaPrincipal()) {
      this._container.innerHTML = this.renderBlockedHtml();
      return;
    }
    this._container.innerHTML = this.renderHtml();
    this.bindEvents();
    this.loadCloudStatus().catch(() => {
      /* error shown in panel */
    });
  },
};
