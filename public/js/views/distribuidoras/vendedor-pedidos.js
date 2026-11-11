/**
 * Vista Vendedor — pedidos (copia POS, flujo móvil) (DOCUMENTOS + DOCPRODUCTOS).
 */
const VendedorPedidosView = {
  _container: null,
  _config: null,
  _pedido: null,
  _productos: [],
  _pedidosList: [],
  _listFilter: '',
  _selectedCoddoc: '',
  _screen: 'list',
  _loadingProducts: false,
  _searchTimer: null,
  _cartBusy: false,
  _vendedores: [],
  _precioCampo: 'PRECIO',
  /** Temporizador badge “producto agregado” sobre buscador */
  _vpProductoAddBadgeTimer: null,
  /** Lista: tabla | mapa GPS */
  _listViewMode: 'table',
  _vpLeafletMap: null,
  _vpLeafletMarkers: null,

  PRECIO_CAMPO_OPTIONS: [
    { value: 'PRECIO', label: 'PRECIO PUBLICO' },
    { value: 'MAYOREOC', label: 'MAYORISTA C' },
    { value: 'MAYOREOB', label: 'MAYORISTA B' },
    { value: 'MAYOREOA', label: 'MAYORISTA A' },
  ],

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiUrl(path, extraParams = {}) {
    const emp = F.getEmpNit();
    if (!emp) throw new Error('No hay empresa activa');
    const segment = path ? (path.startsWith('/') ? path : `/${path}`) : '';
    const params = new URLSearchParams({ empnit: emp, ...extraParams });
    return `/api/pos${segment}?${params}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatQty(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  },

  formatProdLabel(desprod, desmarca) {
    const name = String(desprod ?? '').trim();
    const marca = String(desmarca ?? '').trim();
    if (!marca) return name;
    return `${name} · ${marca}`;
  },

  renderProdNameHtml(desprod, desmarca) {
    const name = this.escapeHtml(String(desprod ?? '').trim());
    const marca = String(desmarca ?? '').trim();
    if (!marca) return name;
    return `${name} · <strong class="pos-prod-marca">${this.escapeHtml(marca)}</strong>`;
  },

  muestraDesprod2() {
    return String(this._config?.muestraDesprod2 || 'NO').trim().toUpperCase() === 'SI';
  },

  renderDesprod2Html(p) {
    if (!this.muestraDesprod2()) return '';
    const des2 = String(p?.DESPROD2 ?? '').trim();
    if (!des2) return '';
    return `<div class="vp-prod-des2 small text-muted">${this.escapeHtml(des2)}</div>`;
  },

  formatFechaPedido(row) {
    return DocFecha.formatDisplay(row);
  },

  /** Hora para tooltip mapa (HORA:MINUTO del documento). */
  formatPedidoHoraMap(row) {
    const h = Number(row?.HORA);
    const m = Number(row?.MINUTO);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '—';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  },

  parsePedidoLatLng(row) {
    const lat = Number(row?.LAT);
    const lng = Number(row?.LONG);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  },

  pedidosListConGps() {
    return this.filteredPedidosList().filter((r) => this.parsePedidoLatLng(r));
  },

  /**
   * Ubicación actual para guardar al finalizar (best effort).
   * @returns {Promise<{ lat: number, lng: number } | null>}
   */
  ensureCurrentPosition() {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos?.coords?.latitude;
          const lng = pos?.coords?.longitude;
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            resolve(null);
            return;
          }
          resolve({ lat, lng });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  },

  destroyListMap() {
    try {
      this._vpLeafletMap?.remove();
    } catch {
      /* ignore */
    }
    this._vpLeafletMap = null;
    this._vpLeafletMarkers = null;
  },

  renderPedidoMapTooltipHtml(r) {
    const cliente = String(r.DOC_NOMCLIE || r.NEGOCIO || 'Cliente').trim() || 'Cliente';
    const hora = this.formatPedidoHoraMap(r);
    const monto = this.formatMoney(r.TOTALPRECIO);
    const doc = `${r.CODDOC} #${r.CORRELATIVO}`;
    return `<div class="vp-map-popup small">
      <div class="fw-semibold">${this.escapeHtml(cliente)}</div>
      <div class="text-muted">${this.escapeHtml(doc)}</div>
      <div>Hora: ${this.escapeHtml(hora)}</div>
      <div>Total: ${this.escapeHtml(monto)}</div>
    </div>`;
  },

  initListMapIfNeeded() {
    const host = this._container?.querySelector('#vp-pedidos-map-host');
    if (!host || typeof L === 'undefined') {
      if (host && typeof L === 'undefined') {
        host.innerHTML =
          '<div class="alert alert-warning m-2 mb-0 small">No se pudo cargar el mapa. Verifique la conexión.</div>';
      }
      return;
    }
    this.destroyListMap();
    const puntos = this.pedidosListConGps();
    const map = L.map(host, { scrollWheelZoom: true });
    this._vpLeafletMap = map;
    this._vpLeafletMarkers = L.layerGroup().addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    if (!puntos.length) {
      map.setView([14.6349, -90.5069], 6);
      return;
    }
    const bounds = [];
    puntos.forEach((r) => {
      const ll = this.parsePedidoLatLng(r);
      if (!ll) return;
      bounds.push([ll.lat, ll.lng]);
      const m = L.marker([ll.lat, ll.lng]).bindPopup(this.renderPedidoMapTooltipHtml(r), {
        maxWidth: 280,
      });
      m.addTo(this._vpLeafletMarkers);
    });
    if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
    window.setTimeout(() => map.invalidateSize(), 200);
  },

  /** Vista vendedor: sin toast al agregar línea; badge verde discreto sobre el buscador. */
  showProductoAgregadoBadge(message) {
    const text = String(message || '').trim() || 'Agregado';
    window.clearTimeout(this._vpProductoAddBadgeTimer);
    const ids = ['vp-product-added-flash', 'vp-product-added-flash-modal'];
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    els.forEach((el) => {
      el.classList.remove('vp-product-added-flash--show');
      el.textContent = text;
      void el.offsetWidth;
      el.classList.add('vp-product-added-flash--show');
    });
    this._vpProductoAddBadgeTimer = window.setTimeout(() => {
      els.forEach((el) => {
        el.classList.remove('vp-product-added-flash--show');
        el.textContent = '';
      });
      this._vpProductoAddBadgeTimer = null;
    }, 2200);
  },

  /** Lista pedidos: modal de acciones en lugar de botones inline (móvil). */
  isListMobileActions() {
    return window.matchMedia('(max-width: 767.98px)').matches;
  },

  async openListPedidoAccionesModal(row) {
    const coddoc = row.getAttribute('data-coddoc');
    const correlativo = row.getAttribute('data-correlativo');
    if (!coddoc || correlativo == null || correlativo === '') return;
    const docLabel = `${coddoc} #${correlativo}`;
    let accion = null;
    await Swal.fire({
      title: docLabel,
      html: `<div class="row g-2 mt-1 text-center" id="vp-list-acciones-wrap">
          <div class="col-4">
            <button type="button" class="btn btn-light border shadow-sm w-100 py-3 vp-pedido-accion-card" data-vp-accion="editar">
              <i class="fa-solid fa-pen fa-lg text-primary d-block mb-2" aria-hidden="true"></i>
              <span class="small fw-semibold">Editar</span>
            </button>
          </div>
          <div class="col-4">
            <button type="button" class="btn btn-light border shadow-sm w-100 py-3 vp-pedido-accion-card" data-vp-accion="imprimir">
              <i class="fa-solid fa-print fa-lg text-secondary d-block mb-2" aria-hidden="true"></i>
              <span class="small fw-semibold">Imprimir</span>
            </button>
          </div>
          <div class="col-4">
            <button type="button" class="btn btn-light border shadow-sm w-100 py-3 vp-pedido-accion-card" data-vp-accion="eliminar">
              <i class="fa-solid fa-trash fa-lg text-danger d-block mb-2" aria-hidden="true"></i>
              <span class="small fw-semibold">Eliminar</span>
            </button>
          </div>
        </div>`,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'Cerrar',
      focusCancel: true,
      width: 'min(100%, 22rem)',
      didOpen: (popup) => {
        const wrap = popup.querySelector('#vp-list-acciones-wrap');
        wrap?.addEventListener('click', (ev) => {
          const btn = ev.target.closest('[data-vp-accion]');
          if (!btn) return;
          ev.preventDefault();
          accion = btn.getAttribute('data-vp-accion');
          Swal.close();
        });
      },
    });
    if (!accion) return;
    try {
      if (accion === 'editar') await this.showEditor(coddoc, correlativo);
      else if (accion === 'imprimir') await this.imprimirPedido(coddoc, correlativo);
      else if (accion === 'eliminar') await this.eliminarPedido(coddoc, correlativo);
    } catch (err) {
      F.toast(err.message || 'Error', 'error');
    }
  },

  docKey() {
    if (!this._pedido?.header) return null;
    const h = this._pedido.header;
    return { coddoc: h.CODDOC, correlativo: Number(h.CORRELATIVO) };
  },

  docLabel() {
    const h = this._pedido?.header;
    if (!h) return 'Sin pedido';
    return `${h.CODDOC} #${h.CORRELATIVO}`;
  },

  lineId(ln) {
    return ln?.ID ?? ln?.Id ?? null;
  },

  findLineById(id) {
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    return (this._pedido?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
  },

  usuario() {
    const u = F.session('user');
    return u?.username || 'POS';
  },

  clienteTipoNegocio(h) {
    if (!h) return '—';
    const tipo = String(h.CLI_TIPONEGOCIO || h.TIPONEGOCIO || '').trim();
    const neg = String(h.CLI_NEGOCIO || h.NEGOCIO || '').trim();
    if (tipo && neg) return `${tipo} — ${neg}`;
    return tipo || neg || '—';
  },

  hasCliente(h) {
    const cod = h?.CODCLIENTE;
    if (cod == null || cod === '' || Number(cod) <= 0) return false;
    const nom = String(h.DOC_NOMCLIE || h.CLI_NOMBRE || '').trim();
    return nom.length > 0;
  },

  hasVendedor(h) {
    const cod = h?.CODVEN;
    return cod != null && cod !== '' && Number(cod) > 0;
  },

  syncClienteSearchEmphasis() {
    const h = this._pedido?.header;
    const inp = this._container?.querySelector('#vp-cliente-search');
    if (!inp) return;
    const highlight = this.docEditable(h) && !this.hasCliente(h);
    inp.classList.toggle('pos-cliente-search-required', highlight);
  },

  syncVendedorEmphasis() {
    const h = this._pedido?.header;
    const sel = this._container?.querySelector('#vp-doc-vendedor');
    if (!sel) return;
    const highlight = this.docEditable(h) && !this.hasVendedor(h);
    sel.classList.toggle('pos-doc-vendedor-required', highlight);
  },

  async fetchConfig() {
    const codempleado = F.sessionCodEmpleado();
    return F.fetchJson(
      this.apiUrl('/config', {
        _: Date.now(),
        ...(codempleado != null ? { codempleado: String(codempleado) } : {}),
      })
    );
  },

  async fetchProductos(q) {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40', campoPrecio: this._precioCampo });
    if (q) params.set('q', q);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/pos/productos?${params}`);
  },

  activeCoddoc() {
    return DocTipoSelect.active(this);
  },

  async fetchPedidosList() {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), status: 'O' });
    params.set('_', String(Date.now()));
    const data = await F.fetchJson(`/api/pos/pedidos?${params}`);
    this._pedidosList = data.rows || [];
    return this._pedidosList;
  },

  filteredPedidosList() {
    const cod = String(this.activeCoddoc() || '').trim();
    let rows = this._pedidosList;
    if (cod) {
      rows = rows.filter((r) => String(r.CODDOC ?? '').trim() === cod);
    }
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.NEGOCIO,
        r.TIPONEGOCIO,
        r.OBS,
        r.F_ENTREGA,
        r.DIRENTREGA,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async loadPedido(coddoc, correlativo, opts = {}) {
    const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    this._pedido = await F.fetchJson(url);
    if (this._screen === 'editor' && !opts.skipRender) this.renderAll();
  },

  async crearPedido() {
    await this.fetchVendedores();
    const body = {
      CODDOC: this.activeCoddoc(),
      CODCLIENTE: this._config?.clienteDefault?.CODCLIENTE,
      USUARIO: this.usuario(),
    };
    const codven = F.defaultCodvenFromSession(this._vendedores);
    if (codven != null) body.CODVEN = codven;
    const url = `/api/pos/pedidos?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Nuevo pedido creado', 'success');
  },

  docEditable(header) {
    return DocFecha.editableStatus(header?.STATUS);
  },

  permiteCambiarPrecioPedido() {
    return DocPrecioConfig.puedeCambiarPrecio(this._config);
  },

  requiereAutorizacionPrecio() {
    return DocPrecioConfig.requiereAutorizacionPrecio(this._config);
  },

  solicitaAutorizaciones() {
    return String(this._config?.solicitaAutorizaciones || 'NO').trim().toUpperCase() === 'SI';
  },

  async finalizarPedido() {
    const key = this.docKey();
    if (!key) return;
    const h = this._pedido?.header;
    if (!this.docEditable(h)) {
      F.toast('El pedido no está operado', 'warning');
      return;
    }
    if (!(this._pedido?.lines || []).length) {
      F.toast('Agregue al menos un producto', 'warning');
      return;
    }
    if (!this.hasCliente(h)) {
      F.toast('Seleccione un cliente antes de finalizar', 'warning');
      this.syncClienteSearchEmphasis();
      this._container?.querySelector('#vp-cliente-search')?.focus();
      return;
    }

    const solicitaClave = await DocVendedorClave.shouldSolicitarClave();
    if (solicitaClave) {
      const ok = await DocVendedorClave.promptAndApply({
        apiLookupUrl: `/api/pos/vendedores/por-clave?empnit=${encodeURIComponent(F.getEmpNit())}`,
        vendedorSelectId: '#vp-doc-vendedor',
        view: this,
      });
      if (!ok) return;
    } else if (!this.hasVendedor(h)) {
      F.toast('Seleccione un vendedor antes de finalizar', 'warning');
      this.syncVendedorEmphasis();
      this._container?.querySelector('#vp-doc-vendedor')?.focus();
      return;
    }

    const tipoNeg = this.escapeHtml(this.clienteTipoNegocio(h));
    const nomRaw = (h.DOC_NOMCLIE || h.CLI_NOMBRE || '').trim();
    const dirRaw = (h.DOC_DIRCLIE || h.CLI_DIR || '').trim();
    const obsVal = this.escapeHtml(h.OBS || '');
    const tipofacDefault =
      typeof DocTipofacPrioridad !== 'undefined'
        ? await DocTipofacPrioridad.fetchDefaultTipofac()
        : 'FEF';
    const tipofacHtml =
      typeof DocTipofacPrioridad !== 'undefined'
        ? DocTipofacPrioridad.tipofacSelectHtml({
            id: 'vp-finalizar-tipofac',
            selected: h.TIPOFAC || tipofacDefault,
          })
        : '';
    const prioridadHtml =
      typeof DocTipofacPrioridad !== 'undefined'
        ? DocTipofacPrioridad.prioridadSelectHtml({
            id: 'vp-finalizar-prioridad',
            selected: h.PRIORIDAD || 'BAJA',
          })
        : '';
    const entregaHtml =
      typeof DocEntrega !== 'undefined'
        ? DocEntrega.fieldsHtml({
            prefix: 'vp',
            fEntrega: h.F_ENTREGA,
            dirEntrega: DocEntrega.dirDefault(h),
          })
        : '';

    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Finalizar pedido',
      html: `
        <p class="small text-muted mb-3">${this.escapeHtml(this.docLabel())}</p>
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small mb-0">Tipo negocio — Negocio</label>
            <div class="form-control form-control-sm bg-light">${tipoNeg}</div>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="vp-finalizar-nomclie">Nombre cliente</label>
            <input type="text" id="vp-finalizar-nomclie" class="form-control form-control-sm"
              value="${this.escapeHtml(nomRaw)}" autocomplete="off">
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="vp-finalizar-dirclie">Dirección cliente</label>
            <input type="text" id="vp-finalizar-dirclie" class="form-control form-control-sm"
              value="${this.escapeHtml(dirRaw)}" autocomplete="off">
          </div>
          ${tipofacHtml}
          ${prioridadHtml}
          ${entregaHtml}
          <div class="mb-0">
            <label class="form-label small mb-0" for="vp-finalizar-obs">Observaciones</label>
            <textarea id="vp-finalizar-obs" class="form-control form-control-sm" rows="3"
              placeholder="Observaciones del pedido…">${obsVal}</textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        if (typeof DocEntrega !== 'undefined') DocEntrega.bindToggle('vp');
        document.getElementById('vp-finalizar-nomclie')?.focus();
      },
      preConfirm: () => {
        const nom = document.getElementById('vp-finalizar-nomclie')?.value?.trim() || '';
        if (!nom) {
          Swal.showValidationMessage('Ingrese el nombre del cliente');
          return false;
        }
        const entrega =
          typeof DocEntrega !== 'undefined'
            ? DocEntrega.readFromDom('vp')
            : { error: 'DocEntrega no disponible' };
        if (entrega.error) {
          Swal.showValidationMessage(entrega.error);
          return false;
        }
        return {
          OBS: document.getElementById('vp-finalizar-obs')?.value?.trim() || '',
          DOC_NOMCLIE: nom,
          DOC_DIRCLIE: document.getElementById('vp-finalizar-dirclie')?.value?.trim() || '',
          F_ENTREGA: entrega.F_ENTREGA,
          DIRENTREGA: entrega.DIRENTREGA,
          TIPOFAC:
            typeof DocTipofacPrioridad !== 'undefined'
              ? DocTipofacPrioridad.readTipofacFromDom('vp-finalizar-tipofac')
              : 'FEF',
          PRIORIDAD:
            typeof DocTipofacPrioridad !== 'undefined'
              ? DocTipofacPrioridad.readPrioridadFromDom('vp-finalizar-prioridad')
              : 'BAJA',
        };
      },
    });

    if (!isConfirmed) return;

    const pos = await this.ensureCurrentPosition();
    if (!pos) {
      F.toast('Active la ubicación del navegador para guardar el GPS del pedido', 'warning');
    }

    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const body = { ...value };
    if (pos) {
      body.LAT = pos.lat;
      body.LONG = pos.lng;
    }
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Pedido finalizado', 'success');
    this._pedido = null;
    await this.showList();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1, precio = undefined) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay pedido activo', 'warning');
      return;
    }
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const body = {
      CODPROD: codprod,
      CODMEDIDA: codmedida,
      CANTIDAD: cantidad,
      CAMPO_PRECIO: this._precioCampo,
    };
    if (precio !== undefined && precio !== null) {
      body.PRECIO = precio;
    }
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
    this.showProductoAgregadoBadge('Producto agregado');
  },

  async agregarLineaPse({ desprod, cantidad, costo, precio }) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay pedido activo', 'warning');
      return;
    }
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo: 'pse',
        DESPROD: desprod,
        CANTIDAD: cantidad,
        COSTO: costo,
        PRECIO: precio,
      }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
    this.showProductoAgregadoBadge('PSE agregado');
  },

  async onAgregarPse() {
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const { value } = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Agregar PSE',
      html: `
        <p class="small text-muted mb-2 text-start">Producto sin existencia (no está en catálogo). Medida: UNIDAD.</p>
        <label class="form-label small mb-0 text-start d-block" for="vp-swal-pse-desprod">Descripción</label>
        <input type="text" id="vp-swal-pse-desprod" class="form-control form-control-sm" placeholder="Descripción del producto" autocomplete="off">
        <div class="row g-2 mt-1">
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="vp-swal-pse-cant">Cantidad</label>
            <input type="number" id="vp-swal-pse-cant" class="form-control form-control-sm" value="1" min="0" step="any">
          </div>
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="vp-swal-pse-costo">Costo unit.</label>
            <input type="number" id="vp-swal-pse-costo" class="form-control form-control-sm" value="0" min="0" step="any">
          </div>
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="vp-swal-pse-precio">Precio unit.</label>
            <input type="number" id="vp-swal-pse-precio" class="form-control form-control-sm" value="0" min="0" step="any">
          </div>
        </div>
        <p class="small fw-semibold text-end mb-0 mt-2" id="vp-swal-pse-subtotal">Subtotal: ${this.escapeHtml(this.formatMoney(0))}</p>
      `,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Agregar') : 'Agregar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const cantInp = document.getElementById('vp-swal-pse-cant');
        const precioInp = document.getElementById('vp-swal-pse-precio');
        const subEl = document.getElementById('vp-swal-pse-subtotal');
        const updateSub = () => {
          const cant = Number(cantInp?.value) || 0;
          const precio = Number(precioInp?.value) || 0;
          if (subEl) subEl.textContent = `Subtotal: ${this.formatMoney(cant * precio)}`;
        };
        cantInp?.addEventListener('input', updateSub);
        precioInp?.addEventListener('input', updateSub);
        if (typeof PosProductKeyboardUI !== 'undefined') {
          PosProductKeyboardUI.focusInput(document.getElementById('vp-swal-pse-desprod'));
        } else {
          document.getElementById('vp-swal-pse-desprod')?.focus();
        }
      },
      preConfirm: () => {
        const desprod = String(document.getElementById('vp-swal-pse-desprod')?.value || '').trim();
        if (!desprod) {
          Swal.showValidationMessage('La descripción es obligatoria');
          return false;
        }
        const cantidad = Number(document.getElementById('vp-swal-pse-cant')?.value);
        const costo = Number(document.getElementById('vp-swal-pse-costo')?.value);
        const precio = Number(document.getElementById('vp-swal-pse-precio')?.value);
        if (!Number.isFinite(cantidad) || cantidad <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        if (!Number.isFinite(costo) || costo < 0) {
          Swal.showValidationMessage('Costo inválido');
          return false;
        }
        if (!Number.isFinite(precio) || precio < 0) {
          Swal.showValidationMessage('Precio inválido');
          return false;
        }
        return { desprod, cantidad, costo, precio };
      },
    });
    if (!value) return;
    try {
      await this.agregarLineaPse(value);
    } catch (err) {
      F.toast(err.message || 'No se pudo agregar el PSE', 'error');
    }
  },

  setCartBusy(busy) {
    this._cartBusy = busy;
    const tbody = this._container?.querySelector('#vp-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-vp-finalizar');
    if (fab) fab.disabled = busy;
    const barcodeFab = this._container?.querySelector('#vp-fab-barcode');
    if (barcodeFab) barcodeFab.disabled = busy;
  },

  async actualizarCantidad(lineId, cantidad) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CANTIDAD: cantidad }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
  },

  async actualizarPrecio(lineId, precio) {
    const key = this.docKey();
    if (!key) return;
    const line = this.findLineById(lineId);
    if (!line) throw new Error('No se encontró la línea del pedido');
    const cantidad = Number(line.CANTIDAD) || 1;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CANTIDAD: cantidad, PRECIO: precio }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
  },

  async catalogPrecioForLine(line) {
    const codprod = String(line?.CODPROD || '').trim();
    const codmedida = String(line?.CODMEDIDA || '').trim();
    if (!codprod) return Number(line?.PRECIO) || 0;
    try {
      const data = await this.fetchProductos(codprod);
      const rows = data?.productos || [];
      const campo = this._precioCampo || 'PRECIO';
      const match = rows.find(
        (p) =>
          String(p.CODPROD) === codprod &&
          (!codmedida || String(p.CODMEDIDA) === codmedida)
      );
      if (match) return Number(match[campo] ?? match.PRECIO) || 0;
    } catch (_) {
      /* ignore */
    }
    return Number(line?.PRECIO) || 0;
  },

  async promptEditarPrecioLinea(line) {
    const current = Number(line?.PRECIO) || 0;
    const label = `${line?.CODPROD || ''} ${line?.DESPROD || ''}`.trim();
    const catalogo = await this.catalogPrecioForLine(line);
    const solicitaAuth = this.solicitaAutorizaciones();
    const result = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Cambiar precio unitario',
      html: `<p class="small text-muted mb-2">${this.escapeHtml(label)}</p>
        <label class="form-label small mb-0" for="vp-cart-precio-edit">Precio</label>
        <input type="number" id="vp-cart-precio-edit" class="form-control form-control-sm" value="${current}" min="0" step="any">
        <div id="vp-cart-precio-clave-wrap" class="d-none mt-2">
          <form class="secret-input-modal" autocomplete="off" novalidate onsubmit="return false">
            ${
              typeof CatalogosUI !== 'undefined'
                ? CatalogosUI.secretInputFieldHtml({
                    inputId: 'vp-cart-precio-clave',
                    name: 'onneb-cart-precio-operador-pass',
                    label: 'Clave de operador',
                    placeholder: 'Clave de operador',
                  })
                : ''
            }
          </form>
        </div>`,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Guardar') : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        CatalogosUI?.wireSecretInput('vp-cart-precio-clave');
        const inp = document.getElementById('vp-cart-precio-edit');
        inp?.focus();
        inp?.select();
      },
      preConfirm: async () => {
        const precio = Number(document.getElementById('vp-cart-precio-edit')?.value);
        if (!Number.isFinite(precio) || precio < 0) {
          Swal.showValidationMessage('Precio inválido');
          return false;
        }
        if (!this.requiereAutorizacionPrecio()) return precio;
        if (
          typeof AutorizacionesUI !== 'undefined' &&
          AutorizacionesUI.precioChangeAllowed(precio, catalogo)
        ) {
          return precio;
        }
        const adminPass = document.getElementById('vp-cart-precio-clave')?.value ?? '';
        if (!solicitaAuth && !String(adminPass).trim()) {
          document.getElementById('vp-cart-precio-clave-wrap')?.classList.remove('d-none');
          Swal.showValidationMessage('Ingrese la clave de operador');
          return false;
        }
        const ok = await AutorizacionesUI.gateCambioPrecioUnitario({
          precio,
          catalogo,
          adminPass: solicitaAuth ? null : adminPass,
          descripcion: `${AutorizacionesUI.usuario()} solicita cambiar ${label} al precio ${AutorizacionesUI.formatPrecioDesc(precio)}`,
        });
        if (!ok) {
          Swal.showValidationMessage(
            solicitaAuth
              ? 'No se obtuvo autorización para el precio'
              : 'Clave de operador incorrecta'
          );
          return false;
        }
        return precio;
      },
    });
    if (!result.isConfirmed) return null;
    if (this.requiereAutorizacionPrecio() && typeof AutorizacionesUI !== 'undefined') {
      AutorizacionesUI.consumePrecioGrant();
    }
    return result.value;
  },

  async eliminarLinea(lineId) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, { method: 'DELETE' });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
  },

  async onProductClick(row) {
    if (!row?.CODPROD) {
      F.toast('Producto no disponible', 'warning');
      return;
    }
    const precios = this._productos.filter(
      (p) => String(p.CODPROD).trim() === String(row.CODPROD).trim()
    );
    if (!precios.length) {
      F.toast('Sin precios habilitados', 'warning');
      return;
    }
    const defaultMedida = row.CODMEDIDA || precios[0].CODMEDIDA;
    const priceByMedida = Object.fromEntries(
      precios.map((p) => [String(p.CODMEDIDA), Number(p.PRECIO) || 0])
    );
    const costByMedida = Object.fromEntries(
      precios.map((p) => [String(p.CODMEDIDA), Number(p.COSTO ?? p.COSTO_PROD) || 0])
    );
    const defaultPrecio = priceByMedida[String(defaultMedida)] ?? 0;
    const defaultCosto = costByMedida[String(defaultMedida)] ?? 0;
    const permiteCambiarPrecio = this.permiteCambiarPrecioPedido();
    const solicitaAuth = this.solicitaAutorizaciones();
    const showCosto = F.isAdminOrSuperUser();
    const options = precios
      .map((p) => {
        const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
        return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.PRECIO))} (eq. ${this.escapeHtml(p.EQUIVALE)}, exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))})</option>`;
      })
      .join('');
    let authGate = null;
    const { value: picked } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: row.DESPROD || row.CODPROD,
      html: `
        <label class="form-label small mb-0">Medida</label>
        <select id="vp-swal-medida" class="form-select form-select-sm">${options}</select>
        <div class="row g-2 mt-2 align-items-start">
          <div class="col-6">
            <label class="form-label small mb-0" for="vp-swal-cant">Cantidad</label>
            <input type="number" id="vp-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0" for="vp-swal-precio">Precio</label>
            ${
              permiteCambiarPrecio
                ? `<input type="number" id="vp-swal-precio" class="form-control form-control-sm" value="${defaultPrecio}" min="0" step="any">`
                : `<input type="text" id="vp-swal-precio" class="form-control form-control-sm bg-light" value="${this.escapeHtml(this.formatMoney(defaultPrecio))}" readonly>`
            }
          </div>
        </div>
        ${
          showCosto
            ? `<p class="small text-danger fw-semibold mb-0 mt-2 text-end" id="vp-swal-costo">Costo: ${this.escapeHtml(this.formatMoney(defaultCosto))}</p>`
            : ''
        }
        <p class="small text-muted mb-0 mt-2 text-end" id="vp-swal-total">Total: ${this.escapeHtml(this.formatMoney(defaultPrecio))}</p>
        <p class="small mb-0 mt-2 text-center" id="authz-precio-status"></p>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: (popup) => {
        const medSel = document.getElementById('vp-swal-medida');
        const cantInp = document.getElementById('vp-swal-cant');
        const precioInp = document.getElementById('vp-swal-precio');
        const costoEl = document.getElementById('vp-swal-costo');
        const totalEl = document.getElementById('vp-swal-total');
        const readPrecio = () => {
          if (permiteCambiarPrecio) {
            return Number(precioInp?.value) || 0;
          }
          const med = medSel?.value;
          return priceByMedida[med] ?? 0;
        };
        const updateTotal = () => {
          const cant = Number(cantInp?.value) || 0;
          const precio = readPrecio();
          if (totalEl) totalEl.textContent = `Total: ${this.formatMoney(cant * precio)}`;
        };
        const syncPrecioFromMedida = () => {
          const med = medSel?.value;
          const precio = priceByMedida[med] ?? 0;
          if (precioInp) {
            precioInp.value = permiteCambiarPrecio ? String(precio) : this.formatMoney(precio);
          }
          if (costoEl) {
            const costo = costByMedida[String(med)] ?? 0;
            costoEl.textContent = `Costo: ${this.formatMoney(costo)}`;
          }
          updateTotal();
        };
        medSel?.addEventListener('change', syncPrecioFromMedida);
        cantInp?.addEventListener('input', updateTotal);
        if (permiteCambiarPrecio) {
          precioInp?.addEventListener('input', updateTotal);
        }
        if (
          permiteCambiarPrecio &&
          this.requiereAutorizacionPrecio() &&
          typeof AutorizacionesUI !== 'undefined'
        ) {
          authGate = AutorizacionesUI.wirePrecioAuthGate({
            popup,
            precioInput: precioInp,
            medidaSelect: medSel,
            cantidadInput: cantInp,
            priceByMedida,
            permiteCambiarPrecio,
            solicitaAutorizaciones: solicitaAuth,
            buildDescripcion: ({ precio, cantidad, medida }) =>
              `${AutorizacionesUI.usuario()} quiere agregar el producto ${cantidad} ${medida} ${row.DESPROD || row.CODPROD} al precio ${AutorizacionesUI.formatPrecioDesc(precio)}`,
          });
        }
        PosProductKeyboardUI.focusInput(cantInp);
        PosProductKeyboardUI.wireModalQtyFlow({ cantInput: cantInp, priceInput: precioInp, popup });
      },
      willClose: () => {
        authGate?.dispose?.();
      },
      preConfirm: () => {
        const cant = Number(document.getElementById('vp-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        const medida = document.getElementById('vp-swal-medida')?.value;
        if (!medida) {
          Swal.showValidationMessage('Seleccione una medida');
          return false;
        }
        if (permiteCambiarPrecio) {
          const precio = Number(document.getElementById('vp-swal-precio')?.value);
          if (!Number.isFinite(precio) || precio < 0) {
            Swal.showValidationMessage('Precio inválido');
            return false;
          }
          const catalog = Number(priceByMedida[String(medida)] ?? 0) || 0;
          if (
            this.requiereAutorizacionPrecio() &&
            typeof AutorizacionesUI !== 'undefined' &&
            !AutorizacionesUI.precioChangeAllowed(precio, catalog)
          ) {
            Swal.showValidationMessage(
              solicitaAuth
                ? 'Espere la autorización del administrador'
                : 'Ingrese la clave de operador en el mismo modal'
            );
            return false;
          }
          return { medida, cantidad: cant, precio };
        }
        return { medida, cantidad: cant };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad, picked.precio);
      if (
        picked.precio != null &&
        this.requiereAutorizacionPrecio() &&
        typeof AutorizacionesUI !== 'undefined'
      ) {
        AutorizacionesUI.consumePrecioGrant();
      }
    }
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'vp');
    if (!targets.length) return;
    if (!this._productos.length) {
      const empty =
        '<p class="text-muted small text-center py-3 mb-0">Escriba código o descripción y presione Enter</p>';
      targets.forEach((el) => {
        el.innerHTML = empty;
      });
      return;
    }
    const showCosto = F.isAdminOrSuperUser();
    const html = this._productos
      .map((p) => {
        const costo = Number(p.COSTO ?? p.COSTO_PROD) || 0;
        const costoHtml = showCosto
          ? `<div class="vp-prod-cost small text-danger fw-semibold">Costo: ${this.escapeHtml(this.formatMoney(costo))}</div>`
          : '';
        return `
          <div class="pos-product-item vp-product-item-compact" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(this.formatProdLabel(p.DESPROD, p.DESMARCA))} ${this.escapeHtml(p.CODMEDIDA)}">
            <div class="vp-product-item-main min-w-0">
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA)}</div>
              <div class="vp-prod-name-line">${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
              ${this.renderDesprod2Html(p)}
            </div>
            <div class="pos-prod-meta text-end">
              <div class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</div>
              <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.PRECIO))}</div>
              ${costoHtml}
              <div class="pos-prod-remote">${PosDocSearchUI.remoteStockButton(p.CODPROD, (v) => this.escapeHtml(v))}</div>
            </div>
          </div>
        `;
      })
      .join('');
    targets.forEach((el) => {
      el.innerHTML = html;
    });
  },

  renderCart() {
    const tbody = this._container?.querySelector('#vp-cart-tbody');
    if (!tbody) return;
    const lines = this._pedido?.lines || [];
    const h = this._pedido?.header;
    const editable = this.docEditable(h);
    const puedeEditarPrecio = editable && this.permiteCambiarPrecioPedido();
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" class="text-center text-muted py-3">Sin productos en el pedido</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const lineId = this.lineId(ln);
        const qty = Number(ln.CANTIDAD) || 0;
        const unitPrice = this.formatMoney(ln.PRECIO);
        const qtyControlsInner = editable
          ? `<button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>−</button>
              <span class="px-1">${qty}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>+</button>`
          : `<span>${qty}</span>`;
        const priceHtml = puedeEditarPrecio
          ? `<button type="button" class="btn btn-link btn-sm p-0 pos-cart-unit-price pos-cart-price-btn" data-action="price-edit" data-id="${lineId}" title="Cambiar precio"${this._cartBusy ? ' disabled' : ''}>${this.escapeHtml(unitPrice)}</button>`
          : `<span class="vp-cart-unit-price small text-nowrap">${this.escapeHtml(unitPrice)}</span>`;
        const qtyCell = `<div class="vp-cart-qty-price d-flex align-items-center justify-content-center gap-2 flex-wrap">
            <div class="d-flex align-items-center gap-1">${qtyControlsInner}</div>
            ${priceHtml}
          </div>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${lineId}" title="Quitar"${this._cartBusy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA)}</span></td>
          <td class="text-end small pos-cart-exist">${this.escapeHtml(this.formatQty(ln.EXISTENCIA))}</td>
          <td class="text-center">${qtyCell}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderOrderSummary() {
    const totalEl = this._container?.querySelector('#vp-header-total');
    const itemsEl = this._container?.querySelector('#vp-header-items');
    const docEl = this._container?.querySelector('#vp-header-doc');
    const h = this._pedido?.header;
    const lines = this._pedido?.lines || [];
    const total = h?.TOTALPRECIO ?? 0;
    const itemCount = lines.reduce((sum, ln) => sum + (Number(ln.CANTIDAD) || 0), 0);
    if (totalEl) totalEl.textContent = this.formatMoney(total);
    if (itemsEl) {
      itemsEl.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    }
    if (docEl && h) docEl.textContent = this.docLabel();
  },

  renderHeaderInfo() {
    const cliente = this._container?.querySelector('#vp-cliente-nombre');
    const h = this._pedido?.header;
    if (cliente && h) {
      cliente.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#vp-cliente-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
    const fechaInp = this._container?.querySelector('#vp-doc-fecha');
    if (fechaInp && h && !fechaInp.matches(':focus')) {
      fechaInp.value = DocFecha.inputValueFromHeader(h);
    }
    const vendedorSel = this._container?.querySelector('#vp-doc-vendedor');
    if (vendedorSel && h && document.activeElement !== vendedorSel) {
      const codven = h.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
      vendedorSel.value = codven;
    }
    const tipofacSel = this._container?.querySelector('#vp-doc-tipofac');
    if (tipofacSel && h && document.activeElement !== tipofacSel) {
      tipofacSel.value = String(h.TIPOFAC || 'FEF').trim().toUpperCase() || 'FEF';
    }
    const prioridadSel = this._container?.querySelector('#vp-doc-prioridad');
    if (prioridadSel && h && document.activeElement !== prioridadSel) {
      prioridadSel.value = String(h.PRIORIDAD || 'BAJA').trim().toUpperCase() || 'BAJA';
    }
  },

  renderPrecioCampoSelector(editable) {
    const disabled = !editable ? ' disabled' : '';
    const opts = this.PRECIO_CAMPO_OPTIONS.map(
      (o) =>
        `<option value="${o.value}"${o.value === this._precioCampo ? ' selected' : ''}>${this.escapeHtml(o.label)}</option>`
    ).join('');
    return `
      <div class="vp-precio-campo-wrap ms-auto">
        <select class="form-select form-select-sm" id="vp-precio-campo" title="Columna de precio"${disabled}>
          ${opts}
        </select>
      </div>`;
  },

  renderVendedorField() {
    const h = this._pedido?.header;
    const codven = h?.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
    const disabled = !this.docEditable(h) ? ' disabled' : '';
    const opts = (this._vendedores || [])
      .map(
        (v) =>
          `<option value="${v.CODEMPLEADO}"${String(v.CODEMPLEADO) === codven ? ' selected' : ''}>${this.escapeHtml(v.NOMEMPLEADO)}</option>`
      )
      .join('');
    return `
      <div class="vp-doc-vendedor-wrap">
        <label class="form-label small mb-0" for="vp-doc-vendedor">Vendedor <span class="text-danger">*</span></label>
        <div class="input-group input-group-sm">
          <select class="form-select form-select-sm" id="vp-doc-vendedor"${disabled}>
            <option value="">— Seleccione —</option>
            ${opts}
          </select>
          <button type="button" class="btn btn-outline-secondary btn-refresh-vendedores" title="Actualizar vendedores" aria-label="Actualizar vendedores"${disabled}>
            <i class="fa-solid fa-rotate" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
  },

  renderTipofacPrioridadFields() {
    if (typeof DocTipofacPrioridad === 'undefined') return '';
    const h = this._pedido?.header;
    return DocTipofacPrioridad.editorFieldsHtml({
      tipofacId: 'vp-doc-tipofac',
      prioridadId: 'vp-doc-prioridad',
      tipofac: h?.TIPOFAC || 'FEF',
      prioridad: h?.PRIORIDAD || 'BAJA',
      disabled: !this.docEditable(h),
    });
  },

  syncEditorControls() {
    const editable = this.docEditable(this._pedido?.header);
    PosDocSearchUI.syncControls(this._container, 'vp', editable, {
      viewKey: 'vendedor-pedidos',
      permiteMover: this._config?.permiteMoverBotonFinalizarEnDocumentos,
    });
    [
      '#vp-cliente-search',
      '#vp-cliente-buscar-modal',
      '#vp-doc-fecha',
      '#vp-doc-vendedor',
      '#vp-doc-tipofac',
      '#vp-doc-prioridad',
      '#vp-precio-campo',
      '#vp-cliente-nuevo',
      '#vp-btn-agregar-pse',
      '.btn-refresh-vendedores',
    ].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-vp-finalizar');
    if (fab && !DocFinalizarFab?.isEnabled(this._config?.permiteMoverBotonFinalizarEnDocumentos)) {
      fab.style.display = editable ? '' : 'none';
    }
    this.syncClienteSearchEmphasis();
    this.syncVendedorEmphasis();
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderOrderSummary();
    this.syncEditorControls();
  },

  async eliminarPedido(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const pass = await CatalogosUI.confirmEliminarDocumento({ label, tipo: 'pedido' });
    if (!pass) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pass: String(pass),
        USUARIO: String(F.session('user')?.usuario || '').trim() || undefined,
      }),
    });
    F.toast('Pedido eliminado', 'success');
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async imprimirPedido(coddoc, correlativo) {
    try {
      const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
      const pedido = await F.fetchJson(url);
      await DocPrint.printDocument({
        title: 'Pedido (vendedor)',
        header: pedido.header,
        lines: pedido.lines || [],
      });
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const sub = this._container?.querySelector('.vp-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredPedidosList().length} pedido(s) operados`;
    }
    const mapHint = this._container?.querySelector('#vp-list-map-hint');
    if (mapHint) {
      mapHint.textContent = `${this.pedidosListConGps().length} pedido(s) con ubicación GPS en el mapa`;
    }
    const mode = this._listViewMode === 'map' ? 'map' : 'table';
    const tableWrap = this._container?.querySelector('.vp-list-table-wrap');
    const mapWrap = this._container?.querySelector('.vp-list-map-wrap');
    if (tableWrap) tableWrap.classList.toggle('d-none', mode === 'map');
    if (mapWrap) mapWrap.classList.toggle('d-none', mode === 'table');
    const btnTable = this._container?.querySelector('#vp-list-btn-table');
    const btnMap = this._container?.querySelector('#vp-list-btn-map');
    if (btnTable) btnTable.classList.toggle('active', mode === 'table');
    if (btnMap) btnMap.classList.toggle('active', mode === 'map');
    const tbody = this._container?.querySelector('#vp-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListTableBodyHtml();
    if (mode === 'map') {
      this.destroyListMap();
      window.requestAnimationFrame(() => this.initListMapIfNeeded());
    } else {
      this.destroyListMap();
    }
  },

  renderListActionsHtml(r) {
    return `
      <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar" title="Editar">
        <i class="fa-solid fa-pen"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir" title="Imprimir">
        <i class="fa-solid fa-print"></i>
      </button>
      <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar" title="Eliminar">
        <i class="fa-solid fa-trash"></i>
      </button>`;
  },

  renderListTableBodyHtml() {
    const rows = this.filteredPedidosList();
    if (!rows.length) {
      return `<tr><td colspan="9" class="text-center text-muted py-4">No hay pedidos operados</td></tr>`;
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const cliente = r.DOC_NOMCLIE || r.NEGOCIO || 'Sin cliente';
        const negocio = [r.TIPONEGOCIO, r.NEGOCIO].filter(Boolean).join(' · ') || '—';
        const entrega =
          typeof DocEntrega !== 'undefined' ? DocEntrega.formatListLabel(r) : String(r.F_ENTREGA || '').trim();
        return `
          <tr class="vp-list-row" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${r.CORRELATIVO}">
            <td class="fw-semibold text-nowrap">${this.escapeHtml(label)}</td>
            <td class="text-center text-nowrap">${DocStatus.badgeHtml(r.STATUS, (v) => this.escapeHtml(v))}</td>
            <td>${this.escapeHtml(cliente)}</td>
            <td class="small text-muted doc-list-col-optional">${this.escapeHtml(negocio)}</td>
            <td class="small doc-list-col-optional">${this.escapeHtml(entrega || '—')}</td>
            <td class="text-center doc-list-col-optional">${Number(r.LINEAS) || 0}</td>
            <td class="text-end fw-semibold">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</td>
            <td class="text-nowrap small doc-list-col-optional">${this.escapeHtml(this.formatFechaPedido(r))}</td>
            <td class="text-end text-nowrap fac-list-actions">${this.renderListActionsHtml(r)}</td>
          </tr>`;
      })
      .join('');
  },

  renderListTableHtml() {
    return `
      <div class="card fac-list-table-card shadow-sm">
        <div class="table-responsive fac-list-table-scroll">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th scope="col">Documento</th>
                <th scope="col" class="text-center">Estado</th>
                <th scope="col">Cliente</th>
                <th scope="col" class="doc-list-col-optional">Negocio</th>
                <th scope="col" class="doc-list-col-optional">Entrega</th>
                <th scope="col" class="text-center doc-list-col-optional">Líneas</th>
                <th scope="col" class="text-end">Total</th>
                <th scope="col" class="doc-list-col-optional">Fecha</th>
                <th scope="col" class="text-end fac-list-actions">Acciones</th>
              </tr>
            </thead>
            <tbody id="vp-list-tbody">${this.renderListTableBodyHtml()}</tbody>
          </table>
        </div>
      </div>`;
  },

  renderListScreen() {
    const count = this.filteredPedidosList().length;
    const gpsCount = this.pedidosListConGps().length;
    return `
      <div class="vp-list-wrap vp-list-screen">
        <div class="vp-list-header">
          <h2 class="vp-list-title">Seleccione un pedido o cree uno nuevo</h2>
          <p class="vp-list-sub text-muted mb-0">${count} pedido(s) operados</p>
        </div>
        <div class="vp-list-toolbar d-flex flex-column flex-md-row gap-2 gap-md-3 mb-3 align-items-stretch align-items-md-end">
          ${DocTipoSelect.renderSelectHtml({
            selectId: 'vp-list-coddoc',
            tipos: this._config?.tiposDocumento,
            selected: this.activeCoddoc(),
            label: 'Serie',
          })}
          <div class="vp-list-search flex-grow-1">
            <label class="form-label small mb-1" for="vp-list-search">Buscar</label>
            <div class="input-group">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control pos-search-glow" id="vp-list-search"
                placeholder="Buscar pedido, cliente, negocio…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
            </div>
          </div>
          <div class="vp-list-view-toggle btn-group" role="group" aria-label="Vista lista o mapa">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="vp-list-btn-table" title="Lista">
              <i class="fa-solid fa-list" aria-hidden="true"></i><span class="d-none d-sm-inline ms-1">Lista</span>
            </button>
            <button type="button" class="btn btn-outline-secondary btn-sm" id="vp-list-btn-map" title="Mapa GPS">
              <i class="fa-solid fa-map-location-dot" aria-hidden="true"></i><span class="d-none d-sm-inline ms-1">Mapa</span>
            </button>
          </div>
        </div>
        <p class="small text-muted mb-2 vp-list-map-hint" id="vp-list-map-hint">${gpsCount} pedido(s) con ubicación GPS en el mapa</p>
        <div class="vp-list-table-wrap">${this.renderListTableHtml()}</div>
        <div class="vp-list-map-wrap d-none">
          <div class="card shadow-sm border-0">
            <div class="card-body p-0">
              <div id="vp-pedidos-map-host" class="vp-pedidos-map-host" role="region" aria-label="Mapa de pedidos"></div>
            </div>
          </div>
        </div>
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-vp-list-nuevo"
          aria-label="Nuevo pedido" title="Nuevo pedido"${this.activeCoddoc() ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderEditorShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Pedidos';
    const editable = this.docEditable(this._pedido?.header);
    return `
      <div class="pos-vista-wrap vp-vendedor-pedidos">
        <div class="vp-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="vp-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-vp-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="vp-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="vp-header-logo">'}
              </div>
              <div class="vp-header-doc-label small fw-semibold" id="vp-header-doc">${this.escapeHtml(this.docLabel())}</div>
              <div class="vp-doc-meta-fields vp-doc-meta-grid d-flex flex-wrap align-items-end gap-2">
                ${DocFecha.renderField('vp-doc-fecha', this._pedido?.header)}
                ${this.renderVendedorField()}
                ${this.renderTipofacPrioridadFields()}
              </div>
              <div class="vp-header-summary ms-auto text-end">
                <h3 class="vp-header-total mb-0 text-danger" id="vp-header-total">Q 0.00</h3>
                <div class="vp-header-items text-danger" id="vp-header-items">0 items</div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <!-- Orden DOM: primero columna ancha (productos), segundo columna estrecha (pedido) en escritorio -->
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap w-100">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
              ${this.renderPrecioCampoSelector(editable)}
            </div>
            <div class="card-body">
              <div class="vp-product-search-feedback mb-1" aria-live="polite">
                <span class="vp-product-added-flash" id="vp-product-added-flash"></span>
              </div>
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="vp-product-search"
                  placeholder="Código o descripción… (Enter)" autocomplete="off"${editable ? '' : ' disabled'}>
                <button type="button" class="btn btn-outline-secondary text-nowrap" id="vp-btn-agregar-pse"
                  title="Agregar producto sin existencia"${editable ? '' : ' disabled'}>Agregar PSE</button>
              </div>
              <div class="vp-product-list pos-product-list" id="vp-product-list"></div>
            </div>
          </div>
          <div class="pos-panel pos-panel-cart card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-receipt"></i>
                <span class="fw-semibold">Pedido actual</span>
              </div>
            </div>
            <div class="card-body">
              <div class="vp-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Cliente</label>
                <div class="input-group input-group-sm">
                  ${ClienteHistorialPreciosUI.buttonHtml('vp-cliente-historial')}
                  <input type="search" class="form-control pos-search-glow" id="vp-cliente-search"
                    placeholder="Buscar cliente… (requerido)" autocomplete="off"${editable ? '' : ' disabled'}>
                  <button type="button" class="btn btn-outline-secondary text-nowrap" id="vp-cliente-buscar-modal"
                    title="Buscar cliente en lista" aria-label="Buscar cliente"${editable ? '' : ' disabled'}>
                    <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="btn btn-outline-primary text-nowrap" id="vp-cliente-nuevo"
                    title="Crear cliente nuevo"${editable ? '' : ' disabled'}>NUEVO (+)</button>
                </div>
                <div id="vp-cliente-nombre" class="small text-muted mt-1"></div>
              </div>
              <div class="vp-cart-table flex-grow-1 d-flex flex-column">
                <div class="table-responsive">
                  <table class="table table-sm table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Cód.</th>
                        <th>Producto</th>
                        <th class="text-end">Exist.</th>
                        <th class="text-center">Cant. / Precio</th>
                        <th class="text-end">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="vp-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml('vp') : ''}
        ${PosDocSearchUI.productModalHtml('vp')}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#vp-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    DocTipoSelect.bind(this._container, 'vp-list-coddoc', this, () => this.refreshListDom());

    this._container?.querySelector('#vp-list-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.inv-card-btn');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const row = btn.closest('.vp-list-row');
        if (!row) return;
        const coddoc = row.getAttribute('data-coddoc');
        const correlativo = row.getAttribute('data-correlativo');
        const action = btn.getAttribute('data-action');
        try {
          if (action === 'editar') await this.showEditor(coddoc, correlativo);
          else if (action === 'imprimir') await this.imprimirPedido(coddoc, correlativo);
          else if (action === 'eliminar') await this.eliminarPedido(coddoc, correlativo);
        } catch (err) {
          F.toast(err.message || 'Error', 'error');
        }
        return;
      }
      if (!this.isListMobileActions()) return;
      const row = e.target.closest('.vp-list-row');
      if (!row) return;
      if (row.querySelector('td[colspan]')) return;
      await this.openListPedidoAccionesModal(row);
    });

    this._container?.querySelector('#btn-vp-list-nuevo')?.addEventListener('click', () => this.onNuevoPedido());

    this._container?.querySelector('#vp-list-btn-table')?.addEventListener('click', () => {
      this._listViewMode = 'table';
      this.refreshListDom();
    });
    this._container?.querySelector('#vp-list-btn-map')?.addEventListener('click', () => {
      this._listViewMode = 'map';
      this.refreshListDom();
    });
    if (!this._vpListResizeBound) {
      this._vpListResizeBound = true;
      window.addEventListener('resize', () => {
        if (this._screen !== 'list' || this._listViewMode !== 'map') return;
        try {
          this._vpLeafletMap?.invalidateSize();
        } catch {
          /* ignore */
        }
      });
    }

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => false,
      onNuevo: () => this.onNuevoPedido(),
    });
  },

  bindEditorEvents() {
    PosDocSearchUI.bind(this, 'vp', {
      getEditable: () => this.docEditable(this._pedido?.header),
      buscarProductos: this.buscarProductos,
      onProductPick: (row) => this.onProductClick(row),
    });

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => true,
      getEditable: () => this.docEditable(this._pedido?.header),
      onNuevo: () => this.onNuevoPedido(),
      onFinalizar: () => this.finalizarPedido(),
    });

    const precioCampoSel = this._container?.querySelector('#vp-precio-campo');
    if (precioCampoSel) {
      precioCampoSel.addEventListener('change', () => {
        if (precioCampoSel.disabled) return;
        this._precioCampo = precioCampoSel.value || 'PRECIO';
        const q = this._container?.querySelector('#vp-product-search')?.value?.trim() || '';
        if (q) this.buscarProductos(q).catch((err) => F.toast(err.message, 'error'));
      });
    }

    this._container?.querySelector('#vp-cliente-nuevo')?.addEventListener('click', () => {
      this.onNuevoCliente().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#vp-cliente-historial')?.addEventListener('click', () => {
      this.openHistorialFacturasCliente().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#vp-btn-agregar-pse')?.addEventListener('click', () => {
      this.onAgregarPse().catch((err) => F.toast(err.message || 'Error al agregar PSE', 'error'));
    });

    this._container?.querySelector('#vp-cart-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled || this._cartBusy) return;
      e.preventDefault();
      const id = Number(btn.getAttribute('data-id'));
      const line = this.findLineById(id);
      if (!line) {
        F.toast('No se encontró la línea del pedido', 'warning');
        return;
      }
      const action = btn.getAttribute('data-action');

      if (action === 'price-edit') {
        try {
          const precio = await this.promptEditarPrecioLinea(line);
          if (precio == null) return;
          this.setCartBusy(true);
          this.renderCart();
          await this.actualizarPrecio(id, precio);
          F.toast('Precio actualizado', 'success');
        } catch (err) {
          F.toast(err.message || 'Error al actualizar el precio', 'error');
        } finally {
          this.setCartBusy(false);
          this.renderCart();
        }
        return;
      }

      this.setCartBusy(true);
      this.renderCart();
      try {
        if (action === 'line-del') {
          await this.eliminarLinea(id);
          return;
        }
        const qty = Number(line.CANTIDAD) || 1;
        if (action === 'qty-plus') await this.actualizarCantidad(id, qty + 1);
        else if (action === 'qty-minus') {
          if (qty <= 1) await this.eliminarLinea(id);
          else await this.actualizarCantidad(id, qty - 1);
        }
      } catch (err) {
        F.toast(err.message || 'Error al actualizar el pedido', 'error');
      } finally {
        this.setCartBusy(false);
        this.renderCart();
      }
    });

    this._container?.querySelector('#btn-vp-atras')?.addEventListener('click', () => this.showList());
    this._container?.querySelector('#btn-vp-finalizar')?.addEventListener('click', () => {
      this.finalizarPedido().catch((err) => F.toast(err.message, 'error'));
    });

    const fechaInp = this._container?.querySelector('#vp-doc-fecha');
    if (fechaInp) {
      fechaInp.addEventListener('change', () => {
        if (fechaInp.disabled) return;
        const val = fechaInp.value?.trim();
        if (!val) return;
        this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const vendedorSel = this._container?.querySelector('#vp-doc-vendedor');
    if (vendedorSel) {
      vendedorSel.addEventListener('change', () => {
        if (vendedorSel.disabled) return;
        const val = vendedorSel.value?.trim();
        this.guardarVendedorDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const tipofacSel = this._container?.querySelector('#vp-doc-tipofac');
    if (tipofacSel) {
      tipofacSel.addEventListener('change', () => {
        if (tipofacSel.disabled) return;
        this.guardarTipofacDocumento(tipofacSel.value).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const prioridadSel = this._container?.querySelector('#vp-doc-prioridad');
    if (prioridadSel) {
      prioridadSel.addEventListener('change', () => {
        if (prioridadSel.disabled) return;
        this.guardarPrioridadDocumento(prioridadSel.value).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const refreshVenBtn = this._container?.querySelector('.btn-refresh-vendedores');
    if (refreshVenBtn) {
      refreshVenBtn.addEventListener('click', () => {
        this.reloadVendedoresOptions().catch((err) => F.toast(err.message || 'No se pudo actualizar', 'error'));
      });
    }

    const clienteSearch = this._container?.querySelector('#vp-cliente-search');
    const clienteModalBtn = this._container?.querySelector('#vp-cliente-buscar-modal');
    clienteModalBtn?.addEventListener('click', () => {
      const q = clienteSearch?.value?.trim() || '';
      this.openClienteBusquedaModal(q).catch((err) => F.toast(err.message || 'Error', 'error'));
    });
    clienteSearch?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = clienteSearch.value.trim();
        this.openClienteBusquedaModal(q).catch((err) => F.toast(err.message || 'Error', 'error'));
      }
    });
  },

  async buscarProductos(q) {
    const term = String(q ?? '').trim();
    if (!term) {
      PosDocSearchUI.resetProductSearch(this, 'vp');
      return;
    }
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'vp', spinner);
    try {
      const data = await this.fetchProductos(term);
      this._productos = data.rows || [];
      if (!this._productos.length) {
        PosDocSearchUI.setListsHtml(
          this._container,
          'vp',
          '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
        );
        return;
      }
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'vp', errHtml);
    } finally {
      this._loadingProducts = false;
    }
  },

  async buscarClientes(q) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, q, limit: '15', habilitado: 'SI', _: Date.now() });
    const data = await F.fetchJson(`/api/clientes?${params}`);
    return data.rows || [];
  },

  async guardarFechaDocumento(fecha) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const actual = DocFecha.inputValueFromHeader(this._pedido.header);
    if (fecha === actual) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FECHA: fecha }),
    });
    this.renderHeaderInfo();
    F.toast('Fecha actualizada', 'success');
  },

  async fetchVendedores(force = false) {
    if (!force && this._vendedores.length) return this._vendedores;
    const data = await F.fetchJson(this.apiUrl('/vendedores', { _: Date.now() }));
    this._vendedores = F.ensureVendedoresForSession(data.rows || []);
    return this._vendedores;
  },

  /** Admin sin CODVEN: asigna el CODEMPLEADO de sesión al documento. */
  async maybeApplyDefaultVendedor() {
    const h = this._pedido?.header;
    if (!this.docEditable(h) || this.hasVendedor(h)) return;
    if (!F.isAdminOrSuperUser()) return;
    const codven = F.defaultCodvenFromSession(this._vendedores);
    if (codven == null) return;
    await this.guardarVendedorDocumento(String(codven), { silent: true });
  },

  async reloadVendedoresOptions() {
    const sel = this._container?.querySelector('#vp-doc-vendedor');
    const btn = this._container?.querySelector('.btn-refresh-vendedores');
    if (!sel || btn?.disabled) return;
    const current = String(sel.value || '').trim();
    const icon = btn?.querySelector('i');
    if (btn) btn.disabled = true;
    if (icon) icon.className = 'fa-solid fa-spinner fa-spin';
    try {
      await this.fetchVendedores(true);
      const opts = (this._vendedores || [])
        .map((v) => `<option value="${v.CODEMPLEADO}">${this.escapeHtml(v.NOMEMPLEADO)}</option>`)
        .join('');
      sel.innerHTML = `<option value="">— Seleccione —</option>${opts}`;
      if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
      F.toast('Vendedores actualizados', 'success');
    } finally {
      const editable = this.docEditable(this._pedido?.header);
      if (btn) btn.disabled = !editable;
      if (icon) icon.className = 'fa-solid fa-rotate';
    }
  },

  async guardarVendedorDocumento(codven, opts = {}) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const h = this._pedido.header;
    const actual = h.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
    const next = codven || '';
    if (next === actual) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODVEN: next ? parseInt(next, 10) : null }),
    });
    this.renderHeaderInfo();
    this.syncVendedorEmphasis();
    if (!opts.silent) F.toast('Vendedor actualizado', 'success');
  },

  async guardarTipofacDocumento(tipofac) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const next = String(tipofac || 'FEF').trim().toUpperCase() || 'FEF';
    const actual = String(this._pedido.header?.TIPOFAC || 'FEF').trim().toUpperCase() || 'FEF';
    if (next === actual) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ TIPOFAC: next }),
    });
    this.renderHeaderInfo();
    F.toast('Tipo documento actualizado', 'success');
  },

  async guardarPrioridadDocumento(prioridad) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const next = String(prioridad || 'BAJA').trim().toUpperCase() || 'BAJA';
    const actual = String(this._pedido.header?.PRIORIDAD || 'BAJA').trim().toUpperCase() || 'BAJA';
    if (next === actual) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ PRIORIDAD: next }),
    });
    this.renderHeaderInfo();
    F.toast('Prioridad actualizada', 'success');
  },

  async aplicarCliente(codcliente) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._pedido?.header)) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODCLIENTE: codcliente }),
    });
    this.renderHeaderInfo();
    this.syncClienteSearchEmphasis();
    F.toast('Cliente actualizado', 'success');
  },

  /** Modal con resultados (reemplaza el desplegable bajo el campo). */
  async openClienteBusquedaModal(initialQ = '') {
    const h = this._pedido?.header;
    if (!this.docEditable(h)) return;
    const q0 = String(initialQ ?? '').trim();
    if (q0.length < 2) {
      F.toast('Escriba al menos 2 caracteres para buscar', 'info');
      return;
    }
    try {
      await Swal.fire({
        title: 'Buscar cliente',
        html: `
          <label class="form-label small text-start d-block mb-1" for="vp-swal-cliente-q">Nombre, negocio o NIT</label>
          <input type="search" class="form-control form-control-sm mb-2" id="vp-swal-cliente-q" autocomplete="off"
            placeholder="Escriba para buscar…">
          <div id="vp-swal-cliente-list" class="list-group text-start" style="max-height:min(50vh,280px);overflow-y:auto;"></div>`,
        width: 'min(100%, 28rem)',
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        focusCancel: false,
        didOpen: (popup) => {
          const inp = popup.querySelector('#vp-swal-cliente-q');
          const listEl = popup.querySelector('#vp-swal-cliente-list');
          if (inp) {
            inp.value = q0;
            inp.focus();
            inp.select();
          }
          const renderRows = (rows) => {
            if (!rows.length) {
              listEl.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
              return;
            }
            listEl.innerHTML = rows
              .map((c) => {
                const label =
                  [c.TIPONEGOCIO, c.NEGOCIO, c.NOMBRECLIENTE].map((v) => String(v || '').trim()).filter(Boolean).join(' · ') ||
                  String(c.CODCLIENTE);
                return `<button type="button" class="list-group-item list-group-item-action small text-start"
                  data-codcliente="${c.CODCLIENTE}">
                  <strong>${this.escapeHtml(label)}</strong>
                  <span class="text-muted d-block">${this.escapeHtml(c.NIT || '')}</span>
                </button>`;
              })
              .join('');
          };
          const runSearch = async () => {
            const q = String(inp?.value || '').trim();
            if (q.length < 2) {
              listEl.innerHTML = '<div class="list-group-item small text-muted">Escriba al menos 2 caracteres</div>';
              return;
            }
            listEl.innerHTML =
              '<div class="list-group-item small text-muted"><i class="fa-solid fa-spinner fa-spin me-1"></i>Buscando…</div>';
            try {
              const rows = await this.buscarClientes(q);
              renderRows(rows);
            } catch (err) {
              listEl.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
            }
          };
          listEl.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-codcliente]');
            if (!btn) return;
            const cod = parseInt(btn.getAttribute('data-codcliente'), 10);
            const label = btn.querySelector('strong')?.textContent?.trim() || '';
            Swal.close();
            await this.aplicarCliente(cod);
            const mainInp = this._container?.querySelector('#vp-cliente-search');
            if (mainInp) mainInp.value = label;
          });
          inp?.addEventListener('input', F.debounce(runSearch, 300));
          runSearch();
        },
      });
    } catch (err) {
      F.toast(err.message || 'Error al buscar cliente', 'error');
    }
  },

  async onNuevoCliente() {
    if (!this.docEditable(this._pedido?.header)) {
      F.toast('El pedido no está en edición', 'warning');
      return;
    }
    const data = await ClientesView.showForm('Nuevo cliente', {}, false, { profile: 'facturacion' });
    if (!data) return;
    try {
      const res = await F.fetchJson(ClientesView.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const cod = res.CODCLIENTE;
      if (!cod) throw new Error('No se recibió el código del cliente');
      await this.aplicarCliente(cod);
      const inp = this._container?.querySelector('#vp-cliente-search');
      if (inp) inp.value = data.NOMBRECLIENTE || data.NEGOCIO || String(cod);
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async openHistorialFacturasCliente() {
    const h = this._pedido?.header;
    const codcliente = Number(h?.CODCLIENTE);
    if (!Number.isFinite(codcliente) || codcliente <= 0 || !this.hasCliente(h)) {
      F.toast('Seleccione un cliente primero', 'warning');
      return;
    }
    const clienteNombre = String(h.DOC_NOMCLIE || h.CLI_NOMBRE || '').trim();
    await ClienteHistorialPreciosUI.open({ codcliente, clienteNombre });
  },

  async showList() {
    this._screen = 'list';
    this._listViewMode = 'table';
    this.destroyListMap();
    this._pedido = null;
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('vp');
    try {
      await DocTipoSelect.reloadTiposDocumento(this);
    } catch (err) {
      console.warn('[VendedorPedidos] reload tipodocumentos:', err?.message || err);
      if (this._config) DocTipoSelect.initView(this);
    }
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async showEditor(coddoc, correlativo, opts = {}) {
    if (!opts.skipAuth && coddoc != null && correlativo != null && correlativo !== '') {
      if (typeof CatalogosUI !== 'undefined') {
        const allowed = await CatalogosUI.gateEditarDocumento({
          coddoc,
          correlativo,
          tipodoc: 'PED',
          label: `${coddoc} #${correlativo}`,
        });
        if (!allowed) return;
      }
    }
    this._screen = 'editor';
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('vp');
    if (coddoc && correlativo) {
      await this.loadPedido(coddoc, correlativo, { skipRender: true });
    }
    await this.fetchVendedores();
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    PosDocSearchUI.resetProductSearch(this, 'vp');
    this.renderAll();
    await this.maybeApplyDefaultVendedor();
    if (opts.focusProductSearch) {
      PosDocSearchUI.focusProductSearch(this._container, 'vp');
    }
  },

  async onNuevoPedido() {
    try {
      if (this._container?.querySelector('#vp-list-coddoc')) {
        DocTipoSelect.syncFromDom(this._container, 'vp-list-coddoc', this);
      }
      await this.crearPedido();
      const key = this.docKey();
      if (key) {
        await this.showEditor(key.coddoc, key.correlativo, {
          skipAuth: true,
        });
      }
    } catch (err) {
      F.toast(err.message || 'Error al crear pedido', 'error');
    }
  },

  async load(container) {
    PosDocSearchUI.clearActiveDocKeyboard();
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando POS…</div>`;

    try {
      this._selectedCoddoc = '';
      this._config = await this.fetchConfig();
      DocTipoSelect.initView(this);
      if (!this._config.coddocDefault) {
        container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento <strong>ENV</strong> (pedidos) activo para esta empresa.
          </div>`;
        return;
      }
      await this.showList();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};

if (typeof window !== 'undefined') {
  window.VendedorPedidosView = VendedorPedidosView;
}
