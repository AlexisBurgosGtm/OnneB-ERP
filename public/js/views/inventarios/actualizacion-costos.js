/**
 * Inventarios → Actualización de costos
 * Edita PRODUCTOS.COSTO y recalcula PRECIOS.COSTO = COSTO × EQUIVALE.
 */
const ActualizacionCostosView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _loading: false,
  _updatingCodprod: null,

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  formatMoneyInput(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return String(n);
  },

  apiUrl(path = '', params = {}) {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const qs = new URLSearchParams({ empnit: empNit, ...params });
    return `/api/actualizacion-costos${path}?${qs.toString()}`;
  },

  listApiUrl() {
    const params = { _: String(Date.now()) };
    const q = String(this._filterQuery || '').trim();
    if (q) params.q = q;
    return this.apiUrl('', params);
  },

  badgeText() {
    const shown = this._rows.length;
    const total = this._totalCount;
    const countLabel =
      this._listTruncated && shown < total ? `Mostrando ${shown} de ${total}` : `${total}`;
    return `<i class="fa-solid fa-tags me-1"></i>${countLabel} producto(s)`;
  },

  async load(container) {
    this._container = container;
    container.className = 'main-content flex-grow-1 d-flex p-3 align-items-stretch justify-content-start';
    container.innerHTML = `
      <div class="actualizacion-costos-wrap w-100">
        <div class="text-muted small py-4 text-center">
          <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando productos…
        </div>
      </div>`;
    try {
      await this.fetchList();
      this.render();
    } catch (err) {
      container.innerHTML = `
        <div class="actualizacion-costos-wrap w-100">
          <div class="alert alert-danger mb-0">${this.escapeHtml(err.message || 'Error')}</div>
        </div>`;
    }
  },

  async fetchList() {
    const data = await F.fetchJson(this.listApiUrl(), { cache: 'no-store' });
    this._rows = data.rows || [];
    this._totalCount = data.total ?? this._rows.length;
    this._listTruncated = Boolean(data.truncated);
    return data;
  },

  renderRows() {
    if (!this._rows.length) {
      const msg = this._filterQuery.trim()
        ? 'Ningún producto coincide con la búsqueda'
        : 'Sin productos';
      return `<tr><td colspan="5" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return this._rows
      .map((row) => {
        const cod = String(row.CODPROD ?? '').trim();
        const busy = this._updatingCodprod === cod;
        return `
          <tr data-codprod="${this.escapeHtml(cod)}">
            <td class="font-monospace small">${this.escapeHtml(cod)}</td>
            <td>${this.escapeHtml(row.DESPROD ?? '')}</td>
            <td class="text-muted small">${this.escapeHtml(row.DESPROD2 ?? '') || '—'}</td>
            <td style="max-width: 9rem">
              <input type="number" class="form-control form-control-sm ac-costo-input" min="0" step="0.0001"
                value="${this.escapeHtml(this.formatMoneyInput(row.COSTO))}"
                ${busy ? 'disabled' : ''}
                aria-label="Costo de ${this.escapeHtml(cod)}">
            </td>
            <td class="text-end" style="width: 8rem">
              <button type="button" class="btn btn-sm btn-primary ac-btn-actualizar"
                data-codprod="${this.escapeHtml(cod)}" ${busy ? 'disabled' : ''}>
                ${
                  busy
                    ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Actualizando…'
                    : '<i class="fa-solid fa-floppy-disk me-1"></i>Actualizar'
                }
              </button>
            </td>
          </tr>`;
      })
      .join('');
  },

  render() {
    const wrap = this._container?.querySelector('.actualizacion-costos-wrap') || this._container;
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="w-100">
        <div class="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h5 mb-1">Actualización de costos</h2>
            <p class="text-muted small mb-0">
              Edite el costo del producto. Al actualizar se guarda en <code>PRODUCTOS.COSTO</code>
              y se recalcula <code>PRECIOS.COSTO = COSTO × EQUIVALE</code> en todas las medidas.
            </p>
          </div>
          <span class="badge text-bg-light border" id="ac-count">${this.badgeText()}</span>
        </div>

        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
              <div class="input-group input-group-sm" style="max-width: 28rem">
                <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                <input type="search" class="form-control" id="ac-search"
                  placeholder="Código o descripción…"
                  value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
                <button type="button" class="btn btn-outline-secondary" id="ac-search-clear" title="Limpiar">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="ac-refresh">
                <i class="fa-solid fa-rotate me-1"></i>Actualizar lista
              </button>
              <span class="small text-muted">Sin búsqueda: 50 registros; escriba para buscar.</span>
            </div>

            <div class="table-responsive">
              <table class="table table-sm table-hover table-striped align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th scope="col">CODPROD</th>
                    <th scope="col">DESPROD</th>
                    <th scope="col">DESPROD2</th>
                    <th scope="col">COSTO</th>
                    <th scope="col" class="text-end">Acción</th>
                  </tr>
                </thead>
                <tbody id="ac-tbody">${this.renderRows()}</tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;
    this.bind();
  },

  updateRowBusy(codprod, busy) {
    this._updatingCodprod = busy ? codprod : null;
    const tr = this._container?.querySelector(`tr[data-codprod="${CSS.escape(codprod)}"]`);
    if (!tr) return;
    const input = tr.querySelector('.ac-costo-input');
    const btn = tr.querySelector('.ac-btn-actualizar');
    if (input) input.disabled = busy;
    if (btn) {
      btn.disabled = busy;
      btn.innerHTML = busy
        ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Actualizando…'
        : '<i class="fa-solid fa-floppy-disk me-1"></i>Actualizar';
    }
  },

  async reloadList() {
    if (this._loading) return;
    this._loading = true;
    const tbody = this._container?.querySelector('#ac-tbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">
        <i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</td></tr>`;
    }
    try {
      await this.fetchList();
      this.render();
    } catch (err) {
      F.toast(err.message || 'Error al cargar', 'error');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${this.escapeHtml(err.message || 'Error')}</td></tr>`;
      }
    } finally {
      this._loading = false;
    }
  },

  async onActualizar(codprod) {
    const tr = this._container?.querySelector(`tr[data-codprod="${CSS.escape(codprod)}"]`);
    const input = tr?.querySelector('.ac-costo-input');
    const costo = Number(input?.value);
    if (!Number.isFinite(costo) || costo < 0) {
      F.toast('Ingrese un costo válido', 'warning');
      input?.focus();
      return;
    }

    const row = this._rows.find((r) => String(r.CODPROD).trim() === codprod);
    const nombre = row?.DESPROD || codprod;
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar costo?',
      html: `<p class="mb-0 text-start">Se actualizará el costo de <strong>${this.escapeHtml(nombre)}</strong> (${this.escapeHtml(codprod)}) a <strong>${this.escapeHtml(String(costo))}</strong> y se recalcularán los costos de todas las medidas en PRECIOS.</p>`,
      confirmText: 'Sí, actualizar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    this.updateRowBusy(codprod, true);
    try {
      const data = await F.fetchJson(this.apiUrl(`/${encodeURIComponent(codprod)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ COSTO: costo }),
      });
      if (row) row.COSTO = data.COSTO ?? costo;
      if (input) input.value = this.formatMoneyInput(data.COSTO ?? costo);
      F.toast('Costo actualizado correctamente', 'success');
    } catch (err) {
      F.toast(err.message || 'No se pudo actualizar el costo', 'error');
    } finally {
      this.updateRowBusy(codprod, false);
    }
  },

  bind() {
    const search = this._container?.querySelector('#ac-search');
    let timer = null;
    search?.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        this._filterQuery = search.value || '';
        this.reloadList();
      }, 350);
    });
    search?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        this._filterQuery = search.value || '';
        this.reloadList();
      }
    });

    this._container?.querySelector('#ac-search-clear')?.addEventListener('click', () => {
      this._filterQuery = '';
      if (search) search.value = '';
      this.reloadList();
    });

    this._container?.querySelector('#ac-refresh')?.addEventListener('click', () => {
      this.reloadList();
    });

    this._container?.querySelector('#ac-tbody')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.ac-btn-actualizar');
      if (!btn || btn.disabled) return;
      const codprod = String(btn.dataset.codprod || '').trim();
      if (!codprod) return;
      this.onActualizar(codprod).catch(() => {});
    });
  },
};
