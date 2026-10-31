/**
 * Facturación POS — misma lógica que Facturación (FAC + FEL), panel de productos tipo comandas (fotos + precarga).
 */
const FacturacionPosView = createFacturacionViewClone({
  _grupo: 'mixto',
  _tituloModulo: 'Facturación POS',
  PRELOAD_PRODUCTOS: 50,

  async fetchProductos(q) {
    return F.fetchJson(
      this.apiUrl('/productos', {
        limit: String(this.PRELOAD_PRODUCTOS),
        campoPrecio: this._precioCampo,
        ...this.productSearchCoddocParam(),
        ...(q ? { q } : { preload: '1' }),
        _: String(Date.now()),
      })
    );
  },

  renderEditorShell() {
    const shell = FacturacionView.renderEditorShell.call(this);
    return shell.replace(
      'class="pos-product-list" id="fac-product-list"',
      'class="pos-product-list crs-product-cards" id="fac-product-list"'
    )
      .replace(
        'placeholder="Código o descripción… (Enter)"',
        'placeholder="Código o descripción… (Enter). Lista inicial al abrir"'
      );
  },

  renderProductList() {
    const targets = PosDocSearchUI.listTargets(this._container, 'fac');
    if (!targets.length) return;
    if (!this._productos.length) {
      const empty =
        '<p class="text-muted small text-center py-3 mb-0">No hay productos para mostrar</p>';
      targets.forEach((el) => {
        el.classList.add('crs-product-cards');
        el.innerHTML = empty;
      });
      return;
    }
    const fallbackSrc = '/icons/icon-72.png';
    const emp = F.getEmpNit();
    const html = this._productos
      .map((p) => {
        const fotoUrl = `/api/productos/${encodeURIComponent(String(p.CODPROD).trim())}/foto?empnit=${encodeURIComponent(emp)}`;
        return `
          <div class="crs-product-card pos-product-item" tabindex="0" role="button"
            data-codprod="${this.escapeHtml(p.CODPROD)}"
            data-codmedida="${this.escapeHtml(p.CODMEDIDA)}"
            aria-label="Agregar ${this.escapeHtml(this.formatProdLabel(p.DESPROD, p.DESMARCA))} ${this.escapeHtml(p.CODMEDIDA)}">
            <div class="crs-product-thumb">
              <img src="${this.escapeHtml(fotoUrl)}" alt="" class="crs-product-thumb-img"
                data-fallback="${this.escapeHtml(fallbackSrc)}"
                onerror="if(!this.dataset.err){this.dataset.err='1';this.src=this.dataset.fallback;}">
            </div>
            <div class="crs-product-body">
              <div class="pos-prod-code small text-muted">${this.escapeHtml(p.CODPROD)} · ${this.escapeHtml(p.CODMEDIDA || '—')}</div>
              <div class="crs-product-name">${this.renderProdNameHtml(p.DESPROD, p.DESMARCA)}</div>
              ${this.renderDesprod2Html(p)}
              <div class="crs-product-meta">
                <span class="pos-prod-price">${this.escapeHtml(this.formatMoney(p.PRECIO))}</span>
                <span class="pos-prod-stock small text-muted">Exist. ${this.escapeHtml(this.formatQty(p.EXISTENCIA))}</span>
                ${PosDocSearchUI.remoteStockButton(p.CODPROD, (v) => this.escapeHtml(v))}
              </div>
            </div>
          </div>
        `;
      })
      .join('');
    targets.forEach((el) => {
      el.classList.add('crs-product-cards');
      el.innerHTML = html;
    });
  },

  async buscarProductos(q) {
    const term = String(q ?? '').trim();
    if (this._loadingProducts) return;
    this._loadingProducts = true;
    const spinner = '<p class="text-muted small text-center py-3"><i class="fa-solid fa-spinner fa-spin"></i></p>';
    PosDocSearchUI.setListsHtml(this._container, 'fac', spinner);
    try {
      const data = await this.fetchProductos(term);
      this._productos = data.rows || [];
      if (!this._productos.length) {
        PosDocSearchUI.setListsHtml(
          this._container,
          'fac',
          term
            ? '<p class="text-muted small text-center py-3 mb-0">Sin resultados para la búsqueda</p>'
            : '<p class="text-muted small text-center py-3 mb-0">No hay productos habilitados</p>'
        );
        return;
      }
      this.renderProductList();
    } catch (err) {
      const errHtml = `<p class="text-danger small text-center py-3">${this.escapeHtml(err.message)}</p>`;
      PosDocSearchUI.setListsHtml(this._container, 'fac', errHtml);
    } finally {
      this._loadingProducts = false;
    }
  },

  async preloadProductos() {
    await this.buscarProductos('');
  },

  bindEditorEvents() {
    FacturacionView.bindEditorEvents.call(this);
    const precioCampoSel = this._container?.querySelector('#fac-precio-campo');
    if (!precioCampoSel) return;
    const clone = precioCampoSel.cloneNode(true);
    precioCampoSel.parentNode.replaceChild(clone, precioCampoSel);
    clone.addEventListener('change', () => {
      if (clone.disabled) return;
      this._precioCampo = clone.value || 'PRECIO';
      const q = this._container?.querySelector('#fac-product-search')?.value?.trim() || '';
      this.buscarProductos(q).catch((err) => F.toast(err.message, 'error'));
    });
  },

  async showEditor(coddoc, correlativo, opts = {}) {
    await FacturacionView.showEditor.call(this, coddoc, correlativo, opts);
    await this.preloadProductos();
  },
});
