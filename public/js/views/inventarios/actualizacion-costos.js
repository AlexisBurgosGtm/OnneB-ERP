/**
 * Inventarios → Actualización de costos
 * Edita PRODUCTOS.COSTO y recalcula PRECIOS.COSTO = COSTO × EQUIVALE.
 * Soporta carga masiva desde Excel (CODPROD, COSTO).
 */
const ActualizacionCostosView = {
  _container: null,
  _rows: [],
  _totalCount: 0,
  _listTruncated: false,
  _filterQuery: '',
  _loading: false,
  _updatingCodprod: null,
  _fromExcel: false,
  _excelSkipped: [],
  _bulkUpdating: false,

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
    if (this._fromExcel) {
      return `<i class="fa-solid fa-file-excel me-1"></i>${shown} desde Excel`;
    }
    const countLabel =
      this._listTruncated && shown < total ? `Mostrando ${shown} de ${total}` : `${total}`;
    return `<i class="fa-solid fa-tags me-1"></i>${countLabel} producto(s)`;
  },

  async load(container) {
    this._container = container;
    this._fromExcel = false;
    this._excelSkipped = [];
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
    this._fromExcel = false;
    this._excelSkipped = [];
    return data;
  },

  renderRows() {
    if (!this._rows.length) {
      const msg = this._fromExcel
        ? 'El Excel no dejó productos válidos'
        : this._filterQuery.trim()
          ? 'Ningún producto coincide con la búsqueda'
          : 'Sin productos';
      return `<tr><td colspan="5" class="text-center text-muted py-4">${msg}</td></tr>`;
    }
    return this._rows
      .map((row) => {
        const cod = String(row.CODPROD ?? '').trim();
        const busy = this._updatingCodprod === cod || this._bulkUpdating;
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

  renderExcelBanner() {
    if (!this._fromExcel) return '';
    const skipped = this._excelSkipped || [];
    const skipHtml =
      skipped.length > 0
        ? `<details class="mt-2">
             <summary class="small text-muted">Omitidos / avisos (${skipped.length})</summary>
             <ul class="small text-muted mb-0 mt-1">${skipped
               .slice(0, 40)
               .map((s) => `<li>${this.escapeHtml(s)}</li>`)
               .join('')}${
               skipped.length > 40
                 ? `<li>… y ${skipped.length - 40} más</li>`
                 : ''
             }</ul>
           </details>`
        : '';
    return `
      <div class="alert alert-info border py-2 mb-3">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div class="small mb-0">
            Lista cargada desde Excel (${this._rows.length} producto(s)).
            Use <strong>Actualizar todo</strong> para aplicar los costos del archivo.
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="ac-excel-clear">
            Volver al listado normal
          </button>
        </div>
        ${skipHtml}
      </div>`;
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
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div class="d-flex flex-wrap align-items-center gap-2">
                <div class="input-group input-group-sm" style="max-width: 28rem">
                  <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
                  <input type="search" class="form-control" id="ac-search"
                    placeholder="Código o descripción…"
                    value="${this.escapeHtml(this._filterQuery)}" autocomplete="off"
                    ${this._fromExcel ? 'disabled' : ''}>
                  <button type="button" class="btn btn-outline-secondary" id="ac-search-clear" title="Limpiar"
                    ${this._fromExcel ? 'disabled' : ''}>
                    <i class="fa-solid fa-xmark"></i>
                  </button>
                </div>
                <button type="button" class="btn btn-sm btn-outline-secondary" id="ac-refresh"
                  ${this._fromExcel ? 'disabled' : ''}>
                  <i class="fa-solid fa-rotate me-1"></i>Actualizar lista
                </button>
                <span class="small text-muted">Sin búsqueda: 50 registros; escriba para buscar. <strong>Actualizar todo</strong> aplica a todo el catálogo.</span>
              </div>
              <div class="d-flex flex-wrap align-items-center gap-2">
                <button type="button" class="btn btn-sm btn-success" id="ac-bulk-update"
                  ${this._bulkUpdating || (this._fromExcel ? !this._rows.length : this._totalCount <= 0 && !this._rows.length) ? 'disabled' : ''}>
                  ${
                    this._bulkUpdating
                      ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Actualizando…'
                      : '<i class="fa-solid fa-cloud-arrow-up me-1"></i>Actualizar todo'
                  }
                </button>
                <button type="button" class="btn btn-sm btn-outline-success" id="ac-excel-load"
                  ${this._bulkUpdating ? 'disabled' : ''}>
                  <i class="fa-solid fa-file-excel me-1"></i>Cargar desde Excel
                </button>
              </div>
            </div>

            ${this.renderExcelBanner()}

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
    if (input) input.disabled = busy || this._bulkUpdating;
    if (btn) {
      btn.disabled = busy || this._bulkUpdating;
      btn.innerHTML = busy
        ? '<i class="fa-solid fa-spinner fa-spin me-1"></i>Actualizando…'
        : '<i class="fa-solid fa-floppy-disk me-1"></i>Actualizar';
    }
  },

  async reloadList() {
    if (this._loading || this._bulkUpdating) return;
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

  syncRowsFromInputs() {
    const tbody = this._container?.querySelector('#ac-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr[data-codprod]').forEach((tr) => {
      const cod = String(tr.getAttribute('data-codprod') || '').trim();
      const input = tr.querySelector('.ac-costo-input');
      const row = this._rows.find((r) => String(r.CODPROD).trim() === cod);
      if (row && input) {
        const n = Number(input.value);
        if (Number.isFinite(n) && n >= 0) row.COSTO = n;
      }
    });
  },

  async onCargarExcel() {
    if (this._bulkUpdating || this._loading) return;

    const result = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Cargar costos desde Excel',
      width: 480,
      html: `
        <div class="text-start">
          <p class="small text-muted mb-2">
            Elija un archivo <strong>.xls</strong> o <strong>.xlsx</strong> con encabezados
            <code>CODPROD</code> y <code>COSTO</code> (costo unitario) en las dos primeras columnas.
          </p>
          <input type="file" id="ac-excel-file" class="form-control form-control-sm"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Cargar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      preConfirm: () => {
        const input = document.getElementById('ac-excel-file');
        const file = input?.files?.[0];
        if (!file) {
          Swal.showValidationMessage('Seleccione un archivo Excel');
          return false;
        }
        const name = String(file.name || '').toLowerCase();
        if (!name.endsWith('.xls') && !name.endsWith('.xlsx')) {
          Swal.showValidationMessage('Solo se permiten archivos .xls o .xlsx');
          return false;
        }
        return file;
      },
    });

    if (!result.isConfirmed || !result.value) return;
    const file = result.value;

    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Leyendo Excel…',
      html: '<p class="small text-muted mb-0">Procesando archivo y validando productos.</p>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const fd = new FormData();
      fd.append('archivo', file);
      const emp = encodeURIComponent(F.getEmpNit() || '');
      const res = await fetch(`/api/actualizacion-costos/import-excel?empnit=${emp}`, {
        method: 'POST',
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo leer el Excel');
      }
      this._rows = data.rows || [];
      this._totalCount = data.total ?? this._rows.length;
      this._listTruncated = false;
      this._fromExcel = true;
      this._excelSkipped = data.skipped || [];
      this._filterQuery = '';
      Swal.close();
      this.render();
      F.toast(`Excel cargado: ${this._rows.length} producto(s)`, 'success');
    } catch (err) {
      Swal.close();
      F.alert('Error', err.message || 'No se pudo cargar el Excel', 'error');
    }
  },

  collectScreenItems() {
    this.syncRowsFromInputs();
    const all = this._rows.map((r) => ({
      CODPROD: String(r.CODPROD || '').trim(),
      COSTO: Number(r.COSTO),
      DESPROD: r.DESPROD || '',
    }));
    const items = all.filter((r) => r.CODPROD && Number.isFinite(r.COSTO) && r.COSTO > 0);
    const skippedZero = all.filter((r) => r.CODPROD && Number.isFinite(r.COSTO) && r.COSTO === 0).length;
    return { items, skippedZero };
  },

  async onActualizarMasivo() {
    if (this._bulkUpdating) return;

    if (this._fromExcel) {
      await this.onActualizarMasivoLista({
        confirmHtml: (n, skipHtml) =>
          `<p class="mb-0 text-start">Se actualizarán <strong>${n}</strong> producto(s) del Excel
            (PRODUCTOS.COSTO y PRECIOS.COSTO × EQUIVALE).</p>${skipHtml}`,
        endpoint: '/bulk',
        requireItems: true,
      });
      return;
    }

    const { items, skippedZero } = this.collectScreenItems();
    const total = this._totalCount || 0;
    if (!total && !items.length) {
      F.toast('No hay productos para actualizar', 'warning');
      return;
    }

    const skipHtml = skippedZero
      ? `<p class="small text-muted mb-0 mt-2 text-start">En pantalla se omitirán <strong>${skippedZero}</strong> producto(s) con costo cero (el resto del catálogo sí se recalcula).</p>`
      : '';
    const shown = this._rows.length;
    const filterOn = Boolean(String(this._filterQuery || '').trim());
    const totalLabel = !filterOn && total
      ? ` (<strong>${total}</strong>)`
      : '';
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar todos los costos?',
      html: `<p class="mb-0 text-start">Se actualizarán los costos de <strong>todos los productos</strong> de la empresa${totalLabel},
        no solo los ${shown} de esta pantalla.
        Los valores editados aquí se guardan primero; en el resto se usa el costo ya registrado
        (<code>PRECIOS.COSTO = PRODUCTOS.COSTO × EQUIVALE</code>).</p>${skipHtml}`,
      confirmText: 'Sí, actualizar todo',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    await this.runBulkRequest('/all', items, skippedZero, {
      successMessage: (data) => {
        const nProd = data.productos ?? total;
        const nPrecios = data.preciosActualizados ?? 0;
        const nEdit = data.actualizados ?? 0;
        const errN = data.errores ?? 0;
        const omitMsg = skippedZero ? ` Omitidos con costo 0 en pantalla: ${skippedZero}.` : '';
        const extra = nEdit ? ` Guardados desde pantalla: ${nEdit}.` : '';
        return errN
          ? `Catálogo: ${nProd} producto(s), ${nPrecios} precio(s). Con error: ${errN}.${extra}${omitMsg}`
          : `Se actualizaron los costos de todo el catálogo (${nProd} producto(s), ${nPrecios} medida(s)).${extra}${omitMsg}`;
      },
    });
  },

  async onActualizarMasivoLista({ confirmHtml, endpoint, requireItems }) {
    if (this._bulkUpdating || !this._rows.length) return;
    const { items, skippedZero } = this.collectScreenItems();

    if (requireItems && !items.length) {
      F.toast(
        skippedZero
          ? 'No hay productos con costo mayor a cero para actualizar'
          : 'No hay costos válidos para actualizar',
        'warning'
      );
      return;
    }

    const skipHtml = skippedZero
      ? `<p class="small text-muted mb-0 mt-2 text-start">Se omitirán <strong>${skippedZero}</strong> producto(s) con costo cero.</p>`
      : '';
    const ok = await CatalogosUI.fireConfirm({
      title: '¿Actualizar todos los costos?',
      html: confirmHtml(items.length, skipHtml),
      confirmText: 'Sí, actualizar todo',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    await this.runBulkRequest(endpoint, items, skippedZero, {
      successMessage: (data) => {
        const n = data.actualizados ?? 0;
        const errN = data.errores ?? 0;
        const omitMsg = skippedZero ? ` Omitidos con costo 0: ${skippedZero}.` : '';
        return errN
          ? `Actualizados ${n}. Con error: ${errN}.${omitMsg}`
          : `Se actualizaron ${n} costo(s) correctamente.${omitMsg}`;
      },
    });
  },

  async runBulkRequest(endpoint, items, skippedZero, { successMessage }) {
    this._bulkUpdating = true;
    this.render();

    Swal.fire({
      ...CatalogosUI.modalBase(),
      title: 'Actualizando costos…',
      html: '<p class="small text-muted mb-0">Aplicando costos de todo el catálogo. Espere…</p>',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const data = await F.fetchJson(this.apiUrl(endpoint), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      Swal.close();
      const errN = data.errores ?? 0;
      F.toast(successMessage(data), errN ? 'warning' : 'success');
      this._fromExcel = false;
      this._excelSkipped = [];
      this._bulkUpdating = false;
      await this.reloadList();
    } catch (err) {
      Swal.close();
      F.alert('Error', err.message || 'No se pudo actualizar en masa', 'error');
      this._bulkUpdating = false;
      this.render();
    } finally {
      this._bulkUpdating = false;
    }
  },

  bind() {
    const search = this._container?.querySelector('#ac-search');
    let timer = null;
    search?.addEventListener('input', () => {
      if (this._fromExcel) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        this._filterQuery = search.value || '';
        this.reloadList();
      }, 350);
    });
    search?.addEventListener('keydown', (e) => {
      if (this._fromExcel) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(timer);
        this._filterQuery = search.value || '';
        this.reloadList();
      }
    });

    this._container?.querySelector('#ac-search-clear')?.addEventListener('click', () => {
      if (this._fromExcel) return;
      this._filterQuery = '';
      if (search) search.value = '';
      this.reloadList();
    });

    this._container?.querySelector('#ac-refresh')?.addEventListener('click', () => {
      if (this._fromExcel) return;
      this.reloadList();
    });

    this._container?.querySelector('#ac-excel-load')?.addEventListener('click', () => {
      this.onCargarExcel().catch((err) => F.toast(err.message || 'Error', 'error'));
    });

    this._container?.querySelector('#ac-bulk-update')?.addEventListener('click', () => {
      this.onActualizarMasivo().catch((err) => F.toast(err.message || 'Error', 'error'));
    });

    this._container?.querySelector('#ac-excel-clear')?.addEventListener('click', () => {
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
