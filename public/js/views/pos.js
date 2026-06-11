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
    return `/api/pos${segment}?${params}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  formatFechaPedido(row) {
    if (!row?.FECHA) return '—';
    const s = String(row.FECHA).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
    return s;
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

  async fetchConfig() {
    return F.fetchJson(this.apiUrl('/config', { _: Date.now() }));
  },

  async fetchProductos(q) {
    const params = new URLSearchParams({ empnit: F.getEmpNit(), limit: '40' });
    if (q) params.set('q', q);
    params.set('_', String(Date.now()));
    return F.fetchJson(`/api/pos/productos?${params}`);
  },

  async fetchPedidosList() {
    const coddoc = this._config?.coddocDefault || '';
    const params = new URLSearchParams({ empnit: F.getEmpNit(), status: 'O' });
    if (coddoc) params.set('coddoc', coddoc);
    params.set('_', String(Date.now()));
    const data = await F.fetchJson(`/api/pos/pedidos?${params}`);
    this._pedidosList = data.rows || [];
    return this._pedidosList;
  },

  filteredPedidosList() {
    const q = this._listFilter.trim().toLowerCase();
    if (!q) return this._pedidosList;
    return this._pedidosList.filter((r) => {
      const hay = [
        r.CODDOC,
        r.CORRELATIVO,
        r.DOC_NOMCLIE,
        r.NEGOCIO,
        r.TIPONEGOCIO,
        r.OBS,
      ]
        .map((v) => String(v ?? '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  },

  async loadPedido(coddoc, correlativo) {
    const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
    this._pedido = await F.fetchJson(url);
    if (this._screen === 'editor') this.renderAll();
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
  },

  docEditable(header) {
    return DocFecha.editableStatus(header?.STATUS);
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

    const tipoNeg = this.escapeHtml(this.clienteTipoNegocio(h));
    const nombre = this.escapeHtml(h.DOC_NOMCLIE || h.CLI_NOMBRE || '—');
    const dir = this.escapeHtml(h.DOC_DIRCLIE || h.CLI_DIR || '—');
    const obsVal = this.escapeHtml(h.OBS || '');

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
            <label class="form-label small mb-0">Nombre cliente</label>
            <div class="form-control form-control-sm bg-light">${nombre}</div>
          </div>
          <div class="mb-2">
            <label class="form-label small mb-0">Dirección cliente</label>
            <div class="form-control form-control-sm bg-light">${dir}</div>
          </div>
          <div class="mb-0">
            <label class="form-label small mb-0" for="pos-finalizar-obs">Observaciones</label>
            <textarea id="pos-finalizar-obs" class="form-control form-control-sm" rows="3"
              placeholder="Observaciones del pedido…">${obsVal}</textarea>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Finalizar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => document.getElementById('pos-finalizar-obs')?.focus(),
      preConfirm: () => document.getElementById('pos-finalizar-obs')?.value?.trim() || '',
    });

    if (!isConfirmed) return;

    const url = `/api/pos/pedidos/${encodeURIComponent(key.coddoc)}/${key.correlativo}/finalizar?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ OBS: value }),
    });
    F.toast('Pedido finalizado', 'success');
    this._pedido = null;
    await this.showList();
  },

  async agregarLinea(codprod, codmedida, cantidad = 1) {
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
      body: JSON.stringify({ CODPROD: codprod, CODMEDIDA: codmedida, CANTIDAD: cantidad }),
    });
    this._pedido = res.pedido;
    this.renderCart();
    this.renderOrderSummary();
    F.toast('Producto agregado', 'success');
  },

  setCartBusy(busy) {
    this._cartBusy = busy;
    const tbody = this._container?.querySelector('#pos-cart-tbody');
    tbody?.classList.toggle('pos-cart-busy', busy);
    const fab = this._container?.querySelector('#btn-pos-finalizar');
    if (fab) fab.disabled = busy;
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
    const precios = this._productos.filter((p) => String(p.CODPROD) === String(row.CODPROD));
    if (!precios.length) {
      F.toast('Sin precios habilitados', 'warning');
      return;
    }
    const defaultMedida = row.CODMEDIDA || precios[0].CODMEDIDA;
    const options = precios
      .map((p) => {
        const selected = String(p.CODMEDIDA) === String(defaultMedida) ? ' selected' : '';
        return `<option value="${this.escapeHtml(p.CODMEDIDA)}"${selected}>${this.escapeHtml(p.CODMEDIDA)} — ${this.escapeHtml(this.formatMoney(p.PRECIO))} (eq. ${this.escapeHtml(p.EQUIVALE)})</option>`;
      })
      .join('');
    const { value: picked } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: row.DESPROD || row.CODPROD,
      html: `
        <label class="form-label small">Medida / precio</label>
        <select id="pos-swal-medida" class="form-select form-select-sm">${options}</select>
        <label class="form-label small mt-2">Cantidad</label>
        <input type="number" id="pos-swal-cant" class="form-control form-control-sm" value="1" min="0.01" step="any">
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Agregar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        document.getElementById('pos-swal-cant')?.focus();
        document.getElementById('pos-swal-cant')?.select();
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
        return { medida, cantidad: cant };
      },
    });
    if (picked?.medida) {
      await this.agregarLinea(row.CODPROD, picked.medida, picked.cantidad);
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
      .map(
        (p) => `
          <div class="pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(p.DESPROD)} ${this.escapeHtml(p.CODMEDIDA)}">
            <div>
              <div class="pos-prod-code">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA)}</div>
              <div>${this.escapeHtml(p.DESPROD)}</div>
            </div>
            <div class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.PRECIO))}</div>
          </div>
        `
      )
      .join('');
  },

  renderCart() {
    const tbody = this._container?.querySelector('#pos-cart-tbody');
    if (!tbody) return;
    const lines = this._pedido?.lines || [];
    const h = this._pedido?.header;
    const editable = this.docEditable(h);
    if (!lines.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="text-center text-muted py-3">Sin productos en el pedido</td></tr>';
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
  },

  syncEditorControls() {
    const editable = this.docEditable(this._pedido?.header);
    ['#pos-product-search', '#pos-cliente-search', '#pos-doc-fecha'].forEach((sel) => {
      const el = this._container?.querySelector(sel);
      if (el) el.disabled = !editable;
    });
    const fab = this._container?.querySelector('#btn-pos-finalizar');
    if (fab) fab.style.display = editable ? '' : 'none';
  },

  renderAll() {
    this.renderHeaderInfo();
    this.renderCart();
    this.renderOrderSummary();
    this.syncEditorControls();
  },

  async bloquearPedido(coddoc, correlativo) {
    const row = this._pedidosList.find(
      (r) => String(r.CODDOC) === String(coddoc) && Number(r.CORRELATIVO) === Number(correlativo)
    );
    const label = row ? `${coddoc} #${correlativo}` : `${coddoc} #${correlativo}`;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Bloquear pedido?',
      html: `<p class="mb-0">El pedido <strong>${this.escapeHtml(label)}</strong> pasará a estado bloqueado (I). No se elimina; solo dejará de mostrarse en el listado de operados.</p>`,
      icon: 'warning',
      confirmText: 'BLOQUEAR',
      confirmClass: 'btn-catalogo-bloquear',
    });
    if (!confirm) return;
    const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}/bloquear?empnit=${encodeURIComponent(F.getEmpNit())}`;
    await F.fetchJson(url, { method: 'POST' });
    F.toast('Pedido bloqueado', 'success');
    await this.fetchPedidosList();
    this.refreshListDom();
  },

  async imprimirPedido(coddoc, correlativo) {
    try {
      const url = `/api/pos/pedidos/${encodeURIComponent(coddoc)}/${correlativo}?empnit=${encodeURIComponent(F.getEmpNit())}&_=${Date.now()}`;
      const pedido = await F.fetchJson(url);
      const h = pedido.header;
      const lines = pedido.lines || [];
      const rows = lines
        .map(
          (ln) => `<tr>
            <td>${this.escapeHtml(ln.CODPROD)}</td>
            <td>${this.escapeHtml(ln.DESPROD)}</td>
            <td>${this.escapeHtml(ln.CODMEDIDA)}</td>
            <td class="text-end">${Number(ln.CANTIDAD) || 0}</td>
            <td class="text-end">${this.escapeHtml(this.formatMoney(ln.TOTALPRECIO))}</td>
          </tr>`
        )
        .join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pedido POS</title>
        <style>body{font-family:Segoe UI,sans-serif;padding:1.5rem;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:1rem}
        th,td{border:1px solid #ccc;padding:4px 6px}th{background:#f5f5f5;text-align:left}.text-end{text-align:right}h1{font-size:1.1rem;margin:0}</style></head>
        <body><h1>Pedido de mostrador</h1>
        <p><strong>${this.escapeHtml(h.CODDOC)} #${h.CORRELATIVO}</strong> · ${this.formatFechaPedido(h)} · ${this.escapeHtml(h.USUARIO || '')}</p>
        <p><strong>Cliente:</strong> ${this.escapeHtml(h.DOC_NOMCLIE || '—')}</p>
        ${h.OBS ? `<p><em>${this.escapeHtml(h.OBS)}</em></p>` : ''}
        <table><thead><tr><th>Cód.</th><th>Producto</th><th>Medida</th><th class="text-end">Cant.</th><th class="text-end">Total</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">Sin líneas</td></tr>'}</tbody></table>
        <p class="text-end"><strong>Total: ${this.escapeHtml(this.formatMoney(h.TOTALPRECIO))}</strong></p>
        </body></html>`;
      const w = window.open('', '_blank', 'width=800,height=600');
      if (!w) {
        F.toast('Permita ventanas emergentes para imprimir', 'warning');
        return;
      }
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    } catch (err) {
      F.toast(err.message || 'Error al imprimir', 'error');
    }
  },

  refreshListDom() {
    const grid = this._container?.querySelector('#pos-pedido-cards');
    if (grid) grid.innerHTML = this.renderListCardsHtml();
    const sub = this._container?.querySelector('.pos-list-sub');
    if (sub) {
      sub.textContent = `${this.filteredPedidosList().length} pedido(s) operados`;
    }
  },

  renderListCardsHtml() {
    const rows = this.filteredPedidosList();
    if (!rows.length) {
      return '<div class="pos-list-empty text-muted text-center py-5">No hay pedidos operados</div>';
    }
    return rows
      .map((r) => {
        const label = `${r.CODDOC} #${r.CORRELATIVO}`;
        const cliente = r.DOC_NOMCLIE || r.NEGOCIO || 'Sin cliente';
        const tipo = [r.TIPONEGOCIO, r.NEGOCIO].filter(Boolean).join(' · ');
        return `
          <div class="pos-pedido-card inv-doc-card" data-coddoc="${this.escapeHtml(r.CODDOC)}"
            data-correlativo="${r.CORRELATIVO}">
            <div class="pos-pedido-card-top">
              <span class="pos-pedido-card-doc">${this.escapeHtml(label)}</span>
              <span class="pos-pedido-card-total">${this.escapeHtml(this.formatMoney(r.TOTALPRECIO))}</span>
            </div>
            <div class="pos-pedido-card-cliente">${this.escapeHtml(cliente)}</div>
            ${tipo ? `<div class="pos-pedido-card-meta">${this.escapeHtml(tipo)}</div>` : ''}
            <div class="pos-pedido-card-footer">
              <span><i class="fa-solid fa-box-open me-1"></i>${Number(r.LINEAS) || 0} líneas</span>
              <span><i class="fa-regular fa-calendar me-1"></i>${this.escapeHtml(this.formatFechaPedido(r))}</span>
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
            </div>
          </div>`;
      })
      .join('');
  },

  renderListScreen() {
    const count = this.filteredPedidosList().length;
    return `
      <div class="pos-list-wrap">
        <div class="pos-list-header">
          <h2 class="pos-list-title">Seleccione un pedido o cree uno nuevo</h2>
          <p class="pos-list-sub text-muted mb-0">${count} pedido(s) operados</p>
        </div>
        <div class="pos-list-search mb-3">
          <div class="input-group">
            <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
            <input type="search" class="form-control pos-search-glow" id="pos-list-search"
              placeholder="Buscar pedido, cliente, negocio…" value="${this.escapeHtml(this._listFilter)}" autocomplete="off">
          </div>
        </div>
        <div class="pos-pedido-cards" id="pos-pedido-cards">${this.renderListCardsHtml()}</div>
        <button type="button" class="btn-onneb-nuevo-fab pos-list-fab-nuevo" id="btn-pos-list-nuevo"
          aria-label="Nuevo pedido" title="Nuevo pedido">
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
                <img src="/icons/icon-72.png" width="40" height="40" alt="OnneB" class="pos-header-logo">
              </div>
              <div class="pos-header-doc-label small fw-semibold" id="pos-header-doc">${this.escapeHtml(this.docLabel())}</div>
              ${DocFecha.renderField('pos-doc-fecha', this._pedido?.header)}
              <div class="pos-header-summary ms-auto text-end">
                <h3 class="pos-header-total mb-0" id="pos-header-total">Q 0.00</h3>
                <div class="pos-header-items" id="pos-header-items">0 items</div>
              </div>
            </div>
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
              <div class="input-group input-group-sm mb-2 pos-search-group">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control pos-search-glow" id="pos-product-search"
                  placeholder="Código o descripción…" autocomplete="off"${editable ? '' : ' disabled'}>
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
                <input type="search" class="form-control form-control-sm pos-search-glow" id="pos-cliente-search"
                  placeholder="Buscar cliente…" autocomplete="off"${editable ? '' : ' disabled'}>
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
            </div>
          </div>
        </div>
        ${editable ? `
        <button type="button" class="pos-fab-finalizar" id="btn-pos-finalizar">
          <i class="fa-solid fa-check me-2"></i>Finalizar
        </button>` : ''}
      </div>`;
  },

  bindListEvents() {
    const search = this._container?.querySelector('#pos-list-search');
    search?.addEventListener('input', () => {
      this._listFilter = search.value;
      this.refreshListDom();
    });

    this._container?.querySelector('#pos-pedido-cards')?.addEventListener('click', async (e) => {
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
        else if (action === 'imprimir') await this.imprimirPedido(coddoc, correlativo);
        else if (action === 'bloquear') await this.bloquearPedido(coddoc, correlativo);
      } catch (err) {
        F.toast(err.message || 'Error', 'error');
      }
    });

    this._container?.querySelector('#btn-pos-list-nuevo')?.addEventListener('click', () => this.onNuevoPedido());
  },

  bindEditorEvents() {
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
      const med = item.getAttribute('data-codmedida');
      const row = this._productos.find(
        (p) => String(p.CODPROD) === String(cod) && String(p.CODMEDIDA) === String(med)
      );
      if (row) this.onProductClick(row);
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
    F.toast('Cliente actualizado', 'success');
  },

  async showList() {
    this._screen = 'list';
    this._pedido = null;
    await this.fetchPedidosList();
    this._container.innerHTML = this.renderListScreen();
    this.bindListEvents();
  },

  async showEditor(coddoc, correlativo) {
    this._screen = 'editor';
    this._container.innerHTML = this.renderEditorShell();
    this.bindEditorEvents();
    if (coddoc && correlativo) {
      await this.loadPedido(coddoc, correlativo);
    }
    await this.buscarProductos('');
    this.renderAll();
  },

  async onNuevoPedido() {
    try {
      await this.crearPedido();
      const key = this.docKey();
      if (key) await this.showEditor(key.coddoc, key.correlativo);
    } catch (err) {
      F.toast(err.message || 'Error al crear pedido', 'error');
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
      await this.showList();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
