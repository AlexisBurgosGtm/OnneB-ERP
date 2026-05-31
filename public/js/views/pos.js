/**
 * Vista POS — Pedidos de mostrador (DOCUMENTOS + DOCPRODUCTOS).
 */
const PosView = {
  _container: null,
  _config: null,
  _pedido: null,
  _productos: [],
  _loadingProducts: false,
  _searchTimer: null,

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

  usuario() {
    const u = F.session('user');
    return u?.username || 'POS';
  },

  async fetchConfig() {
    return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
  },

  async fetchProductos(q) {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40' });
    if (q) params.set('q', q);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/pos/productos?${params}`);
  },

  async fetchPedidos() {
    const coddoc = this._config?.coddocDefault || '';
    const params = new URLSearchParams({ empnit: F.getEmpNit() });
    if (coddoc) params.set('coddoc', coddoc);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/pos/pedidos?${params}`);
  },

  async loadPedido(coddoc, correlativo) {
    const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    this._pedido = await F.fetchJson(url);
    this.renderAll();
  },

  async crearPedido() {
    const body = {
      CODDOC: this._config?.coddocDefault,
      CODCLIENTE: this._config?.clienteDefault?.CODCLIENTE,
      USUARIO: this.usuario(),
    };
    const url = `/api/pos/pedidos?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    F.toast('Nuevo pedido creado', 'success');
    await this.refreshPedidosSelect();
    this.renderAll();
  },

  async finalizarPedido() {
    const key = this.docKey();
    if (!key) return;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Finalizar pedido?',
      html: `<p class="mb-0">El pedido <strong>${this.escapeHtml(this.docLabel())}</strong> quedará registrado (estado O).</p>`,
      icon: 'question',
      confirmText: 'Finalizar',
    });
    if (!confirm) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, { method: 'POST' });
    this._pedido = res.pedido;
    F.toast('Pedido finalizado', 'success');
    await this.refreshPedidosSelect();
    await this.crearPedido();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1) {
    const key = this.docKey();
    if (!key) {
      F.toast('Cree o seleccione un pedido', 'warning');
      return;
    }
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODPROD: codprod, CODMEDIDA: codmedida, CANTIDAD: cantidad }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderTotals();
    F.toast('Producto agregado', 'success');
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
    this.renderTotals();
  },

  async eliminarLinea(lineId) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/lineas/${lineId}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    const res = await F.fetchJson(url, { method: 'DELETE' });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderTotals();
  },

  async onProductClick(prod) {
    const precios = prod.precios || [];
    if (!precios.length) {
      F.toast('Sin precios habilitados', 'warning');
      return;
    }
    if (precios.length === 1) {
      await this.agregarLinea(prod.CODPROD, precios[0].CODMEDIDA, 1);
      return;
    }
    const options = precios
      .map(
        (p) =>
          `<option value="${this.escapeHtml(p.CODMEDIDA)}">${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.PRECIO))} (eq. ${p.EQUIVALE})</option>`
      )
      .join('');
    const { value: medida } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: prod.DESPROD,
      html: `
        <label class="form-label small">Medida / precio</label>
        <select id="pos-swal-medida" class="form-select">${options}</select>
        <label class="form-label small mt-2">Cantidad</label>
        <input type="number" id="pos-swal-cant" class="form-control" value="1" min="0.01" step="any">
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      preConfirm: () => {
        const cant = Number(document.getElementById('pos-swal-cant')?.value);
        if (!cant || cant <= 0) {
          Swal.showValidationMessage('Cantidad inválida');
          return false;
        }
        return {
          medida: document.getElementById('pos-swal-medida')?.value,
          cantidad: cant,
        };
      },
    });
    if (medida?.medida) {
      await this.agregarLinea(prod.CODPROD, medida.medida, medida.cantidad);
    }
  },

  renderProductList() {
    const el = this._container?.querySelector('#pos-product-list');
    if (!el) return;
    if (!this._productos.length) {
      el.innerHTML = '<p class="text-muted small text-center py-3 mb-0">Busque productos por código o descripción</p>';
      return;
    }
    el.innerHTML = this._productos
      .map((p) => {
        const first = p.precios?.[0];
        const price = first ? this.formatMoney(first.PRECIO) : '—';
        const medidas =
          p.precios?.length > 1
            ? `<span class="badge text-bg-secondary ms-1">${p.precios.length} medidas</span>`
            : first
              ? `<span class="small text-muted ms-1">${this.escapeHtml(first.CODMEDIDA)}</span>`
              : '';
        return `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}" aria-label="Agregar ${this.escapeHtml(p.DESPROD)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)}</div>
              <div>${this.escapeHtml(p.DESPROD)}</div>
              ${medidas}
            </div>
            <div class="pos-prod-price">${price}</div>
          </div>
        `;
      })
      .join('');
  },

  renderCart() {
    const tbody = this._container?.querySelector('#pos-cart-tbody');
    if (!tbody) return;
    const lines = this._pedido?.lines || [];
    const h = this._pedido?.header;
    const editable = h?.STATUS === 'D';
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3">Sin productos en el pedido</td></tr>';
      return;
    }
    tbody.innerHTML = lines
      .map((ln) => {
        const qty = Number(ln.CANTIDAD) || 0;
        const qtyControls = editable
          ? `<div class="d-flex align-items-center gap-1 justify-content-center">
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-minus" data-id="${ln.ID}">−</button>
              <span class="px-1">${qty}</span>
              <button type="button" class="btn btn-outline-secondary btn-sm pos-qty-btn" data-action="qty-plus" data-id="${ln.ID}">+</button>
            </div>`
          : `<span>${qty}</span>`;
        const delBtn = editable
          ? `<button type="button" class="btn btn-sm btn-outline-danger" data-action="line-del" data-id="${ln.ID}" title="Quitar"><i class="fa-solid fa-trash"></i></button>`
          : '';
        return `<tr>
          <td class="small">${this.escapeHtml(ln.CODPROD)}</td>
          <td class="small">${this.escapeHtml(ln.DESPROD)}<br><span class="text-muted">${this.escapeHtml(ln.CODMEDIDA)}</span></td>
          <td class="text-center">${qtyControls}</td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
          <td class="text-end">${delBtn}</td>
        </tr>`;
      })
      .join('');
  },

  renderTotals() {
    const el = this._container?.querySelector('#pos-totals');
    if (!el) return;
    const h = this._pedido?.header;
    const total = h?.TOTALPRECIO ?? 0;
    const lineas = (this._pedido?.lines || []).length;
    el.innerHTML = `
      <div class="pos-total-row text-muted small"><span>Líneas</span><span>${lineas}</span></div>
      <div class="pos-total-row pos-grand-total"><span>Total</span><span>${this.escapeHtml(this.formatMoney(total))}</span></div>
    `;
  },

  renderHeaderInfo() {
    const badge = this._container?.querySelector('#pos-doc-badge');
    const cliente = this._container?.querySelector('#pos-cliente-nombre');
    const h = this._pedido?.header;
    if (badge) badge.textContent = this.docLabel();
    if (cliente && h) {
      cliente.textContent = h.DOC_NOMCLIE || '—';
      const inp = this._container.querySelector('#pos-cliente-search');
      if (inp && !inp.matches(':focus')) inp.value = h.DOC_NOMCLIE || '';
    }
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderTotals();
  },

  async refreshPedidosSelect() {
    const sel = this._container?.querySelector('#pos-pedidos-select');
    if (!sel) return;
    try {
      const data = await this.fetchPedidos();
      const rows = data.rows || [];
      const key = this.docKey();
      const opts = rows
        .map((r) => {
          const selected =
            key && r.CODDOC === key.coddoc && Number(r.CORRELATIVO) === key.correlativo
              ? ' selected'
              : '';
          const label = `${r.CODDOC} #${r.CORRELATIVO} — ${this.formatMoney(r.TOTALPRECIO)} (${r.LINEAS || 0})`;
          return `<option value="${this.escapeHtml(r.CODDOC)}|${r.CORRELATIVO}"${selected}>${this.escapeHtml(label)}</option>`;
        })
        .join('');
      sel.innerHTML = `<option value="">— Seleccionar borrador —</option>${opts}`;
    } catch {
      /* ignore */
    }
  },

  async buscarProductos(q) {
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const list = this._container?.querySelector('#pos-product-list');
    if (list) list.innerHTML = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    try {
      const data = await this.fetchProductos(q);
      this._productos = data.rows || [];
      this.renderProductList();
    } catch (err) {
      if (list) list.innerHTML = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
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

  async aplicarCliente(codcliente) {
    const key = this.docKey();
    if (!key) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}`;
    this._pedido = await F.fetchJson(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ CODCLIENTE: codcliente }),
    });
    this.renderHeaderInfo();
    F.toast('Cliente actualizado', 'success');
  },

  bindEvents() {
    const searchProd = this._container?.querySelector('#pos-product-search');
    if (searchProd) {
      const run = F.debounce(() => this.buscarProductos(searchProd.value.trim()), 300);
      searchProd.addEventListener('input', run);
      searchProd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.buscarProductos(searchProd.value.trim());
        }
      });
    }

    this._container?.querySelector('#pos-product-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.pos-product-item');
      if (!item) return;
      const cod = item.getAttribute('data-codprod');
      const prod = this._productos.find((p) => p.CODPROD === cod);
      if (prod) this.onProductClick(prod);
    });

    this._container?.querySelector('#pos-cart-tbody')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = parseInt(btn.getAttribute('data-id'), 10);
      const line = (this._pedido?.lines || []).find((l) => l.ID === id);
      if (!line) return;
      const action = btn.getAttribute('data-action');
      if (action === 'line-del') {
        await this.eliminarLinea(id);
        return;
      }
      const qty = Number(line.CANTIDAD) || 1;
      if (action === 'qty-plus') await this.actualizarCantidad(id, qty + 1);
      if (action === 'qty-minus') {
        if (qty <= 1) await this.eliminarLinea(id);
        else await this.actualizarCantidad(id, qty - 1);
      }
    });

    this._container?.querySelector('#btn-pos-nuevo')?.addEventListener('click', () => this.crearPedido());
    this._container?.querySelector('#btn-pos-finalizar')?.addEventListener('click', () => this.finalizarPedido());

    this._container?.querySelector('#pos-pedidos-select')?.addEventListener('change', async (e) => {
      const v = e.target.value;
      if (!v) return;
      const [coddoc, corr] = v.split('|');
      await this.loadPedido(coddoc, corr);
    });

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
                    <strong>${this.escapeHtml(c.NEGOCIO || c.NOMBRECLIENTE)}</strong>
                    <span class="text-muted d-block">${this.escapeHtml(c.NOMBRECLIENTE || '')} · ${this.escapeHtml(c.NIT || '')}</span>
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
      document.addEventListener('click', (e) => {
        if (!clienteSearch.contains(e.target) && !clienteList.contains(e.target)) {
          clienteList.classList.add('d-none');
        }
      });
    }
  },

  renderShell() {
    const tipoLabel = this._config?.tiposDocumento?.[0]?.DESDOC || 'Pedidos';
    return `
      <div class="pos-vista-wrap">
        <div class="pos-toolbar card shadow-sm">
          <div class="card-body py-2 d-flex flex-wrap align-items-center gap-2">
            <span class="pos-doc-badge text-primary" id="pos-doc-badge">—</span>
            <select class="form-select form-select-sm pos-pedidos-select" id="pos-pedidos-select" title="Pedidos en borrador">
              <option value="">— Borradores —</option>
            </select>
            <button type="button" class="btn btn-sm btn-primary" id="btn-pos-nuevo">
              <i class="fa-solid fa-plus me-1"></i>Nuevo pedido
            </button>
            <button type="button" class="btn btn-sm btn-success ms-auto" id="btn-pos-finalizar">
              <i class="fa-solid fa-check me-1"></i>Finalizar
            </button>
          </div>
        </div>
        <div class="pos-main">
          <div class="pos-panel card shadow-sm">
            <div class="card-header py-2 d-flex align-items-center gap-2">
              <i class="fa-solid fa-box"></i>
              <span class="fw-semibold">Productos</span>
              <span class="small text-muted">(${this.escapeHtml(tipoLabel)})</span>
            </div>
            <div class="card-body">
              <div class="input-group input-group-sm mb-2">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="pos-product-search"
                  placeholder="Código o descripción…" autocomplete="off">
              </div>
              <div class="pos-product-list" id="pos-product-list"></div>
            </div>
          </div>
          <div class="pos-panel card shadow-sm">
            <div class="card-header py-2">
              <i class="fa-solid fa-receipt me-1"></i>
              <span class="fw-semibold">Pedido actual</span>
            </div>
            <div class="card-body">
              <div class="pos-cliente-wrap mb-2 position-relative">
                <label class="form-label small mb-1">Cliente</label>
                <input type="search" class="form-control form-control-sm" id="pos-cliente-search"
                  placeholder="Buscar cliente…" autocomplete="off">
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
                        <th class="text-center">Cant.</th>
                        <th class="text-end">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody id="pos-cart-tbody"></tbody>
                  </table>
                </div>
              </div>
              <div class="pos-totals" id="pos-totals"></div>
            </div>
          </div>
        </div>
      </div>
    `;
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

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando POS…</div>`;

    try {
      this._config = await this.fetchConfig();
      if (!this._config.coddocDefault) {
        container.innerHTML = `
          <div class="alert alert-warning m-3 w-100">
            Configure un tipo de documento <strong>ENV</strong> (pedidos) activo para esta empresa.
          </div>`;
        return;
      }
      container.innerHTML = this.renderShell();
      this.bindEvents();
      await this.refreshPedidosSelect();
      const pedidos = await this.fetchPedidos();
      if (pedidos.rows?.length) {
        const first = pedidos.rows[0];
        await this.loadPedido(first.CODDOC, first.CORRELATIVO);
      } else {
        await this.crearPedido();
      }
      await this.buscarProductos('');
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
