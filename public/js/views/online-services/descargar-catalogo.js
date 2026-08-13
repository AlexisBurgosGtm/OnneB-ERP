/**
 * Online Services → Descargar catálogo desde la nube (COMMUNITY_*).
 * Solo empresa SUCURSAL (CODTIPOEMPRESA = 2).
 */
const DescargarCatalogoView = {
  _container: null,
  _loading: false,
  _downloading: false,
  _preview: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  apiUrl(path) {
    const empnit = encodeURIComponent(F.getEmpNit() || '');
    const sep = path.includes('?') ? '&' : '?';
    return `/api/community${path}${sep}empnit=${empnit}&_=${Date.now()}`;
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

  renderLoadingHtml() {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Descargar Catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services · nube comunitaria</p>
        </div>
        <div class="text-center text-muted py-5">
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Leyendo catálogo en la nube…
        </div>
      </div>`;
  },

  renderErrorHtml(message) {
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Descargar Catálogo</h2>
          <p class="pos-list-sub text-muted mb-0">Online Services · nube comunitaria</p>
        </div>
        <div class="alert alert-danger mb-3">${this.escapeHtml(message || 'Error al leer la nube')}</div>
        <button type="button" class="btn btn-outline-primary btn-sm" id="os-descargar-catalogo-reload">
          <i class="fa-solid fa-rotate me-1"></i>Reintentar
        </button>
      </div>`;
  },

  renderMasterTable(key, emptyLabel) {
    const rows = this._preview?.[key] || [];
    if (!rows.length) {
      return `<p class="text-muted small mb-0 py-3 text-center">${this.escapeHtml(emptyLabel)}</p>`;
    }
    const body = rows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.CODIGO)}</td>
        <td>${this.escapeHtml(r.NOMBRE || '—')}</td>
      </tr>`
      )
      .join('');
    return `
      <div class="table-responsive" style="max-height:180px">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr><th>Código</th><th>Nombre</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  renderProductosTable() {
    const rows = this._preview?.productos || [];
    if (!rows.length) {
      return '<p class="text-muted small mb-0 py-3 text-center">No hay productos en la nube</p>';
    }
    const body = rows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.CODPROD)}</td>
        <td>${this.escapeHtml(r.DESPROD || '—')}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.COSTO))}</td>
        <td>${this.escapeHtml(r.HABILITADO || '—')}</td>
      </tr>`
      )
      .join('');
    return `
      <div class="table-responsive" style="max-height:280px">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Código</th><th>Descripción</th><th class="text-end">Costo</th><th>Hab.</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  renderPreciosTable() {
    const rows = this._preview?.precios || [];
    if (!rows.length) {
      return '<p class="text-muted small mb-0 py-3 text-center">No hay precios en la nube</p>';
    }
    const body = rows
      .map(
        (r) => `
      <tr>
        <td>${this.escapeHtml(r.CODPROD)}</td>
        <td>${this.escapeHtml(r.CODMEDIDA || '—')}</td>
        <td class="text-end">${this.escapeHtml(String(r.EQUIVALE ?? '—'))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.COSTO))}</td>
        <td class="text-end">${this.escapeHtml(this.formatMoney(r.PRECIO))}</td>
      </tr>`
      )
      .join('');
    return `
      <div class="table-responsive" style="max-height:280px">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th>Código</th><th>Medida</th><th class="text-end">Equiv.</th>
              <th class="text-end">Costo</th><th class="text-end">Precio</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  },

  renderHtml() {
    const t = this._preview?.totales || {};
    const nProd = Number(t.productos) || 0;
    const nPre = Number(t.precios) || 0;
    const nMar = Number(t.marcas) || 0;
    const nMed = Number(t.medidas) || 0;
    const nCla = Number(t.clasificacionuno) || 0;
    const nProv = Number(t.proveedores) || 0;
    return `
      <div class="pos-list-wrap descargar-catalogo-view">
        <div class="pos-list-header d-flex flex-wrap justify-content-between align-items-start gap-2">
          <div>
            <h2 class="pos-list-title">Descargar Catálogo</h2>
            <p class="pos-list-sub text-muted mb-0">
              Nube comunitaria · <code>EMPNIT = GENERAL</code> ·
              ${nMar} marcas · ${nMed} medidas · ${nCla} clasif.1 · ${nProv} prov. ·
              ${nProd} producto(s) · ${nPre} precio(s)
            </p>
          </div>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="os-descargar-catalogo-reload">
              <i class="fa-solid fa-rotate me-1"></i>Actualizar listado
            </button>
            <button type="button" class="btn btn-primary btn-sm" id="os-descargar-catalogo-btn"
              ${nProd ? '' : 'disabled'}>
              <i class="fa-solid fa-cloud-arrow-down me-1"></i>Descargar catálogo
            </button>
          </div>
        </div>

        <div class="alert alert-warning border small mt-3">
          Al confirmar se reemplazarán en esta empresa
          <code>${this.escapeHtml(F.getEmpNit() || '')}</code>:
          <strong>productos, precios, inventarios, marcas, medidas, clasificación 1 y proveedores</strong>
          (proveedores vienen de <code>COMMUNITY_CLASIFICACIONTRES</code>).
          Luego se recrearán los <strong>INVSALDO en cero</strong>.
        </div>

        <div class="row g-3 mt-1">
          <div class="col-md-6 col-xl-3">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Marcas (${nMar})</div>
              <div class="card-body p-0">${this.renderMasterTable('marcas', 'Sin marcas')}</div>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Medidas (${nMed})</div>
              <div class="card-body p-0">${this.renderMasterTable('medidas', 'Sin medidas')}</div>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Clasificación 1 (${nCla})</div>
              <div class="card-body p-0">${this.renderMasterTable('clasificacionuno', 'Sin clasificación 1')}</div>
            </div>
          </div>
          <div class="col-md-6 col-xl-3">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Proveedores (${nProv})</div>
              <div class="card-body p-0">${this.renderMasterTable('proveedores', 'Sin proveedores')}</div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Productos en la nube (${nProd})</div>
              <div class="card-body p-0">${this.renderProductosTable()}</div>
            </div>
          </div>
          <div class="col-lg-6">
            <div class="card shadow-sm h-100">
              <div class="card-header py-2 fw-semibold">Precios en la nube (${nPre})</div>
              <div class="card-body p-0">${this.renderPreciosTable()}</div>
            </div>
          </div>
        </div>
      </div>`;
  },

  bindEvents() {
    this._container
      ?.querySelector('#os-descargar-catalogo-reload')
      ?.addEventListener('click', () => {
        this.reload().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
    this._container
      ?.querySelector('#os-descargar-catalogo-btn')
      ?.addEventListener('click', () => {
        this.onDescargar().catch((err) => F.toast(err.message || 'Error', 'error'));
      });
  },

  async fetchPreview() {
    return F.fetchJson(this.apiUrl('/catalogo/preview'), { cache: 'no-store' });
  },

  async reload() {
    if (this._loading || this._downloading) return;
    this._loading = true;
    this._container.innerHTML = this.renderLoadingHtml();
    try {
      await F.fetchJson(`/api/community/token-status?_=${Date.now()}`, { cache: 'no-store' });
      this._preview = await this.fetchPreview();
      this._container.innerHTML = this.renderHtml();
      this.bindEvents();
    } catch (err) {
      this._preview = null;
      this._container.innerHTML = this.renderErrorHtml(err.message);
      this.bindEvents();
    } finally {
      this._loading = false;
    }
  },

  async onDescargar() {
    if (this._downloading || this._loading) return;
    if (!F.isEmpresaSucursal()) {
      F.toast('Solo la empresa SUCURSAL puede descargar el catálogo', 'warning');
      return;
    }
    const t = this._preview?.totales || {};
    const nProd = Number(t.productos) || 0;
    const nPre = Number(t.precios) || 0;
    const nMar = Number(t.marcas) || 0;
    const nMed = Number(t.medidas) || 0;
    const nCla = Number(t.clasificacionuno) || 0;
    const nProv = Number(t.proveedores) || 0;
    if (!nProd) {
      F.toast('No hay productos en la nube para descargar', 'warning');
      return;
    }

    const ok = await CatalogosUI.fireConfirm({
      title: '¿Descargar catálogo?',
      html: `<p class="mb-2 text-start">Se reemplazarán maestros y catálogo de
        <code>${this.escapeHtml(F.getEmpNit() || '')}</code>:</p>
        <ul class="text-start small mb-2">
          <li>${nMar} marcas · ${nMed} medidas · ${nCla} clasif.1 · ${nProv} proveedores</li>
          <li>${nProd} productos · ${nPre} precios</li>
        </ul>
        <p class="mb-0 text-start small text-muted">INVSALDO se recreará en cero para cada producto.</p>`,
      icon: 'warning',
      confirmText: 'Descargar',
      confirmClass: 'btn-modal-guardar',
    });
    if (!ok) return;

    const btn = this._container?.querySelector('#os-descargar-catalogo-btn');
    this._downloading = true;
    if (btn) btn.disabled = true;

    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Descargando catálogo…',
      html: '<p class="small text-muted mb-0">Reemplazando maestros, productos/precios e inventarios. Puede tardar.</p>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const data = await F.fetchJson(this.apiUrl('/catalogo/descargar'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      Swal.close();
      const ins = data.insertados || {};
      const inv = data.invsaldo || {};
      F.toast(
        `Catálogo descargado: ${ins.marcas ?? 0} marcas, ${ins.medidas ?? 0} medidas, ${ins.clasificacionuno ?? 0} clasif.1, ${ins.proveedores ?? 0} prov., ${ins.productos ?? 0} prod., ${ins.precios ?? 0} precios. INVSALDO +${inv.creadosEnCero ?? 0}`,
        'success'
      );
      await this.reload();
    } catch (err) {
      Swal.close();
      F.toast(err.message || 'Error al descargar catálogo', 'error');
    } finally {
      this._downloading = false;
      if (btn) btn.disabled = false;
    }
  },

  async load(container) {
    this._container = container;
    this._preview = null;
    this._loading = false;
    this._downloading = false;
    await F.ensureCodTipoEmpresa();
    if (!F.isEmpresaSucursal()) {
      this._container.innerHTML = this.renderBlockedHtml();
      return;
    }
    await this.reload();
  },
};
