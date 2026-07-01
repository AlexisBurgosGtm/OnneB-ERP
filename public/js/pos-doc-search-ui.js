/**
 * Búsqueda de productos: panel lateral en desktop, hoja fija en pantallas pequeñas.
 */
const PosDocSearchUI = {
  breakpoint: 992,

  searchPlaceholder: 'Código o descripción… (Enter)',

  searchHintHtml() {
    return '<p class="text-muted small text-center py-3 mb-0">Escriba código o descripción y presione Enter</p>';
  },

  resetProductSearch(view, prefix) {
    if (view) view._productos = [];
    this.setListsHtml(view?._container, prefix, this.searchHintHtml());
  },

  isMobileView() {
    return window.matchMedia(`(max-width: ${this.breakpoint - 0.02}px)`).matches;
  },

  listTargets(container, prefix) {
    const lists = [];
    const desktop = container?.querySelector(`#${prefix}-product-list`);
    if (desktop) lists.push(desktop);
    const mobile =
      document.getElementById(`${prefix}-product-list-modal`) ||
      container?.querySelector(`#${prefix}-product-list-modal`);
    if (mobile && mobile !== desktop) lists.push(mobile);
    return lists;
  },

  searchInputs(container, prefix) {
    const inputs = [];
    const desktop = container?.querySelector(`#${prefix}-product-search`);
    if (desktop) inputs.push(desktop);
    const mobile =
      document.getElementById(`${prefix}-product-search-modal`) ||
      container?.querySelector(`#${prefix}-product-search-modal`);
    if (mobile && mobile !== desktop) inputs.push(mobile);
    return inputs;
  },

  productSheetHtml(prefix) {
    return `
      <div class="pos-product-sheet d-none" id="${prefix}-product-sheet" role="dialog" aria-modal="true"
        aria-labelledby="${prefix}-product-sheet-label" aria-hidden="true">
        <div class="pos-product-sheet-panel">
          <div class="pos-product-sheet-header">
            <h6 class="pos-product-sheet-title" id="${prefix}-product-sheet-label">
              <i class="fa-solid fa-magnifying-glass me-1"></i>Buscar producto
            </h6>
            <button type="button" class="btn-close" id="${prefix}-product-sheet-close"
              aria-label="Cerrar búsqueda"></button>
          </div>
          <div class="pos-product-sheet-body">
            <div class="input-group input-group-sm mb-2 pos-search-group flex-shrink-0">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control pos-search-glow" id="${prefix}-product-search-modal"
                placeholder="${this.searchPlaceholder}" autocomplete="off">
            </div>
            <div class="pos-product-list pos-product-list-modal" id="${prefix}-product-list-modal"></div>
          </div>
        </div>
      </div>`;
  },

  productModalHtml(prefix) {
    return this.productSheetHtml(prefix);
  },

  mobileFabHtml(prefix) {
    return `
      <button type="button" class="pos-fab-agregar" id="${prefix}-fab-add-product"
        aria-label="Agregar producto" title="Agregar producto">
        <i class="fa-solid fa-plus me-1"></i>Agregar
      </button>`;
  },

  barcodeFabHtml(prefix) {
    return `
      <button type="button" class="pos-fab-barcode" id="${prefix}-fab-barcode"
        aria-label="Escanear código de barras" title="Escanear código de barras">
        <i class="fa-solid fa-barcode" aria-hidden="true"></i>
      </button>`;
  },

  fabBarHtml(prefix, finalizarId) {
    const fid = finalizarId || `btn-${prefix}-finalizar`;
    return `
      ${this.barcodeFabHtml(prefix)}
      <div class="pos-fab-bar" id="${prefix}-fab-bar">
        ${this.mobileFabHtml(prefix)}
        <button type="button" class="pos-fab-finalizar" id="${fid}">
          <i class="fa-solid fa-check me-2"></i>Finalizar
        </button>
      </div>`;
  },

  applyBarcodeToSearch(view, prefix, code, buscarProductos) {
    const term = String(code ?? '').trim();
    if (!term || !view) return;
    const container = view._container;
    this.searchInputs(container, prefix).forEach((inp) => {
      inp.value = term;
    });
    if (this.isMobileView()) {
      const sheetEl = view._posProductSheetEl || this.ensureSheet(container, prefix);
      this.showSheet(sheetEl);
      const modalSearch = document.getElementById(`${prefix}-product-search-modal`);
      if (modalSearch) modalSearch.value = term;
    }
    buscarProductos.call(view, term);
  },

  openBarcodeScanner(view, prefix, opts = {}) {
    const getEditable = opts.getEditable || (() => true);
    const buscarProductos = opts.buscarProductos || (() => {});
    if (!getEditable()) return;
    if (typeof BarcodeScannerUI === 'undefined') {
      F.toast('Lector de códigos no disponible', 'warning');
      return;
    }
    BarcodeScannerUI.open({
      onScan: (code) => {
        this.applyBarcodeToSearch(view, prefix, code, buscarProductos);
        F.toast(`Buscando producto: ${code}`, 'info');
      },
    }).catch((err) => F.toast(err.message || 'Error al abrir cámara', 'error'));
  },

  setListsHtml(container, prefix, html) {
    this.listTargets(container, prefix).forEach((el) => {
      el.innerHTML = html;
    });
  },

  syncSearchValues(container, prefix) {
    const inputs = this.searchInputs(container, prefix);
    if (inputs.length < 2) return;
    const val = inputs[0].value;
    inputs.slice(1).forEach((inp) => {
      if (inp.value !== val) inp.value = val;
    });
  },

  showSheet(sheetEl) {
    if (!sheetEl) return;
    sheetEl.classList.remove('d-none');
    sheetEl.setAttribute('aria-hidden', 'false');
    document.body.classList.add('pos-product-sheet-open');
  },

  hideSheet(sheetEl) {
    if (!sheetEl) return;
    sheetEl.classList.add('d-none');
    sheetEl.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('pos-product-sheet-open');
  },

  ensureSheet(container, prefix) {
    let sheetEl = document.getElementById(`${prefix}-product-sheet`);
    if (!sheetEl) {
      const inContainer = container?.querySelector(`#${prefix}-product-sheet`);
      if (inContainer) {
        document.body.appendChild(inContainer);
        sheetEl = inContainer;
      } else {
        const wrap = document.createElement('div');
        wrap.innerHTML = this.productSheetHtml(prefix).trim();
        sheetEl = wrap.firstElementChild;
        document.body.appendChild(sheetEl);
      }
    } else if (sheetEl.parentElement !== document.body) {
      document.body.appendChild(sheetEl);
    }
    return sheetEl;
  },

  teardown(prefix) {
    document.getElementById(`${prefix}-product-sheet`)?.remove();
    document.body.classList.remove('pos-product-sheet-open');
  },

  bind(view, prefix, opts = {}) {
    const container = view._container;
    if (!container) return;

    const getEditable = opts.getEditable || (() => true);
    const buscarProductos = opts.buscarProductos || (() => {});
    const onProductPick = opts.onProductPick || (() => {});
    const findProductRow =
      opts.findProductRow ||
      ((cod, med) =>
        (view._productos || []).find(
          (p) =>
            String(p.CODPROD).trim() === String(cod).trim() &&
            String(p.CODMEDIDA).trim() === String(med).trim()
        ));

    const sheetEl = this.ensureSheet(container, prefix);
    view._posProductSheetEl = sheetEl;

    const handleProductClick = async (e) => {
      const item = e.target.closest('.pos-product-item');
      if (!item) return;
      const cod = item.getAttribute('data-codprod');
      const med = item.getAttribute('data-codmedida');
      const row = findProductRow(cod, med);
      if (!row) return;
      this.hideSheet(sheetEl);
      await onProductPick(row);
    };

    this.listTargets(container, prefix).forEach((list) => {
      list.addEventListener('click', (e) => {
        handleProductClick(e).catch((err) => F.toast(err.message || 'Error', 'error'));
      });
    });

    const runSearch = (q) => {
      this.syncSearchValues(container, prefix);
      const term = String(q ?? '').trim();
      if (!term) {
        this.resetProductSearch(view, prefix);
        return;
      }
      buscarProductos.call(view, term);
    };

    this.searchInputs(container, prefix).forEach((inp) => {
      if (!inp) return;
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch(inp.value.trim());
        }
        if (e.key === 'Escape') {
          this.hideSheet(sheetEl);
        }
      });
    });

    const openSheet = () => {
      if (!getEditable()) return;
      const modalSearch = document.getElementById(`${prefix}-product-search-modal`);
      const desktopSearch = container.querySelector(`#${prefix}-product-search`);
      if (modalSearch && desktopSearch) modalSearch.value = desktopSearch.value;
      this.showSheet(sheetEl);
      window.setTimeout(() => {
        modalSearch?.focus();
      }, 50);
    };

    view._posOpenProductSheet = openSheet;

    container.querySelector(`#${prefix}-fab-add-product`)?.addEventListener('click', openSheet);

    container.querySelector(`#${prefix}-fab-barcode`)?.addEventListener('click', () => {
      this.openBarcodeScanner(view, prefix, { getEditable, buscarProductos });
    });

    sheetEl.querySelector(`#${prefix}-product-sheet-close`)?.addEventListener('click', () => {
      this.hideSheet(sheetEl);
    });

    sheetEl.addEventListener('click', (e) => {
      if (e.target === sheetEl) this.hideSheet(sheetEl);
    });
  },

  syncControls(container, prefix, editable) {
    this.searchInputs(container, prefix).forEach((inp) => {
      if (inp) inp.disabled = !editable;
    });
    const fab = container?.querySelector(`#${prefix}-fab-add-product`);
    if (fab) {
      fab.disabled = !editable;
      fab.classList.toggle('pos-mobile-add-hidden', !editable);
    }
    const barcodeFab = container?.querySelector(`#${prefix}-fab-barcode`);
    if (barcodeFab) {
      barcodeFab.disabled = !editable;
      barcodeFab.style.display = editable ? '' : 'none';
    }
  },
};
