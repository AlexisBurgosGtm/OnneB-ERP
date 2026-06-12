/**
 * Vista Compras — documentos COM (DOCUMENTOS + DOCPRODUCTOS).
 */
const ComprasView = {
  _container: null,
  _config: null,
  _compra: null,
  _productos: [],
  _comprasList: [],
  _listFilter: '',
  _screen: 'list',
  _loadingProducts: false,
  _searchTimer: null,
  _cartBusy: false,

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
    return `/api/compras${segment}?${params}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
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

  formatFechaCompra(row) {
    if (!row?.FECHA) return '—';
    const s = String(row.FECHA).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
  },

  docKey() {
    if (!this._compra?.header) return null;
    const h = this._compra.header;
    return { coddoc: h.CODDOC, correlativo: Number(h.CORRELATIVO) };
  },

  docLabel() {
    const h = this._compra?.header;
    if (!h) return 'Sin compra';
    return `${h.CODDOC} #${h.CORRELATIVO}`;
  },

  lineId(ln) {
    return ln?.ID ?? ln?.Id ?? null;
  },

  findLineById(id) {
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    return (this._compra?.lines || []).find((l) => Number(this.lineId(l)) === n) || null;
  },

  usuario() {
    const u = F.session('user');
    return u?.username || 'COMPRAS';
  },

  proveedorLabel(h) {
    if (!h) return '—';
    const emp = String(h.PROV_EMPRESA || '').trim();
    const raz = String(h.PROV_RAZON || h.DOC_NOMCLIE || '').trim();
    if (emp && raz && emp !== raz) return `${emp} — ${raz}`;
    return emp || raz || '—';
  },

  hasProveedor(h) {
    const cod = h?.CODPROV ?? h?.CODCLIENTE;
    return cod != null && cod !== '' && Number(cod) > 0;
  },

  async fetchConfig() {
    return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
  },

  async fetchProductos(q) {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40' });
    if (q) params.set('q', q);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/compras/productos?${params}`);
  },

  async fetchComprasList() {
    const coddoc = this._config?.coddocDefault || '';
    const params = new URLSearchParams({ empnit: F.getEmpNit(), status: 'O' });
    if (coddoc) params.set('coddoc', coddoc);
    params.set('_', String(Date.now()));
    const data = await F.fetchJson(`/api/compras/compras?${params}`);
    this._comprasList = data.rows || [];
    return this._comprasList;
  },

  filteredComprasList() {
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return this._comprasList;
    return this._comprasList.filter((r) => {
      const hay = [
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.EMPRESA,
        r.RAZONSOCIAL,
        r.OBS,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async loadCompra(coddoc, correlativo, opts = {}) {
    const url = `/api/compras/compras/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    this._compra = await F.fetchJson(url);
    if (this._screen === 'editor' && !opts.skipRender) this.renderAll();
  },

  async crearCompra() {
    const body = {
      CODDOC: this._config?.coddocDefault,
      CODPROV: this._config?.proveedorDefault?.CODPROV,
      USUARIO: this.usuario(),
    };
    const url = `/api/compras/compras?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Nueva compra creada', 'success');
  },

  docEditable(header) {
    return DocFecha.editableStatus(header?.STATUS);
  },

  todayInputValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  async finalizarCompra() {
    const key = this.docKey();
    if (!key) return;
    const h = this._compra?.header;
    if (!this.docEditable(h)) {
      F.toast('La compra no está operada', 'warning');
      return;
    }
    if (!(this._compra?.lines || []).length) {
      F.toast('Agregue al menos un producto', 'warning');
      return;
    }
    if (!this.hasProveedor(h)) {
      F.toast('Seleccione un proveedor antes de finalizar', 'warning');
      return;
    }

    const proveedor = this.escapeHtml(this.proveedorLabel(h));
    const dir = this.escapeHtml(h.DOC_DIRCLIE || h.PROV_DIR || '—');
    const obsVal = this.escapeHtml(h.OBS || '');
    const seriefacVal = this.escapeHtml(h.SERIEFAC || '');
    const nofacVal = this.escapeHtml(h.NOFAC || '');
    const concreVal = String(h.CONCRE || 'CON').trim().toUpperCase();
    const vencDefault = DocFecha.inputValueFromHeader(h) || this.todayInputValue();

    const { isConfirmed, value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Finalizar compra',
      html: `
        <p class="small text-muted mb-3">${this.escapeHtml(this.docLabel())}</p>
        <div class="text-start">
          <div class="mb-2">
            <label class="form-label small mb-0">Proveedor</label>
            <div class="form-control form-control-sm bg-light">${proveedor}</div>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0">Dirección</label>
            <div class="form-control form-control-sm bg-light">${dir}</div>
          </div>
          <div class="row g-2 mb-2">
            <div class="col-6">
              <label class="form-label small mb-0" for="compras-finalizar-serie">Serie factura</label>
              <input type="text" id="compras-finalizar-serie" class="form-control form-control-sm"
                value="${seriefacVal}" autocomplete="off">
            </div>
            <div class="col-6">
              <label class="form-label small mb-0" for="compras-finalizar-num">Número factura</label>
              <input type="text" id="compras-finalizar-num" class="form-control form-control-sm"
                value="${nofacVal}" autocomplete="off">
            </div>
          </div>
          <div class="row g-2 mb-2 align-items-end" id="compras-finalizar-pago-row">
            <div class="col-${concreVal === 'CRE' ? '6' : '12'}" id="compras-finalizar-concre-wrap">
              <label class="form-label small mb-0" for="compras-finalizar-concre">Forma de pago</label>
              <select id="compras-finalizar-concre" class="form-select form-select-sm">
                <option value="CON"${concreVal !== 'CRE' ? ' selected' : ''}>CONTADO</option>
                <option value="CRE"${concreVal === 'CRE' ? ' selected' : ''}>CREDITO</option>
              </select>
            </div>
            <div class="col-6${concreVal === 'CRE' ? '' : ' d-none'}" id="compras-finalizar-venc-wrap">
              <label class="form-label small mb-0" for="compras-finalizar-venc">Vencimiento</label>
              <input type="date" id="compras-finalizar-venc" class="form-control form-control-sm" value="${vencDefault}">
            </div>
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="compras-finalizar-obs">Observaciones</label>
            <textarea id="compras-finalizar-obs" class="form-control form-control-sm" rows="2"
              placeholder="Observaciones…">${obsVal}</textarea>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const concreSel = document.getElementById('compras-finalizar-concre');
        const vencWrap = document.getElementById('compras-finalizar-venc-wrap');
        const concreWrap = document.getElementById('compras-finalizar-concre-wrap');
        const toggleVenc = () => {
          const isCre = concreSel?.value === 'CRE';
          vencWrap?.classList.toggle('d-none', !isCre);
          if (concreWrap) {
            concreWrap.classList.toggle('col-6', isCre);
            concreWrap.classList.toggle('col-12', !isCre);
          }
        };
        concreSel?.addEventListener('change', toggleVenc);
        toggleVenc();
        document.getElementById('compras-finalizar-serie')?.focus();
      },
      preConfirm: () => {
        const seriefac = document.getElementById('compras-finalizar-serie')?.value?.trim() || '';
        const nofac = document.getElementById('compras-finalizar-num')?.value?.trim() || '';
        const concre = document.getElementById('compras-finalizar-concre')?.value || 'CON';
        const venc = document.getElementById('compras-finalizar-venc')?.value?.trim() || '';
        const obs = document.getElementById('compras-finalizar-obs')?.value?.trim() || '';
        if (!seriefac) {
          Swal.showValidationMessage('Ingrese la serie de factura');
          return false;
        }
        if (!nofac) {
          Swal.showValidationMessage('Ingrese el número de factura');
          return false;
        }
        if (concre === 'CRE' && !venc) {
          Swal.showValidationMessage('Ingrese la fecha de vencimiento');
          return false;
        }
        return { seriefac, nofac, concre, vencimiento: concre === 'CRE' ? venc : null, obs };
      },
    });

    if (!isConfirmed) return;

    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        SERIEFAC: value.seriefac,
        NOFAC: value.nofac,
        CONCRE: value.concre,
        VENCIMIENTO: value.vencimiento,
        OBS: value.obs,
      }),
    });
    F.toast('Compra finalizada', 'success');
    this._compra = null;
    await this.showList();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1, costo) {
    const key = this.docKey();
    if (!key) {
      F.toast('No hay compra activa', 'warning');
      return;
    }
    if (!this.docEditable(this._compra?.header)) {
      F.toast('La compra no está en edición', 'warning');
      return;
    }
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const body = { CODPROD: codprod, CODMEDIDA: codmedida, CANTIDAD: cantidad };
    if (costo !== undefined && costo !== null) body.COSTO = costo;
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
    F.toast('Producto agregado', 'success');
  },

  setCartBusy(busy) {
    this._cartBusy = busy;
    const tbody = this._container?.querySelector('#compras-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-compras-finalizar');
    if (fab) fab.disabled = busy;
  },

  async actualizarCantidad(lineId, cantidad) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CANTIDAD: cantidad }),
    });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
  },

  async eliminarLinea(lineId) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, { method: 'DELETE' });
    this._compra = res.compra;
    this.renderCart();
    this.renderOrderSummary();
  },

  async onProductClick(row) {
    if (!row?.CODPROD) {
      F.toast('Producto no disponible', 'warning');
      return;
    }
    const precios = this._productos.filter((p) => String(p.CODPROD) === String(row.CODPROD));
    if (!precios.length) {
      F.toast('Sin precios habilitados', 'warning');
      return;
    }
    const defaultMedida = row.CODMEDIDA || precios[0].CODMEDIDA;
    const costByMedida = Object.fromEntries(
      precios.map((p) => [String(p.CODMEDIDA), Number(p.COSTO) || 0])
    );
    const defaultCosto = costByMedida[String(defaultMedida)] ?? 0;
    const options = precios
      .map((p) => {
        const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
        return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.COSTO))} (eq. ${this.escapeHtml(p.EQUIVALE)})</option>`;
      })
      .join('');
    const { value: picked } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: row.DESPROD || row.CODPROD,
      html: `
        <label class="form-label small mb-0">Medida</label>
        <select id="compras-swal-medida" class="form-select form-select-sm">${options}</select>
        <div class="row g-2 mt-2 align-items-end">
          <div class="col-6">
            <label class="form-label small mb-0" for="compras-swal-cant">Cantidad</label>
            <input type="number" id="compras-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
          </div>
          <div class="col-6">
            <label class="form-label small mb-0" for="compras-swal-costo">Costo</label>
            <input type="number" id="compras-swal-costo" class="form-control form-control-sm" value="${defaultCosto}" min="0" step="any">
          </div>
        </div>
        <p class="small text-muted mb-0 mt-2 text-end" id="compras-swal-total">Total: ${this.escapeHtml(this.formatMoney(defaultCosto))}</p>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        const medSel = document.getElementById('compras-swal-medida');
        const costInp = document.getElementById('compras-swal-costo');
        const cantInp = document.getElementById('compras-swal-cant');
        const totalEl = document.getElementById('compras-swal-total');
        const updateTotal = () => {
          const cant = Number(cantInp?.value) || 0;
          const cost = Number(costInp?.value) || 0;
          if (totalEl) totalEl.textContent = `Total: ${this.formatMoney(cant * cost)}`;
        };
        const syncCostoFromMedida = () => {
          const med = medSel?.value;
          if (med && costInp) costInp.value = String(costByMedida[med] ?? 0);
          updateTotal();
        };
        medSel?.addEventListener('change', syncCostoFromMedida);
        cantInp?.addEventListener('input', updateTotal);
        costInp?.addEventListener('input', updateTotal);
        cantInp?.focus();
        cantInp?.select();
      },
      preConfirm: () => {
        const cant = Number(document.getElementById('compras-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        const medida = document.getElementById('compras-swal-medida')?.value;
        if (!medida) {
          Swal.showValidationMessage('Seleccione una medida');
          return false;
        }
        const costo = Number(document.getElementById('compras-swal-costo')?.value);
        if (Number.isNaN(costo) || costo < 0) {
          Swal.showValidationMessage('Costo inválido');
          return false;
        }
        return { medida, cantidad: cant, costo };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad, picked.costo);
    }
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'compras');
    if (!targets.length) return;
    if (!this._productos.length) {
      const empty =
        '<p class="text-muted small text-center py-3 mb-0">Busque productos por código o descripción</p>';
      targets.forEach((el) => {
        el.innerHTML = empty;
      });
      return;
    }
    const html = this._productos
      .map(
        (p) => `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(this.formatProdLabel(p.DESPROD, p.DESMARCA))} ${this.escapeHtml(p.CODMEDIDA)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA)}</div>
              <div>${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
            </div>
            <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.COSTO))}</div>
          </div>
        `
      )
      .join('');
    targets.forEach((el) => {
      el.innerHTML = html;
    });
  },

  renderCart() {
    const tbody = this._container?.querySelector('#compras-cart-tbody');
    if (!tbody) return;
    const lines = this._compra?.lines || [];
    const h = this._compra?.header;
    const editable = this.docEditable(h);
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3">Sin productos en la compra</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const lineId = this.lineId(ln);
        const qty = Number(ln.CANTIDAD) || 0;
        const qtyControls = editable
          ? `<div class="d-flex align-items-center gap-1 justify-content-center">
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>−</button>
              <span class="px-1">${qty}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${lineId}"${this._cartBusy ? ' disabled' : ''}>+</button>
            </div>`
          : `<span>${qty}</span>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${lineId}" title="Quitar"${this._cartBusy ? ' disabled' : ''}><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA)}</span></td>
          <td class="text-center">${qtyControls}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALCOSTO))}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderOrderSummary() {
    const totalEl = this._container?.querySelector('#compras-header-total');
    const itemsEl = this._container?.querySelector('#compras-header-items');
    const docEl = this._container?.querySelector('#compras-header-doc');
    const h = this._compra?.header;
    const lines = this._compra?.lines || [];
    const total = h?.TOTALCOSTO ?? 0;
    const itemCount = lines.reduce((sum, ln) => sum + (Number(ln.CANTIDAD) || 0), 0);
    if (totalEl) totalEl.textContent = this.formatMoney(total);
    if (itemsEl) {
      itemsEl.textContent = itemCount === 1 ? '1 item' : `${itemCount} items`;
    }
    if (docEl && h) docEl.textContent = this.docLabel();
  },

  renderHeaderInfo() {
    const provEl = this._container?.querySelector('#compras-proveedor-nombre');
    const h = this._compra?.header;
    if (provEl && h) {
      provEl.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#compras-proveedor-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
    const seriefacInp = this._container?.querySelector('#compras-seriefac');
    const nofacInp = this._container?.querySelector('#compras-nofac');
    if (h) {
      if (seriefacInp && !seriefacInp.matches(':focus')) seriefacInp.value = h.SERIEFAC || '';
      if (nofacInp && !nofacInp.matches(':focus')) nofacInp.value = h.NOFAC || '';
    }
    const fechaInp = this._container?.querySelector('#compras-doc-fecha');
    if (fechaInp && h && !fechaInp.matches(':focus')) {
      fechaInp.value = DocFecha.inputValueFromHeader(h);
    }
  },

  syncEditorControls() {
    const editable = this.docEditable(this._compra?.header);
    PosDocSearchUI.syncControls(this._container, 'compras', editable);
    ['#compras-proveedor-search', '#compras-doc-fecha', '#compras-seriefac', '#compras-nofac'].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-compras-finalizar');
    if (fab) fab.style.display = editable ? '' : 'none';
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderOrderSummary();
    this.syncEditorControls();
  },

  async bloquearCompra(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Bloquear compra?',
      html: `<p class="mb-0">La compra <strong>${this.escapeHtml(label)}</strong> pasará a estado bloqueado (I). No se elimina; solo dejará de mostrarse en el listado de operados.</p>`,
      icon: 'warning',
      confirmText: 'BLOQUEAR',
      confirmClass: 'btn-catalogo-bloquear',
    });
    if (!confirm) return;
    const url = `/api/compras/compras/${encodeURIComponent(coddoc)}/${correlativo}/bloquear?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, { method: 'POST' });
    F.toast('Compra bloqueada', 'success');
    await this.fetchComprasList();
    this.refreshListDom();
  },

  async eliminarCompra(coddoc, correlativo) {
    const label = `${coddoc} #${correlativo}`;
    const pass = await CatalogosUI.confirmEliminarDocumento({ label, tipo: 'compra' });
    if (!pass) return;
    const url = `/api/compras/compras/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass: String(pass) }),
    });
    F.toast('Compra eliminada', 'success');
    await this.fetchComprasList();
    this.refreshListDom();
  },

  async imprimirCompra(coddoc, correlativo) {
    try {
      const url = `/api/compras/compras/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
      const compra = await F.fetchJson(url);
      const h = compra.header;
      const lines = compra.lines || [];
      const rows = lines
        .map(
          (ln) => `<tr>
            <td>${this.escapeHtml(ln.CODPROD)}</td>
            <td>${this.escapeHtml(ln.DESPROD)}</td>
            <td>${this.escapeHtml(ln.CODMEDIDA)}</td>
            <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALCOSTO))}</td>
          </tr>`
        )
        .join('');
      const html = PrintReport.wrapDocument({
        title: 'Compra',
        bodyHtml: `
          ${PrintReport.reportHeaderHtml({
            title: 'Compra a proveedor',
            subtitleHtml: `
              <p><strong>${this.escapeHtml(h.CODDOC)} #${h.CORRELATIVO}</strong> · ${this.formatFechaCompra(h)} · ${PrintReport.escapeHtml(h.USUARIO || '')}</p>
              <p><strong>Proveedor:</strong> ${PrintReport.escapeHtml(h.DOC_NOMCLIE || '—')}</p>
              ${h.SERIEFAC || h.NOFAC ? `<p><strong>Factura:</strong> ${PrintReport.escapeHtml(h.SERIEFAC || '')} ${PrintReport.escapeHtml(h.NOFAC || '')}</p>` : ''}
              ${h.OBS ? `<p><em>${PrintReport.escapeHtml(h.OBS)}</em></p>` : ''}
            `,
          })}
          <table><thead><tr><th>Cód.</th><th>Producto</th><th>Medida</th><th class="text-end">Cant.</th><th class="text-end">Total</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5">Sin líneas</td></tr>'}</tbody></table>
          <p class="text-end"><strong>Total: ${PrintReport.escapeHtml(this.formatMoney(h.TOTALCOSTO))}</strong></p>
        `,
      });
      PrintReport.openAndPrint(html, 'width=800,height=600');
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const grid = this._container?.querySelector('#compras-list-cards');
    if (grid) grid.innerHTML = this.renderListCardsHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredComprasList().length} compra(s) operadas`;
    }
  },

  renderListCardsHtml() {
    const rows = this.filteredComprasList();
    if (!rows.length) {
      return '<div class="pos-list-empty text-muted text-center py-5">No hay compras operadas</div>';
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const proveedor = r.DOC_NOMCLIE || r.EMPRESA || r.RAZONSOCIAL || 'Sin proveedor';
        const meta = [r.EMPRESA, r.RAZONSOCIAL].filter(Boolean).join(' · ');
        return `
          <div class="pos-pedido-card inv-doc-card" data-coddoc="${this.escapeHtml(r.CODDOC)}"
            data-correlativo="${r.CORRELATIVO}">
            <div class="pos-pedido-card-top">
              <span class="pos-pedido-card-doc">${this.escapeHtml(label)}</span>
              <span class="pos-pedido-card-total">${this.escapeHtml(this.formatMoney(r.TOTALCOSTO))}</span>
            </div>
            <div class="pos-pedido-card-cliente">${this.escapeHtml(proveedor)}</div>
            ${meta ? `<div class="pos-pedido-card-meta">${this.escapeHtml(meta)}</div>` : ''}
            <div class="pos-pedido-card-footer">
              <span><i class="fa-solid fa-box-open me-1"></i>${Number(r.LINEAS) || 0} líneas</span>
              <span><i class="fa-regular fa-calendar me-1"></i>${this.escapeHtml(this.formatFechaCompra(r))}</span>
            </div>
            <div class="inv-card-actions">
              <button type="button" class="btn btn-sm btn-outline-primary inv-card-btn" data-action="editar">
                <i class="fa-solid fa-pen me-1"></i>Editar
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary inv-card-btn" data-action="imprimir">
                <i class="fa-solid fa-print me-1"></i>Imprimir
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="bloquear">
                <i class="fa-solid fa-lock me-1"></i>Bloquear
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger inv-card-btn" data-action="eliminar">
                <i class="fa-solid fa-trash me-1"></i>Eliminar
              </button>
            </div>
          </div>`;
      })
      .join('');
  },

  renderListScreen() {
    const count = this.filteredComprasList().length;
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Seleccione una compra o cree una nueva</h2>
          <p class="pos-list-sub text-muted mb-0">${count} compra(s) operadas</p>
        </div>
        <div class="pos-list-search mb-3">
          <div class="input-group">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control pos-search-glow" id="compras-list-search"
              placeholder="Buscar compra, proveedor…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
          </div>
        </div>
        <div class="pos-pedido-cards" id="compras-list-cards">${this.renderListCardsHtml()}</div>
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-compras-list-nuevo"
          aria-label="Nueva compra" title="Nueva compra">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  },

  renderEditorShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Compras';
    const editable = this.docEditable(this._compra?.header);
    return `
      <div class="pos-vista-wrap">
        <div class="pos-header card shadow-sm">
          <div class="card-body pos-header-body">
            <div class="pos-header-top d-flex flex-wrap align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary pos-btn-atras" id="btn-compras-atras">
                <i class="fa-solid fa-arrow-left me-1"></i>Atrás
              </button>
              <div class="pos-header-brand">
                ${typeof EmpresaLogo !== 'undefined' ? EmpresaLogo.posHeaderLogoHtml() : '<img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">'}
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="compras-header-doc">${this.escapeHtml(this.docLabel())}</div>
              <div class="pos-doc-meta-fields d-flex flex-wrap align-items-end gap-2">
                ${DocFecha.renderField('compras-doc-fecha', this._compra?.header)}
              </div>
              <div class="pos-header-summary ms-auto text-end">
                <h3 class="pos-header-total mb-0" id="compras-header-total">Q 0.00</h3>
                <div class="pos-header-items" id="compras-header-items">0 items</div>
              </div>
            </div>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel pos-panel-search card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="compras-product-search"
                  placeholder="Código o descripción…" autocomplete="off"${editable ? '' : ' disabled'}>
              </div>
              <div class="pos-product-list" id="compras-product-list"></div>
            </div>
          </div>
          <div class="pos-panel pos-panel-cart card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2 flex-wrap">
              <div class="d-flex align-items-center gap-2">
                <i class="fa-solid fa-receipt"></i>
                <span class="fw-semibold">Compra actual</span>
              </div>
            </div>
            <div class="card-body">
              <div class="pos-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Proveedor</label>
                <input type="search" class="form-control form-control-sm pos-search-glow" id="compras-proveedor-search"
                  placeholder="Buscar proveedor…" autocomplete="off"${editable ? '' : ' disabled'}>
                <div id="compras-proveedor-nombre" class="small text-muted mt-1"></div>
                <div id="compras-proveedor-results" class="list-group position-absolute w-100 shadow-sm d-none"
                  style="z-index: 20; max-height: 200px; overflow-y: auto;"></div>
              </div>
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label small mb-0" for="compras-seriefac">Serie factura</label>
                  <input type="text" class="form-control form-control-sm" id="compras-seriefac"
                    placeholder="Serie" autocomplete="off"${editable ? '' : ' disabled'}>
                </div>
                <div class="col-6">
                  <label class="form-label small mb-0" for="compras-nofac">Número factura</label>
                  <input type="text" class="form-control form-control-sm" id="compras-nofac"
                    placeholder="Número" autocomplete="off"${editable ? '' : ' disabled'}>
                </div>
              </div>
              <div class="pos-cart-table flex-grow-1 d-flex flex-column">
                <div class="table-responsive">
                  <table class="table table-sm table-hover mb-0">
                    <thead class="table-light">
                      <tr>
                        <th>Cód.</th>
                        <th>Producto</th>
                        <th class="text-center">Cant.</th>
                        <th class="text-end">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="compras-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${editable ? PosDocSearchUI.fabBarHtml('compras') : ''}
        ${PosDocSearchUI.productModalHtml('compras')}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#compras-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    this._container?.querySelector('#compras-list-cards')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.inv-card-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.inv-doc-card');
      if (!card) return;
      const coddoc = card.getAttribute('data-coddoc');
      const correlativo = card.getAttribute('data-correlativo');
      const action = btn.getAttribute('data-action');
      try {
        if (action === 'editar') await this.showEditor(coddoc, correlativo);
        else if (action === 'imprimir') await this.imprimirCompra(coddoc, correlativo);
        else if (action === 'bloquear') await this.bloquearCompra(coddoc, correlativo);
        else if (action === 'eliminar') await this.eliminarCompra(coddoc, correlativo);
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });

    this._container?.querySelector('#btn-compras-list-nuevo')?.addEventListener('click', () => this.onNuevaCompra());
  },

  bindEditorEvents() {
    PosDocSearchUI.bind(this, 'compras', {
      getEditable: () => this.docEditable(this._compra?.header),
      buscarProductos: this.buscarProductos,
      onProductPick: (row) => this.onProductClick(row),
    });

    this._container?.querySelector('#compras-cart-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled || this._cartBusy) return;
      e.preventDefault();
      const id = Number(btn.getAttribute('data-id'));
      const line = this.findLineById(id);
      if (!line) {
        F.toast('No se encontró la línea de la compra', 'warning');
        return;
      }
      const action = btn.getAttribute('data-action');
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
        F.toast(err.message || 'Error al actualizar la compra', 'error');
      } finally {
        this.setCartBusy(false);
        this.renderCart();
      }
    });

    this._container?.querySelector('#btn-compras-atras')?.addEventListener('click', () => this.showList());
    this._container?.querySelector('#btn-compras-finalizar')?.addEventListener('click', () => {
      this.finalizarCompra().catch((err) => F.toast(err.message, 'error'));
    });

    const fechaInp = this._container?.querySelector('#compras-doc-fecha');
    if (fechaInp) {
      fechaInp.addEventListener('change', () => {
        if (fechaInp.disabled) return;
        const val = fechaInp.value?.trim();
        if (!val) return;
        this.guardarFechaDocumento(val).catch((err) => F.toast(err.message, 'error'));
      });
    }

    const saveFactura = F.debounce(() => {
      const seriefac = this._container?.querySelector('#compras-seriefac')?.value ?? '';
      const nofac = this._container?.querySelector('#compras-nofac')?.value ?? '';
      this.guardarFacturaCompra(seriefac, nofac).catch((err) => F.toast(err.message, 'error'));
    }, 400);
    this._container?.querySelector('#compras-seriefac')?.addEventListener('change', saveFactura);
    this._container?.querySelector('#compras-nofac')?.addEventListener('change', saveFactura);
    this._container?.querySelector('#compras-seriefac')?.addEventListener('blur', saveFactura);
    this._container?.querySelector('#compras-nofac')?.addEventListener('blur', saveFactura);

    const provSearch = this._container?.querySelector('#compras-proveedor-search');
    const provList = this._container?.querySelector('#compras-proveedor-results');
    if (provSearch && provList) {
      const runProv = F.debounce(async () => {
        const q = provSearch.value.trim();
        if (q.length < 2) {
          provList.classList.add('d-none');
          return;
        }
        try {
          const rows = await this.buscarProveedores(q);
          if (!rows.length) {
            provList.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
          } else {
            provList.innerHTML = rows
              .map(
                (p) =>
                  `<button type="button" class="list-group-item list-group-item-action small"
                    data-codprov="${p.CODPROV}">
                    <strong>${this.escapeHtml(p.EMPRESA || p.RAZONSOCIAL)}</strong>
                    <span class="text-muted d-block">${this.escapeHtml(p.RAZONSOCIAL || '')} · ${this.escapeHtml(p.NIT || '')}</span>
                  </button>`
              )
              .join('');
          }
          provList.classList.remove('d-none');
        } catch (err) {
          provList.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
          provList.classList.remove('d-none');
        }
      }, 350);
      provSearch.addEventListener('input', runProv);
      provList.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-codprov]');
        if (!btn) return;
        const cod = parseInt(btn.getAttribute('data-codprov'), 10);
        provList.classList.add('d-none');
        await this.aplicarProveedor(cod);
      });
      document.addEventListener('click', (e) => {
        if (!provSearch.contains(e.target) && !provList.contains(e.target)) {
          provList.classList.add('d-none');
        }
      });
    }
  },

  async buscarProductos(q) {
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'compras', spinner);
    try {
      const data = await this.fetchProductos(q);
      this._productos = data.rows || [];
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'compras', errHtml);
    } finally {
      this._loadingProducts = false;
    }
  },

  async buscarProveedores(q) {
    const data = await F.fetchJson(this.apiUrl('/proveedores', { q, limit: '15', _: Date.now() }));
    return data.rows || [];
  },

  async guardarFechaDocumento(fecha) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const actual = DocFecha.inputValueFromHeader(this._compra.header);
    if (fecha === actual) return;
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FECHA: fecha }),
    });
    this.renderHeaderInfo();
    F.toast('Fecha actualizada', 'success');
  },

  async guardarFacturaCompra(seriefac, nofac) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const h = this._compra.header;
    const s = String(seriefac ?? '').trim();
    const n = String(nofac ?? '').trim();
    if (s === String(h.SERIEFAC || '').trim() && n === String(h.NOFAC || '').trim()) return;
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ SERIEFAC: s, NOFAC: n }),
    });
    this.renderHeaderInfo();
  },

  async aplicarProveedor(codprov) {
    const key = this.docKey();
    if (!key || !this.docEditable(this._compra?.header)) return;
    const url = `/api/compras/compras/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._compra = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODPROV: codprov }),
    });
    this.renderHeaderInfo();
    F.toast('Proveedor actualizado', 'success');
  },

  async showList() {
    this._screen = 'list';
    this._compra = null;
    PosDocSearchUI.teardown('compras');
    await this.fetchComprasList();
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
  },

  async showEditor(coddoc, correlativo) {
    this._screen = 'editor';
    PosDocSearchUI.teardown('compras');
    if (coddoc && correlativo) {
      await this.loadCompra(coddoc, correlativo, { skipRender: true });
    }
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    await this.buscarProductos('');
    this.renderAll();
  },

  async onNuevaCompra() {
    try {
      await this.crearCompra();
      const key = this.docKey();
      if (key) await this.showEditor(key.coddoc, key.correlativo);
    } catch (err) {
      F.toast(err.message || 'Error al crear compra', 'error');
    }
  },

  async load(container) {
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando Compras…</div>`;

    try {
      this._config = await this.fetchConfig();
      if (!this._config.coddocDefault) {
        container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento <strong>COM</strong> (compras) activo para esta empresa.
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
