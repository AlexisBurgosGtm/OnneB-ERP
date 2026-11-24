/**
 * Panel receta médica (carrito en memoria) para consultorio.
 */
const ConsultorioRecetaPanel = {
  _host: null,
  _lines: [],
  _readonly: false,
  _linkedDoc: null,
  _lastSearchResults: [],
  _searchBound: false,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Q 0.00';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  labelDosis(ln) {
    const v = String(ln?.DOSIS ?? ln?.NOSERIE ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  labelDuracion(ln) {
    const v = String(ln?.DURACION ?? ln?.OBS ?? '').trim();
    return v && v.toUpperCase() !== 'SN' ? v : '—';
  },

  productApiUrl(q) {
    const emp = F.getEmpNit();
    const qs = new URLSearchParams({ empnit: emp, q: q || '', limit: '30', _: String(Date.now()) });
    return `/api/consultorio/recetas/productos?${qs}`;
  },

  reset() {
    this._lines = [];
    this._readonly = false;
    this._linkedDoc = null;
    this._lastSearchResults = [];
    this._searchBound = false;
  },

  setReadonly(linkedDoc) {
    this._readonly = true;
    this._linkedDoc = linkedDoc || null;
  },

  setLinesFromServer(lines) {
    this._lines = (lines || []).map((ln) => ({
      CODPROD: ln.CODPROD,
      CODMEDIDA: ln.CODMEDIDA,
      DESPROD: ln.DESPROD,
      CANTIDAD: Number(ln.CANTIDAD) || 1,
      PRECIO: Number(ln.PRECIO) || 0,
      TOTALPRECIO: Number(ln.TOTALPRECIO) || 0,
      DOSIS: this.labelDosis(ln) === '—' ? '' : this.labelDosis(ln),
      DURACION: this.labelDuracion(ln) === '—' ? '' : this.labelDuracion(ln),
      NOSERIE: ln.NOSERIE,
      OBS: ln.OBS,
    }));
    this._readonly = true;
  },

  getLinesForSave() {
    if (this._readonly) return [];
    return this._lines.map((ln) => ({
      CODPROD: ln.CODPROD,
      CODMEDIDA: ln.CODMEDIDA,
      CANTIDAD: ln.CANTIDAD,
      PRECIO: ln.PRECIO,
      NOSERIE: ln.DOSIS || ln.NOSERIE || '',
      OBS: ln.DURACION || ln.OBS || '',
    }));
  },

  totalPrecio() {
    return this._lines.reduce(
      (acc, ln) => acc + (Number(ln.TOTALPRECIO) || Number(ln.PRECIO) * Number(ln.CANTIDAD) || 0),
      0
    );
  },

  html() {
    const readOnlyBadge = this._readonly
      ? `<span class="badge text-bg-light border ms-1 small">Solo lectura${
          this._linkedDoc ? ` · ${this.escapeHtml(this._linkedDoc)}` : ''
        }</span>`
      : '';
    return `
      <div class="cons-receta-panel d-flex flex-column h-100"${this._readonly ? ' data-readonly="1"' : ''}>
        <div class="cons-receta-search mb-2 position-relative${this._readonly ? ' d-none' : ''}">
          <div class="input-group input-group-sm pos-search-group">
            <span class="input-group-text"><i class="fa-solid fa-barcode" aria-hidden="true"></i></span>
            <input type="search" class="form-control form-control-sm pos-search-glow" id="cons-receta-product-search"
              placeholder="Buscar producto (Enter)…" autocomplete="off" spellcheck="false">
          </div>
          <div id="cons-receta-product-list" class="list-group shadow-sm d-none cons-receta-prod-results" role="listbox"></div>
        </div>
        <div class="table-responsive flex-grow-1 cons-receta-cart-wrap">
          <table class="table table-sm table-hover mb-0 cons-receta-cart">
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Dosis</th>
                <th>Duración</th>
                <th class="text-end text-nowrap">Cant.</th>
                <th class="text-end text-nowrap">Total</th>
                ${this._readonly ? '' : '<th class="text-end"></th>'}
              </tr>
            </thead>
            <tbody id="cons-receta-cart-tbody"></tbody>
          </table>
        </div>
        <div class="d-flex justify-content-between align-items-center border-top pt-2 mt-2 small">
          <span class="text-muted">Total receta${readOnlyBadge}</span>
          <strong id="cons-receta-total">${this.escapeHtml(this.formatMoney(this.totalPrecio()))}</strong>
        </div>
      </div>`;
  },

  mount(hostEl) {
    this._host = hostEl;
    if (!hostEl) return;
    hostEl.innerHTML = this.html();
    this.renderCart();
    if (!this._readonly) this.bindSearch();
    this.bindCart();
  },

  renderCart() {
    const tbody = this._host?.querySelector('#cons-receta-cart-tbody');
    const totalEl = this._host?.querySelector('#cons-receta-total');
    if (!tbody) return;
    const colSpan = this._readonly ? 5 : 6;
    if (!this._lines.length) {
      tbody.innerHTML = `<tr><td colspan="${colSpan}" class="text-center text-muted small py-3">Sin medicamentos</td></tr>`;
    } else {
      tbody.innerHTML = this._lines
        .map((ln, idx) => {
          const total = Number(ln.TOTALPRECIO) || Number(ln.PRECIO) * Number(ln.CANTIDAD);
          return `<tr data-idx="${idx}">
            <td class="small">
              <div>${this.escapeHtml(ln.DESPROD || ln.CODPROD)}</div>
              <span class="text-muted" style="font-size:.68rem">${this.escapeHtml(ln.CODMEDIDA || '')}</span>
            </td>
            <td class="small">${this.escapeHtml(this.labelDosis(ln))}</td>
            <td class="small">${this.escapeHtml(this.labelDuracion(ln))}</td>
            <td class="text-end text-nowrap small">${Number(ln.CANTIDAD).toLocaleString('es-GT')}</td>
            <td class="text-end text-nowrap small">${this.escapeHtml(this.formatMoney(total))}</td>
            ${
              this._readonly
                ? ''
                : `<td class="text-end">
              <button type="button" class="btn btn-link btn-sm text-danger p-0 cons-receta-del" data-idx="${idx}" title="Quitar">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </td>`
            }
          </tr>`;
        })
        .join('');
    }
    if (totalEl) totalEl.textContent = this.formatMoney(this.totalPrecio());
  },

  async promptLineModal(prod) {
    const des = this.escapeHtml(prod.DESPROD || prod.CODPROD);
    const med = this.escapeHtml(prod.CODMEDIDA || '');
    const pre = this.formatMoney(prod.PRECIO);
    const { value } = await Swal.fire({
      ...(typeof CatalogosUI !== 'undefined' ? CatalogosUI.modalBase() : {}),
      title: 'Agregar a receta',
      html: `
        <p class="small text-start mb-2"><strong>${des}</strong><br>
          <span class="text-muted">${med} · ${this.escapeHtml(pre)}</span></p>
        <label class="form-label small mb-0 text-start d-block" for="cons-rx-dosis">Dosis</label>
        <input type="text" id="cons-rx-dosis" class="form-control form-control-sm mb-2"
          placeholder="Ej. 1 cápsula" autocomplete="off">
        <label class="form-label small mb-0 text-start d-block" for="cons-rx-duracion">Duración</label>
        <input type="text" id="cons-rx-duracion" class="form-control form-control-sm"
          placeholder="Ej. Cada 12 horas por 7 días" autocomplete="off">`,
      showCancelButton: true,
      confirmButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.guardarButtonHtml('Agregar') : 'Agregar',
      cancelButtonText:
        typeof CatalogosUI !== 'undefined' ? CatalogosUI.cancelButtonHtml('Cancelar') : 'Cancelar',
      focusConfirm: false,
      didOpen: () => document.getElementById('cons-rx-dosis')?.focus(),
      preConfirm: () => {
        const dosis = String(document.getElementById('cons-rx-dosis')?.value || '').trim();
        const duracion = String(document.getElementById('cons-rx-duracion')?.value || '').trim();
        if (!dosis) {
          Swal.showValidationMessage('Indique la dosis');
          return false;
        }
        if (!duracion) {
          Swal.showValidationMessage('Indique la duración');
          return false;
        }
        return { dosis, duracion };
      },
    });
    return value || null;
  },

  addLine(prod, dosis, duracion) {
    const codprod = String(prod.CODPROD || '').trim();
    const codmedida = String(prod.CODMEDIDA || prod.MEDIDA || '').trim();
    if (!codprod || !codmedida) return;
    const precio = Number(prod.PRECIO ?? prod.PRECIOPUBLICO ?? prod.precio) || 0;
    const desprod = prod.DESPROD || codprod;
    this._lines.push({
      CODPROD: codprod,
      CODMEDIDA: codmedida,
      DESPROD: desprod,
      CANTIDAD: 1,
      PRECIO: precio,
      TOTALPRECIO: precio,
      DOSIS: dosis,
      DURACION: duracion,
    });
    this.renderCart();
  },

  renderSearchResults(rows, list) {
    if (!rows.length) {
      list.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
    } else {
      list.innerHTML = rows
        .map((p) => {
          const precio = this.formatMoney(p.PRECIO);
          const med = this.escapeHtml(p.CODMEDIDA || '');
          const cod = this.escapeHtml(p.CODPROD);
          const medRaw = String(p.CODMEDIDA || '').trim();
          return `
            <button type="button" tabindex="0"
              class="list-group-item list-group-item-action small pos-product-item cons-receta-pick py-2"
              data-codprod="${cod}" data-codmedida="${this.escapeHtml(medRaw)}" role="option">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="text-start min-w-0">
                  <strong class="d-block text-truncate">${this.escapeHtml(p.DESPROD)}</strong>
                  <span class="text-muted">${cod}</span>
                </div>
                <div class="text-end text-nowrap flex-shrink-0">
                  <div class="fw-semibold">${this.escapeHtml(precio)}</div>
                  <div class="text-muted" style="font-size:.7rem">${med}</div>
                </div>
              </div>
            </button>`;
        })
        .join('');
    }
    list.classList.remove('d-none');
  },

  findProductRow(cod, med) {
    const codS = String(cod || '').trim();
    const medS = String(med || '').trim();
    return this._lastSearchResults.find(
      (p) => String(p.CODPROD).trim() === codS && String(p.CODMEDIDA).trim() === medS
    );
  },

  async pickProduct(prod) {
    if (!prod) return;
    const detail = await this.promptLineModal(prod);
    if (!detail) return;
    this.addLine(prod, detail.dosis, detail.duracion);
    const inp = this._host?.querySelector('#cons-receta-product-search');
    const list = this._host?.querySelector('#cons-receta-product-list');
    if (inp) inp.value = '';
    list?.classList.add('d-none');
    inp?.focus();
  },

  bindSearch() {
    const inp = this._host?.querySelector('#cons-receta-product-search');
    const list = this._host?.querySelector('#cons-receta-product-list');
    if (!inp || !list) return;

    const runSearch = async () => {
      const q = inp.value.trim();
      if (q.length < 1) {
        list.classList.add('d-none');
        list.innerHTML = '';
        this._lastSearchResults = [];
        return;
      }
      try {
        const data = await F.fetchJson(this.productApiUrl(q), { cache: 'no-store' });
        const rows = data.rows || data.productos || [];
        this._lastSearchResults = rows;
        this.renderSearchResults(rows, list);
        const first = list.querySelector('.pos-product-item');
        if (first && typeof PosProductKeyboardUI !== 'undefined') {
          PosProductKeyboardUI.focusProductItem(first);
        }
      } catch (err) {
        list.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
        list.classList.remove('d-none');
      }
    };

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const focused = list.querySelector('.pos-product-item:focus');
        if (focused && !list.classList.contains('d-none')) {
          e.preventDefault();
          const cod = focused.getAttribute('data-codprod');
          const med = focused.getAttribute('data-codmedida');
          const prod = this.findProductRow(cod, med);
          if (prod) {
            this.pickProduct(prod).catch((err) => F.toast(err.message, 'error'));
          }
          return;
        }
        e.preventDefault();
        runSearch().catch((err) => F.toast(err.message, 'error'));
      } else if (e.key === 'Escape') {
        list.classList.add('d-none');
      }
    });

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.cons-receta-pick');
      if (!btn) return;
      const prod = this.findProductRow(btn.getAttribute('data-codprod'), btn.getAttribute('data-codmedida'));
      if (prod) {
        this.pickProduct(prod).catch((err) => F.toast(err.message, 'error'));
      }
    });

    if (typeof PosProductKeyboardUI !== 'undefined') {
      PosProductKeyboardUI.bindProductListKeyboard(this._host, 'cons-receta', {
        onPick: (row) => this.pickProduct(row),
        findProductRow: (cod, med) => this.findProductRow(cod, med),
      });
    }

    if (!this._searchBound) {
      this._searchBound = true;
      this._host.addEventListener(
        'mousedown',
        (e) => {
          if (inp.contains(e.target) || list.contains(e.target)) return;
          list.classList.add('d-none');
        },
        true
      );
    }
  },

  bindCart() {
    this._host?.addEventListener('click', (e) => {
      const del = e.target.closest('.cons-receta-del');
      if (!del || this._readonly) return;
      const idx = parseInt(del.getAttribute('data-idx'), 10);
      if (!Number.isFinite(idx)) return;
      this._lines.splice(idx, 1);
      this.renderCart();
    });
  },
};