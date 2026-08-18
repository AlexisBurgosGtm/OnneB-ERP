/**
 * Vista POS — Pedidos de mostrador (DOCUMENTOS + DOCPRODUCTOS).
 */
const PosView = {
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
    return `<div class="pos-prod-des2 small text-muted">${this.escapeHtml(des2)}</div>`;
  },

  formatFechaPedido(row) {
    return DocFecha.formatDisplay(row);
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
    const inp = this._container?.querySelector('#pos-cliente-search');
    if (!inp) return;
    const highlight = this.docEditable(h) && !this.hasCliente(h);
    inp.classList.toggle('pos-cliente-search-required', highlight);
  },

  syncVendedorEmphasis() {
    const h = this._pedido?.header;
    const sel = this._container?.querySelector('#pos-doc-vendedor');
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
    return String(this._config?.permiteCambiarPrecio || 'NO').trim().toUpperCase() === 'SI';
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
      this._container?.querySelector('#pos-cliente-search')?.focus();
      return;
    }

    const solicitaClave = await DocVendedorClave.shouldSolicitarClave();
    if (solicitaClave) {
      const ok = await DocVendedorClave.promptAndApply({
        apiLookupUrl: `/api/pos/vendedores/por-clave?empnit=${encodeURIComponent(F.getEmpNit())}`,
        vendedorSelectId: '#pos-doc-vendedor',
        view: this,
      });
      if (!ok) return;
    } else if (!this.hasVendedor(h)) {
      F.toast('Seleccione un vendedor antes de finalizar', 'warning');
      this.syncVendedorEmphasis();
      this._container?.querySelector('#pos-doc-vendedor')?.focus();
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
            id: 'pos-finalizar-tipofac',
            selected: h.TIPOFAC || tipofacDefault,
          })
        : '';
    const prioridadHtml =
      typeof DocTipofacPrioridad !== 'undefined'
        ? DocTipofacPrioridad.prioridadSelectHtml({
            id: 'pos-finalizar-prioridad',
            selected: h.PRIORIDAD || 'BAJA',
          })
        : '';
    const entregaHtml =
      typeof DocEntrega !== 'undefined'
        ? DocEntrega.fieldsHtml({
            prefix: 'pos',
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
            <label class="form-label small mb-0" for="pos-finalizar-nomclie">Nombre cliente</label>
            <input type="text" id="pos-finalizar-nomclie" class="form-control form-control-sm"
              value="${this.escapeHtml(nomRaw)}" autocomplete="off">
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0" for="pos-finalizar-dirclie">Dirección cliente</label>
            <input type="text" id="pos-finalizar-dirclie" class="form-control form-control-sm"
              value="${this.escapeHtml(dirRaw)}" autocomplete="off">
          </div>
          ${tipofacHtml}
          ${prioridadHtml}
          ${entregaHtml}
          <div class="mb-0">
            <label class="form-label small mb-0" for="pos-finalizar-obs">Observaciones</label>
            <textarea id="pos-finalizar-obs" class="form-control form-control-sm" rows="3"
              placeholder="Observaciones del pedido…">${obsVal}</textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        if (typeof DocEntrega !== 'undefined') DocEntrega.bindToggle('pos');
        document.getElementById('pos-finalizar-nomclie')?.focus();
      },
      preConfirm: () => {
        const nom = document.getElementById('pos-finalizar-nomclie')?.value?.trim() || '';
        if (!nom) {
          Swal.showValidationMessage('Ingrese el nombre del cliente');
          return false;
        }
        const entrega =
          typeof DocEntrega !== 'undefined'
            ? DocEntrega.readFromDom('pos')
            : { error: 'DocEntrega no disponible' };
        if (entrega.error) {
          Swal.showValidationMessage(entrega.error);
          return false;
        }
        return {
          OBS: document.getElementById('pos-finalizar-obs')?.value?.trim() || '',
          DOC_NOMCLIE: nom,
          DOC_DIRCLIE: document.getElementById('pos-finalizar-dirclie')?.value?.trim() || '',
          F_ENTREGA: entrega.F_ENTREGA,
          DIRENTREGA: entrega.DIRENTREGA,
          TIPOFAC:
            typeof DocTipofacPrioridad !== 'undefined'
              ? DocTipofacPrioridad.readTipofacFromDom('pos-finalizar-tipofac')
              : 'FEF',
          PRIORIDAD:
            typeof DocTipofacPrioridad !== 'undefined'
              ? DocTipofacPrioridad.readPrioridadFromDom('pos-finalizar-prioridad')
              : 'BAJA',
        };
      },
    });

    if (!isConfirmed) return;

    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
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
    F.toast('Producto agregado', 'success');
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
    F.toast('PSE agregado', 'success');
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
        <label class="form-label small mb-0 text-start d-block" for="pos-swal-pse-desprod">Descripción</label>
        <input type="text" id="pos-swal-pse-desprod" class="form-control form-control-sm" placeholder="Descripción del producto" autocomplete="off">
        <div class="row g-2 mt-1">
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="pos-swal-pse-cant">Cantidad</label>
            <input type="number" id="pos-swal-pse-cant" class="form-control form-control-sm" value="1" min="0" step="any">
          </div>
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="pos-swal-pse-costo">Costo unit.</label>
            <input type="number" id="pos-swal-pse-costo" class="form-control form-control-sm" value="0" min="0" step="any">
          </div>
          <div class="col-4">
            <label class="form-label small mb-0 text-start d-block" for="pos-swal-pse-precio">Precio unit.</label>
            <input type="number" id="pos-swal-pse-precio" class="form-control form-control-sm" value="0" min="0" step="any">
          </div>
        </div>
        <p class="small fw-semibold text-end mb-0 mt-2" id="pos-swal-pse-subtotal">Subtotal: ${this.escapeHtml(this.formatMoney(0))}</p>
      `,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Agregar') : 'Agregar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const cantInp = document.getElementById('pos-swal-pse-cant');
        const precioInp = document.getElementById('pos-swal-pse-precio');
        const subEl = document.getElementById('pos-swal-pse-subtotal');
        const updateSub = () => {
          const cant = Number(cantInp?.value) || 0;
          const precio = Number(precioInp?.value) || 0;
          if (subEl) subEl.textContent = `Subtotal: ${this.formatMoney(cant * precio)}`;
        };
        cantInp?.addEventListener('input', updateSub);
        precioInp?.addEventListener('input', updateSub);
        if (typeof PosProductKeyboardUI !== 'undefined') {
          PosProductKeyboardUI.focusInput(document.getElementById('pos-swal-pse-desprod'));
        } else {
          document.getElementById('pos-swal-pse-desprod')?.focus();
        }
      },
      preConfirm: () => {
        const desprod = String(document.getElementById('pos-swal-pse-desprod')?.value || '').trim();
        if (!desprod) {
          Swal.showValidationMessage('La descripción es obligatoria');
          return false;
        }
        const cantidad = Number(document.getElementById('pos-swal-pse-cant')?.value);
        const costo = Number(document.getElementById('pos-swal-pse-costo')?.value);
        const precio = Number(document.getElementById('pos-swal-pse-precio')?.value);
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
    const tbody = this._container?.querySelector('#pos-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-pos-finalizar');
    if (fab) fab.disabled = busy;
    const barcodeFab = this._container?.querySelector('#pos-fab-barcode');
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

  async promptEditarPrecioLinea(line) {
    const current = Number(line?.PRECIO) || 0;
    const label = `${line?.CODPROD || ''} ${line?.DESPROD || ''}`.trim();
    const result = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Cambiar precio unitario',
      html: `<p class="small text-muted mb-2">${this.escapeHtml(label)}</p>
        <label class="form-label small mb-0" for="pos-cart-precio-edit">Precio</label>
        <input type="number" id="pos-cart-precio-edit" class="form-control form-control-sm" value="${current}" min="0" step="any">`,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Guardar') : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      didOpen: () => {
        const inp = document.getElementById('pos-cart-precio-edit');
        inp?.focus();
        inp?.select();
      },
      preConfirm: () => {
        const precio = Number(document.getElementById('pos-cart-precio-edit')?.value);
        if (!Number.isFinite(precio) || precio < 0) {
          Swal.showValidationMessage('Precio inválido');
          return false;
        }
        return precio;
      },
    });
    if (!result.isConfirmed) return null;
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
        <select id="pos-swal-medida" class="form-select form-select-sm">${options}</select>
        <div class="row g-2 mt-2 align-items-start">
          <div class="col-6">
            <label class="form-label small mb-0" for="pos-swal-cant">Cantidad</label>
            <input type="number" id="pos-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0" for="pos-swal-precio">Precio</label>
            ${
              permiteCambiarPrecio
                ? `<input type="number" id="pos-swal-precio" class="form-control form-control-sm" value="${defaultPrecio}" min="0" step="any">`
                : `<input type="text" id="pos-swal-precio" class="form-control form-control-sm bg-light" value="${this.escapeHtml(this.formatMoney(defaultPrecio))}" readonly>`
            }
          </div>
        </div>
        ${
          showCosto
            ? `<p class="small text-danger fw-semibold mb-0 mt-2 text-end" id="pos-swal-costo">Costo: ${this.escapeHtml(this.formatMoney(defaultCosto))}</p>`
            : ''
        }
        <p class="small text-muted mb-0 mt-2 text-end" id="pos-swal-total">Total: ${this.escapeHtml(this.formatMoney(defaultPrecio))}</p>
        <p class="small mb-0 mt-2 text-center" id="authz-precio-status"></p>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: (popup) => {
        const medSel = document.getElementById('pos-swal-medida');
        const cantInp = document.getElementById('pos-swal-cant');
        const precioInp = document.getElementById('pos-swal-precio');
        const costoEl = document.getElementById('pos-swal-costo');
        const totalEl = document.getElementById('pos-swal-total');
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
        if (permiteCambiarPrecio && solicitaAuth && typeof AutorizacionesUI !== 'undefined') {
          authGate = AutorizacionesUI.wirePrecioAuthGate({
            popup,
            precioInput: precioInp,
            medidaSelect: medSel,
            cantidadInput: cantInp,
            priceByMedida,
            permiteCambiarPrecio,
            solicitaAutorizaciones: true,
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
        const cant = Number(document.getElementById('pos-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        const medida = document.getElementById('pos-swal-medida')?.value;
        if (!medida) {
          Swal.showValidationMessage('Seleccione una medida');
          return false;
        }
        if (permiteCambiarPrecio) {
          const precio = Number(document.getElementById('pos-swal-precio')?.value);
          if (!Number.isFinite(precio) || precio < 0) {
            Swal.showValidationMessage('Precio inválido');
            return false;
          }
          const catalog = Number(priceByMedida[String(medida)] ?? 0) || 0;
          if (
            solicitaAuth &&
            typeof AutorizacionesUI !== 'undefined' &&
            !AutorizacionesUI.precioChangeAllowed(precio, catalog)
          ) {
            Swal.showValidationMessage('Espere la autorización del administrador');
            return false;
          }
          return { medida, cantidad: cant, precio };
        }
        return { medida, cantidad: cant };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad, picked.precio);
      if (solicitaAuth && picked.precio != null && typeof AutorizacionesUI !== 'undefined') {
        AutorizacionesUI.consumePrecioGrant();
      }
    }
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'pos');
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
          ? `<div class="pos-prod-cost small text-danger fw-semibold">Costo: ${this.escapeHtml(this.formatMoney(costo))}</div>`
          : '';
        return `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(this.formatProdLabel(p.DESPROD, p.DESMARCA))} ${this.escapeHtml(p.CODMEDIDA)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA)}</div>
              <div>${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
              ${this.renderDesprod2Html(p)}
            </div>
            <div class="pos-prod-meta text-end">
              <div class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</div>
              <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.PRECIO))}</div>
              ${costoHtml}
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
    const tbody = this._container?.querySelector('#pos-cart-tbody');
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
          : `<span class="pos-cart-unit-price small text-nowrap">${this.escapeHtml(unitPrice)}</span>`;
        const qtyCell = `<div class="pos-cart-qty-price d-flex align-items-center justify-content-center gap-2 flex-wrap">
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
    const totalEl = this._container?.querySelector('#pos-header-total');
    const itemsEl = this._container?.querySelector('#pos-header-items');
    const docEl = this._container?.querySelector('#pos-header-doc');
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
    const cliente = this._container?.querySelector('#pos-cliente-nombre');
    const h = this._pedido?.header;
    if (cliente && h) {
      cliente.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#pos-cliente-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
    const fechaInp = this._container?.querySelector('#pos-doc-fecha');
    if (fechaInp && h && !fechaInp.matches(':focus')) {
      fechaInp.value = DocFecha.inputValueFromHeader(h);
    }
    const vendedorSel = this._container?.querySelector('#pos-doc-vendedor');
    if (vendedorSel && h && document.activeElement !== vendedorSel) {
      const codven = h.CODVEN != null && h.CODVEN !== '' ? String(h.CODVEN) : '';
      vendedorSel.value = codven;
    }
    const tipofacSel = this._container?.querySelector('#pos-doc-tipofac');
    if (tipofacSel && h && document.activeElement !== tipofacSel) {
      tipofacSel.value = String(h.TIPOFAC || 'FEF').trim().toUpperCase() || 'FEF';
    }
    const prioridadSel = this._container?.querySelector('#pos-doc-prioridad');
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
      <div class="pos-precio-campo-wrap ms-auto">
        <select class="form-select form-select-sm" id="pos-precio-campo" title="Columna de precio"${disabled}>
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
      <div class="pos-doc-vendedor-wrap">
        <label class="form-label small mb-0" for="pos-doc-vendedor">Vendedor <span class="text-danger">*</span></label>
        <div class="input-group input-group-sm">
          <select class="form-select form-select-sm" id="pos-doc-vendedor"${disabled}>
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
      tipofacId: 'pos-doc-tipofac',
      prioridadId: 'pos-doc-prioridad',
      tipofac: h?.TIPOFAC || 'FEF',
      prioridad: h?.PRIORIDAD || 'BAJA',
      disabled: !this.docEditable(h),
    });
  },

  syncEditorControls() {
    const editable = this.docEditable(this._pedido?.header);
    PosDocSearchUI.syncControls(this._container, 'pos', editable);
    [
      '#pos-cliente-search',
      '#pos-doc-fecha',
      '#pos-doc-vendedor',
      '#pos-doc-tipofac',
      '#pos-doc-prioridad',
      '#pos-precio-campo',
      '#pos-cliente-nuevo',
      '#pos-btn-agregar-pse',
      '.btn-refresh-vendedores',
    ].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-pos-finalizar');
    if (fab) fab.style.display = editable ? '' : 'none';
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
        title: 'Pedido de mostrador',
        header: pedido.header,
        lines: pedido.lines || [],
      });
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const tbody = this._container?.querySelector('#pos-list-tbody');
    if (tbody) tbody.innerHTML = this.renderListTableBodyHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredPedidosList().length} pedido(s) operados`;
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
      return `<tr><td colspan="8" class="text-center text-muted py-4">No hay pedidos operados</td></tr>`;
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const cliente = r.DOC_NOMCLIE || r.NEGOCIO || 'Sin cliente';
        const negocio = [r.TIPONEGOCIO, r.NEGOCIO].filter(Boolean).join(' · ') || '—';
        const entrega =
          typeof DocEntrega !== 'undefined' ? DocEntrega.formatListLabel(r) : String(r.F_ENTREGA || '').trim();
        return `
          <tr class="pos-list-row" data-coddoc="${this.escapeHtml(r.CODDOC)}" data-correlativo="${r.CORRELATIVO}">
            <td class="fw-semibold text-nowrap">${this.escapeHtml(label)}</td>
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
                <th scope="col">Cliente</th>
                <th scope="col" class="doc-list-col-optional">Negocio</th>
                <th scope="col" class="doc-list-col-optional">Entrega</th>
                <th scope="col" class="text-center doc-list-col-optional">Líneas</th>
                <th scope="col" class="text-end">Total</th>
                <th scope="col" class="doc-list-col-optional">Fecha</th>
                <th scope="col" class="text-end fac-list-actions">Acciones</th>
              </tr>
            </thead>
            <tbody id="pos-list-tbody">${this.renderListTableBodyHtml()}</tbody>
          </table>
        </div>
      </div>`;
  },

  renderListScreen() {
    const count = this.filteredPedidosList().length;
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Seleccione un pedido o cree uno nuevo</h2>
          <p class="pos-list-sub text-muted mb-0">${count} pedido(s) operados</p>
        </div>
        <div class="pos-list-toolbar mb-3">
          ${DocTipoSelect.renderSelectHtml({
            selectId: 'pos-list-coddoc',
            tipos: this._config?.tiposDocumento,
            selected: this.activeCoddoc(),
            label: 'Serie',
          })}
          <div class="pos-list-search flex-grow-1">
            <label class="form-label small mb-1" for="pos-list-search">Buscar</label>
            <div class="input-group">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control pos-search-glow" id="pos-list-search"
                placeholder="Buscar pedido, cliente, negocio…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
            </div>
          </div>
        </div>
        ${this.renderListTableHtml()}
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-pos-list-nuevo"
          aria-label="Nuevo pedido" title="Nuevo pedido"${this.activeCoddoc() ? '' : ' disabled'}>
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderEditorShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Pedidos';
    const editable = this.docEditable(this._pedido?.header);
    return `
      <div class="pos-vista-wrap">
        <div class="pos-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="pos-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-pos-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="pos-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">'}
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="pos-header-doc">${this.escapeHtml(this.docLabel())}</div>
              <div class="pos-doc-meta-fields d-flex flex-wrap align-items-end gap-2">
                ${DocFecha.renderField('pos-doc-fecha', this._pedido?.header)}
                ${this.renderVendedorField()}
                ${this.renderTipofacPrioridadFields()}
              </div>
              <div class="pos-header-summary ms-auto text-end">
                <h3 class="pos-header-total mb-0" id="pos-header-total">Q 0.00</h3>
                <div class="pos-header-items" id="pos-header-items">0 items</div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap w-100">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
              ${this.renderPrecioCampoSelector(editable)}
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="pos-product-search"
                  placeholder="Código o descripción… (Enter)" autocomplete="off"${editable ? '' : ' disabled'}>
                <button type="button" class="btn btn-outline-secondary text-nowrap" id="pos-btn-agregar-pse"
                  title="Agregar producto sin existencia"${editable ? '' : ' disabled'}>Agregar PSE</button>
              </div>
              <div class="pos-product-list" id="pos-product-list"></div>
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
              <div class="pos-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Cliente</label>
                <div class="input-group input-group-sm">
                  ${ClienteHistorialPreciosUI.buttonHtml('pos-cliente-historial')}
                  <input type="search" class="form-control pos-search-glow" id="pos-cliente-search"
                    placeholder="Buscar cliente… (requerido)" autocomplete="off"${editable ? '' : ' disabled'}>
                  <button type="button" class="btn btn-outline-primary text-nowrap" id="pos-cliente-nuevo"
                    title="Crear cliente nuevo"${editable ? '' : ' disabled'}>NUEVO (+)</button>
                </div>
                <div id="pos-cliente-nombre" class="small text-muted mt-1"></div>
                <div id="pos-cliente-results" class="list-group position-absolute w-100 shadow-sm d-none"
                  style="z-index: 20; max-height: 200px; overflow-y: auto;"></div>
              </div>
              <div class="pos-cart-table flex-grow-1 d-flex flex-column">
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
                    <tbody id="pos-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml('pos') : ''}
        ${PosDocSearchUI.productModalHtml('pos')}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#pos-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    DocTipoSelect.bind(this._container, 'pos-list-coddoc', this, () => this.refreshListDom());

    this._container?.querySelector('#pos-list-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.inv-card-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const row = btn.closest('.pos-list-row');
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
    });

    this._container?.querySelector('#btn-pos-list-nuevo')?.addEventListener('click', () => this.onNuevoPedido());

    PosDocSearchUI.bindDocKeyboard(this, {
      isDetail: () => false,
      onNuevo: () => this.onNuevoPedido(),
    });
  },

  bindEditorEvents() {
    PosDocSearchUI.bind(this, 'pos', {
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

    const precioCampoSel = this._container?.querySelector('#pos-precio-campo');
    if (precioCampoSel) {
      precioCampoSel.addEventListener('change', () => {
        if (precioCampoSel.disabled) return;
        this._precioCampo = precioCampoSel.value || 'PRECIO';
        const q = this._container?.querySelector('#pos-product-search')?.value?.trim() || '';
        if (q) this.buscarProductos(q).catch((err) => F.toast(err.message, 'error'));
      });
    }

    this._container?.querySelector('#pos-cliente-nuevo')?.addEventListener('click', () => {
      this.onNuevoCliente().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#pos-cliente-historial')?.addEventListener('click', () => {
      this.openHistorialFacturasCliente().catch((err) => F.toast(err.message, 'error'));
    });

    this._container?.querySelector('#pos-btn-agregar-pse')?.addEventListener('click', () => {
      this.onAgregarPse().catch((err) => F.toast(err.message || 'Error al agregar PSE', 'error'));
    });

    this._container?.querySelector('#pos-cart-tbody')?.addEventListener('click', async (e) => {
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

    this._container?.querySelector('#btn-pos-atras')?.addEventListener('click', () => this.showList());
    this._container?.querySelector('#btn-pos-finalizar')?.addEventListener('click', () => {
      this.finalizarPedido().catch((err) => F.toast(err.message, 'error'));
    });

    const fechaInp = this._container?.querySelector('#pos-doc-fecha');
    if (fechaInp) {
      fechaInp.addEventListener('change', () => {
        if (fechaInp.disabled) return;
        const val = fechaInp.value?.trim();
        if (!val) return;
        this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const vendedorSel = this._container?.querySelector('#pos-doc-vendedor');
    if (vendedorSel) {
      vendedorSel.addEventListener('change', () => {
        if (vendedorSel.disabled) return;
        const val = vendedorSel.value?.trim();
        this.guardarVendedorDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const tipofacSel = this._container?.querySelector('#pos-doc-tipofac');
    if (tipofacSel) {
      tipofacSel.addEventListener('change', () => {
        if (tipofacSel.disabled) return;
        this.guardarTipofacDocumento(tipofacSel.value).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const prioridadSel = this._container?.querySelector('#pos-doc-prioridad');
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

    const clienteSearch = this._container?.querySelector('#pos-cliente-search');
    const clienteList = this._container?.querySelector('#pos-cliente-results');
    if (clienteSearch && clienteList) {
      const runCli = F.debounce(async () => {
        const q = clienteSearch.value.trim();
        if (q.length < 2) {
          clienteList.classList.add('d-none');
          return;
        }
        try {
          const rows = await this.buscarClientes(q);
          if (!rows.length) {
            clienteList.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
          } else {
            clienteList.innerHTML = rows
              .map(
                (c) =>
                  `<button type="button" class="list-group-item list-group-item-action small"
                    data-codcliente="${c.CODCLIENTE}">
                    <strong>${this.escapeHtml([c.TIPONEGOCIO, c.NEGOCIO, c.NOMBRECLIENTE].map((v) => String(v || '').trim()).filter(Boolean).join(' · ') || String(c.CODCLIENTE))}</strong>
                    <span class="text-muted d-block">${this.escapeHtml(c.NIT || '')}</span>
                  </button>`
              )
              .join('');
          }
          clienteList.classList.remove('d-none');
        } catch (err) {
          clienteList.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
          clienteList.classList.remove('d-none');
        }
      }, 350);
      clienteSearch.addEventListener('input', runCli);
      clienteList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-codcliente]');
        if (!btn) return;
        const cod = parseInt(btn.getAttribute('data-codcliente'), 10);
        clienteList.classList.add('d-none');
        await this.aplicarCliente(cod);
      });
      if (typeof PosProductKeyboardUI !== 'undefined') {
        PosProductKeyboardUI.bindPartyResultsKeyboard(clienteSearch, clienteList, {
          itemSelector: 'button[data-codcliente]',
        });
      }
      document.addEventListener('click', (e) => {
        if (!clienteSearch.contains(e.target) && !clienteList.contains(e.target)) {
          clienteList.classList.add('d-none');
        }
      });
    }
  },

  async buscarProductos(q) {
    const term = String(q ?? '').trim();
    if (!term) {
      PosDocSearchUI.resetProductSearch(this, 'pos');
      return;
    }
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'pos', spinner);
    try {
      const data = await this.fetchProductos(term);
      this._productos = data.rows || [];
      if (!this._productos.length) {
        PosDocSearchUI.setListsHtml(
          this._container,
          'pos',
          '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
        );
        return;
      }
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'pos', errHtml);
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
    const sel = this._container?.querySelector('#pos-doc-vendedor');
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
      const inp = this._container?.querySelector('#pos-cliente-search');
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
    this._pedido = null;
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('pos');
    try {
      await DocTipoSelect.reloadTiposDocumento(this);
    } catch (err) {
      console.warn('[POS] reload tipodocumentos:', err?.message || err);
      if (this._config) DocTipoSelect.initView(this);
    }
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async showEditor(coddoc, correlativo, opts = {}) {
    this._screen = 'editor';
    PosDocSearchUI.unbindDocKeyboard(this);
    PosDocSearchUI.teardown('pos');
    if (coddoc && correlativo) {
      await this.loadPedido(coddoc, correlativo, { skipRender: true });
    }
    await this.fetchVendedores();
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    PosDocSearchUI.resetProductSearch(this, 'pos');
    this.renderAll();
    await this.maybeApplyDefaultVendedor();
    if (opts.focusProductSearch) {
      PosDocSearchUI.focusProductSearch(this._container, 'pos');
    }
  },

  async onNuevoPedido() {
    try {
      if (this._container?.querySelector('#pos-list-coddoc')) {
        DocTipoSelect.syncFromDom(this._container, 'pos-list-coddoc', this);
      }
      await this.crearPedido();
      const key = this.docKey();
      if (key) await this.showEditor(key.coddoc, key.correlativo, { focusProductSearch: true });
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
