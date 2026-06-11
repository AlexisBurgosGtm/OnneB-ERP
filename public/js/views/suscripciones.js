/**
 * Vista Suscripciones — cobro mensual de servicios (PRODUCTOS TIPOPROD = S) por cliente.
 */
const SuscripcionesView = {
  _container: null,
  _rows: [],
  _servicios: [],
  _filterQuery: '',
  _filterActivo: '',

  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  apiBase(path = '') {
    const empNit = F.getEmpNit();
    if (!empNit) throw new Error('No hay empresa activa. Cierre sesión e ingrese de nuevo.');
    const base = `/api/suscripciones${path}`;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}empnit=${encodeURIComponent(empNit)}`;
  },

  formatMoney(value) {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });
  },

  clienteLabel(row) {
    const neg = row?.NEGOCIO || '';
    const nom = row?.NOMBRECLIENTE || '';
    if (neg && nom) return `${neg} — ${nom}`;
    return neg || nom || `Cliente #${row?.CODCLIENTE ?? ''}`;
  },

  normalizeSiNo(value) {
    return String(value || 'NO').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
  },

  pagadoButtonHtml(row) {
    const val = this.normalizeSiNo(row.PAGADO_MES);
    const cls = val === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
    return `<button type="button" class="btn btn-sm btn-empleado-activo ${cls}"
      data-action="toggle-pagado" data-id="${row.ID}" data-pagado="${val}" title="Mes actual pagado">${val}</button>`;
  },

  activoButtonHtml(row) {
    const val = this.normalizeSiNo(row.ACTIVO);
    const cls = val === 'SI' ? 'btn-empleado-activo--si' : 'btn-empleado-activo--no';
    return `<span class="badge ${val === 'SI' ? 'text-bg-success' : 'text-bg-secondary'}">${val}</span>`;
  },

  mesesDebeControls(row) {
    const id = row.ID;
    const n = Math.max(0, parseInt(row.MESES_DEBE, 10) || 0);
    return `<div class="d-flex align-items-center gap-1 justify-content-center sus-meses-wrap">
      <button type="button" class="btn btn-outline-secondary btn-sm sus-meses-btn" data-action="meses-minus" data-id="${id}">−</button>
      <span class="px-1 fw-semibold sus-meses-val" data-id="${id}">${n}</span>
      <button type="button" class="btn btn-outline-secondary btn-sm sus-meses-btn" data-action="meses-plus" data-id="${id}">+</button>
    </div>`;
  },

  renderTableBodyHtml(rows) {
    if (!rows.length) {
      return `<tr><td colspan="8" class="text-center text-muted py-4">Sin suscripciones registradas</td></tr>`;
    }
    return rows
      .map((row) => {
        const deuda = (Number(row.MESES_DEBE) || 0) * (Number(row.COBRO_MENSUAL) || 0);
        return `<tr>
          <td class="small">${this.escapeHtml(this.clienteLabel(row))}<br>
            <span class="text-muted">#${this.escapeHtml(row.CODCLIENTE)} · ${this.escapeHtml(row.NIT || '')}</span></td>
          <td class="small">${this.escapeHtml(row.DESPROD || row.CODPROD)}<br>
            <span class="text-muted">${this.escapeHtml(row.CODPROD)}</span></td>
          <td class="text-end">${this.escapeHtml(this.formatMoney(row.COBRO_MENSUAL))}</td>
          <td class="text-center">${this.pagadoButtonHtml(row)}</td>
          <td class="text-center">${this.mesesDebeControls(row)}</td>
          <td class="text-end small">${this.escapeHtml(this.formatMoney(deuda))}</td>
          <td class="text-center">${this.activoButtonHtml(row)}</td>
          <td class="text-end">${CatalogosUI.accionesRow(row.ID, 'id')}</td>
        </tr>`;
      })
      .join('');
  },

  badgeText(shown, total) {
    const empNombre = F.getEmpNitNombre();
    const extra = empNombre ? ` · ${empNombre}` : '';
    const q = this._filterQuery.trim();
    let countLabel;
    if (q && shown !== total) countLabel = `${shown} de ${total} suscripción(es)`;
    else countLabel = `${total} suscripción(es)`;
    return `<i class="fa-solid fa-repeat me-1"></i>${countLabel}${this.escapeHtml(extra)}`;
  },

  async fetchServicios() {
    const data = await F.fetchJson(`${this.apiBase('/lookups/servicios')}&_=${Date.now()}`, { cache: 'no-store' });
    this._servicios = data.rows || [];
    return this._servicios;
  },

  async fetchRows() {
    const params = new URLSearchParams({ _: String(Date.now()) });
    const q = this._filterQuery.trim();
    if (q) params.set('q', q);
    if (this._filterActivo) params.set('activo', this._filterActivo);
    const data = await F.fetchJson(`${this.apiBase()}&${params}`, { cache: 'no-store' });
    this._rows = data.rows || [];
    return this._rows;
  },

  async buscarClientes(q) {
    const emp = F.getEmpNit();
    const params = new URLSearchParams({ empnit: emp, q, limit: '20', habilitado: 'SI', _: Date.now() });
    const data = await F.fetchJson(`/api/clientes?${params}`);
    return data.rows || [];
  },

  buildFormHtml(row = {}, isEdit = false) {
    const servOpts = this._servicios
      .map((s) => {
        const sel = String(s.CODPROD) === String(row.CODPROD) ? ' selected' : '';
        const precio = s.PRECIO_REF != null ? ` — ${this.formatMoney(s.PRECIO_REF)}` : '';
        return `<option value="${this.escapeHtml(s.CODPROD)}" data-precio="${s.PRECIO_REF ?? ''}"${sel}>${this.escapeHtml(s.DESPROD)} (${this.escapeHtml(s.CODPROD)})${this.escapeHtml(precio)}</option>`;
      })
      .join('');

    const pagado = this.normalizeSiNo(row.PAGADO_MES);
    const activo = this.normalizeSiNo(row.ACTIVO || 'SI');
    const cobro = row.COBRO_MENSUAL ?? '';
    const meses = row.MESES_DEBE ?? 0;
    const obs = row.OBS ?? '';
    const fecha = row.FECHA_INICIO ? String(row.FECHA_INICIO).slice(0, 10) : '';
    const clienteLabel = row.CODCLIENTE ? this.clienteLabel(row) : '';

    return `
      <div class="mb-2 position-relative">
        <label class="form-label small mb-1">Cliente</label>
        <input type="search" class="form-control form-control-sm" id="sus-form-cliente-search"
          placeholder="Buscar por nombre, negocio o NIT…" value="${this.escapeHtml(clienteLabel)}" autocomplete="off"
          ${isEdit ? 'readonly' : ''}>
        <input type="hidden" id="sus-form-codcliente" value="${this.escapeHtml(row.CODCLIENTE ?? '')}">
        <div id="sus-form-cliente-results" class="list-group position-absolute w-100 shadow-sm d-none sus-cliente-results"></div>
      </div>
      <div class="mb-2">
        <label class="form-label small mb-1">Servicio (TIPO = S)</label>
        <select class="form-select form-select-sm" id="sus-form-codprod" required>
          <option value="">— Seleccione servicio —</option>
          ${servOpts}
        </select>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6">
          <label class="form-label small mb-1">Cobro mensual</label>
          <input type="number" class="form-control form-control-sm" id="sus-form-cobro" min="0" step="0.01"
            value="${this.escapeHtml(cobro)}" required>
        </div>
        <div class="col-6">
          <label class="form-label small mb-1">Meses que debe</label>
          <input type="number" class="form-control form-control-sm" id="sus-form-meses" min="0" step="1"
            value="${this.escapeHtml(meses)}">
        </div>
      </div>
      <div class="row g-2 mb-2">
        <div class="col-6">
          <label class="form-label small mb-1">Pagado este mes</label>
          <select class="form-select form-select-sm" id="sus-form-pagado">
            <option value="SI"${pagado === 'SI' ? ' selected' : ''}>SI</option>
            <option value="NO"${pagado === 'NO' ? ' selected' : ''}>NO</option>
          </select>
        </div>
        <div class="col-6">
          <label class="form-label small mb-1">Activa</label>
          <select class="form-select form-select-sm" id="sus-form-activo">
            <option value="SI"${activo === 'SI' ? ' selected' : ''}>SI</option>
            <option value="NO"${activo === 'NO' ? ' selected' : ''}>NO</option>
          </select>
        </div>
      </div>
      <div class="mb-2">
        <label class="form-label small mb-1">Fecha inicio</label>
        <input type="date" class="form-control form-control-sm" id="sus-form-fecha" value="${this.escapeHtml(fecha)}">
      </div>
      <div class="mb-0">
        <label class="form-label small mb-1">Observaciones</label>
        <textarea class="form-control form-control-sm" id="sus-form-obs" rows="2">${this.escapeHtml(obs)}</textarea>
      </div>
    `;
  },

  readFormData() {
    return {
      CODCLIENTE: parseInt(document.getElementById('sus-form-codcliente')?.value, 10),
      CODPROD: document.getElementById('sus-form-codprod')?.value?.trim(),
      COBRO_MENSUAL: Number(document.getElementById('sus-form-cobro')?.value),
      MESES_DEBE: parseInt(document.getElementById('sus-form-meses')?.value, 10) || 0,
      PAGADO_MES: document.getElementById('sus-form-pagado')?.value,
      ACTIVO: document.getElementById('sus-form-activo')?.value,
      FECHA_INICIO: document.getElementById('sus-form-fecha')?.value || null,
      OBS: document.getElementById('sus-form-obs')?.value?.trim() || '',
    };
  },

  bindFormClienteSearch() {
    const search = document.getElementById('sus-form-cliente-search');
    const hidden = document.getElementById('sus-form-codcliente');
    const list = document.getElementById('sus-form-cliente-results');
    if (!search || !hidden || search.readOnly) return;

    const run = F.debounce(async () => {
      const q = search.value.trim();
      if (q.length < 2) {
        list.classList.add('d-none');
        return;
      }
      try {
        const rows = await this.buscarClientes(q);
        if (!rows.length) {
          list.innerHTML = '<div class="list-group-item small text-muted">Sin resultados</div>';
        } else {
          list.innerHTML = rows
            .map(
              (c) =>
                `<button type="button" class="list-group-item list-group-item-action small sus-cliente-pick"
                  data-codcliente="${c.CODCLIENTE}">
                  <strong>${this.escapeHtml(c.NEGOCIO || c.NOMBRECLIENTE)}</strong>
                  <span class="text-muted d-block">#${this.escapeHtml(c.CODCLIENTE)} · ${this.escapeHtml(c.NOMBRECLIENTE || '')} · ${this.escapeHtml(c.NIT || '')}</span>
                </button>`
            )
            .join('');
        }
        list.classList.remove('d-none');
      } catch (err) {
        list.innerHTML = `<div class="list-group-item text-danger small">${this.escapeHtml(err.message)}</div>`;
        list.classList.remove('d-none');
      }
    }, 300);

    search.addEventListener('input', run);
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.sus-cliente-pick');
      if (!btn) return;
      hidden.value = btn.getAttribute('data-codcliente');
      search.value = btn.querySelector('strong')?.textContent?.trim() || '';
      list.classList.add('d-none');
    });
  },

  bindFormServicioPrecio() {
    const sel = document.getElementById('sus-form-codprod');
    const cobro = document.getElementById('sus-form-cobro');
    if (!sel || !cobro) return;
    sel.addEventListener('change', () => {
      const opt = sel.selectedOptions[0];
      const precio = opt?.getAttribute('data-precio');
      if (precio && !cobro.value) cobro.value = precio;
      else if (precio && Number(cobro.value) === 0) cobro.value = precio;
    });
  },

  async showForm(title, row = {}, isEdit = false) {
    const { value } = await Swal.fire({
      ...CatalogosUI.modalBase(),
      title,
      html: this.buildFormHtml(row, isEdit),
      width: '32rem',
      showCancelButton: true,
      confirmButtonText: CatalogosUI.guardarButtonHtml('Guardar'),
      cancelButtonText: CatalogosUI.cancelButtonHtml('Cancelar'),
      focusConfirm: false,
      didOpen: () => {
        this.bindFormClienteSearch();
        this.bindFormServicioPrecio();
      },
      preConfirm: () => {
        const data = this.readFormData();
        if (!data.CODCLIENTE || Number.isNaN(data.CODCLIENTE)) {
          Swal.showValidationMessage('Seleccione un cliente');
          return false;
        }
        if (!data.CODPROD) {
          Swal.showValidationMessage('Seleccione un servicio');
          return false;
        }
        if (!data.COBRO_MENSUAL || data.COBRO_MENSUAL < 0) {
          Swal.showValidationMessage('Indique el cobro mensual');
          return false;
        }
        if (data.MESES_DEBE < 0) {
          Swal.showValidationMessage('Meses que debe no puede ser negativo');
          return false;
        }
        return data;
      },
    });
    return value;
  },

  findRow(id) {
    const n = Number(id);
    return this._rows.find((r) => Number(r.ID ?? r.Id) === n);
  },

  updateTableView() {
    const tbody = this._container?.querySelector('#suscripciones-tbody');
    const badge = this._container?.querySelector('#suscripciones-count');
    if (tbody) tbody.innerHTML = this.renderTableBodyHtml(this._rows);
    if (badge) badge.innerHTML = this.badgeText(this._rows.length, this._rows.length);
    this.bindRowActions();
  },

  renderPanel() {
    return `
      <div class="suscripciones-panel catalogo-vista-wrap catalogo-empresa-panel">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2 px-1">
          <span class="catalogo-empresa-badge" id="suscripciones-count">${this.badgeText(0, 0)}</span>
          <button type="button" class="btn btn-sm btn-outline-secondary" id="btn-suscripciones-refresh">
            <i class="fa-solid fa-rotate-right me-1"></i>Actualizar
          </button>
        </div>
        <div class="d-flex flex-wrap align-items-end gap-2 mb-2 px-1">
          <div class="catalogo-empresa-search-wrap flex-grow-1">
            <div class="input-group input-group-sm catalogo-empresa-search">
              <span class="input-group-text"><i class="fa-solid fa-magnifying-glass"></i></span>
              <input type="search" class="form-control" id="suscripciones-search"
                placeholder="Buscar cliente, servicio, NIT…" value="${this.escapeHtml(this._filterQuery)}" autocomplete="off">
              <button type="button" class="btn btn-outline-secondary" id="btn-suscripciones-search-clear" title="Limpiar">
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>
          </div>
          <div>
            <label class="small text-muted mb-0" for="suscripciones-filter-activo">Activa:</label>
            <select class="form-select form-select-sm" id="suscripciones-filter-activo" style="min-width: 7rem">
              <option value=""${!this._filterActivo ? ' selected' : ''}>Todas</option>
              <option value="SI"${this._filterActivo === 'SI' ? ' selected' : ''}>SI</option>
              <option value="NO"${this._filterActivo === 'NO' ? ' selected' : ''}>NO</option>
            </select>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-sm table-hover table-striped mb-0">
            <thead class="table-light sticky-top">
              <tr>
                <th>Cliente</th>
                <th>Servicio</th>
                <th class="text-end">Cobro/mes</th>
                <th class="text-center">Pagado mes</th>
                <th class="text-center">Meses debe</th>
                <th class="text-end">Deuda est.</th>
                <th class="text-center">Activa</th>
                <th class="text-end">Acciones</th>
              </tr>
            </thead>
            <tbody id="suscripciones-tbody">${this.renderTableBodyHtml(this._rows)}</tbody>
          </table>
        </div>
        ${CatalogosUI.btnNuevoFab('btn-suscripciones-nuevo')}
      </div>
    `;
  },

  async reload() {
    await this.fetchRows();
    this.updateTableView();
  },

  async onNuevo() {
    const data = await this.showForm('Nueva suscripción');
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Suscripción creada', 'success');
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEditar(id) {
    const row = this.findRow(id);
    if (!row) return;
    const data = await this.showForm('Editar suscripción', row, true);
    if (!data) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      F.toast('Suscripción actualizada', 'success');
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onEliminar(id) {
    const row = this.findRow(id);
    const label = row ? `${this.clienteLabel(row)} — ${row.DESPROD || row.CODPROD}` : id;
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Eliminar suscripción?',
      html: `<p class="mb-0">${this.escapeHtml(label)}</p>`,
      icon: 'warning',
      confirmText: 'Eliminar',
      confirmClass: 'btn-catalogo-eliminar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}`), { method: 'DELETE' });
      F.toast('Suscripción eliminada', 'success');
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onTogglePagado(id, current) {
    const next = this.normalizeSiNo(current) === 'SI' ? 'NO' : 'SI';
    const confirm = await CatalogosUI.fireConfirm({
      title: '¿Cambiar estado de pago?',
      html: `<p class="mb-0">Marcar mes actual como <strong>${next}</strong></p>`,
      icon: 'question',
      confirmText: 'Confirmar',
    });
    if (!confirm) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}/pagado-mes`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ PAGADO_MES: next }),
      });
      F.toast('Estado de pago actualizado', 'success');
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  async onMesesDebe(id, delta) {
    const row = this.findRow(id);
    if (!row) return;
    const current = Math.max(0, parseInt(row.MESES_DEBE, 10) || 0);
    const next = Math.max(0, current + delta);
    if (next === current) return;
    try {
      await F.fetchJson(this.apiBase(`/${encodeURIComponent(id)}/meses-debe`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ MESES_DEBE: next }),
      });
      await this.reload();
    } catch (err) {
      F.alert('Error', err.message, 'error');
    }
  },

  bindRowActions() {
    const tbody = this._container?.querySelector('#suscripciones-tbody');
    if (!tbody) return;
    tbody.querySelectorAll('[data-action="toggle-pagado"]').forEach((btn) => {
      btn.onclick = () => this.onTogglePagado(btn.dataset.id, btn.dataset.pagado);
    });
    tbody.querySelectorAll('[data-action="meses-minus"]').forEach((btn) => {
      btn.onclick = () => this.onMesesDebe(btn.dataset.id, -1);
    });
    tbody.querySelectorAll('[data-action="meses-plus"]').forEach((btn) => {
      btn.onclick = () => this.onMesesDebe(btn.dataset.id, 1);
    });
    tbody.querySelectorAll('.btn-catalogo-editar').forEach((btn) => {
      btn.onclick = () => this.onEditar(btn.dataset.id);
    });
    tbody.querySelectorAll('.btn-catalogo-eliminar').forEach((btn) => {
      btn.onclick = () => this.onEliminar(btn.dataset.id);
    });
  },

  bindEvents() {
    document.getElementById('btn-suscripciones-nuevo')?.addEventListener('click', () => this.onNuevo());
    document.getElementById('btn-suscripciones-refresh')?.addEventListener('click', () => this.reload());
    const search = document.getElementById('suscripciones-search');
    const clearBtn = document.getElementById('btn-suscripciones-search-clear');
    const activoSel = document.getElementById('suscripciones-filter-activo');
    if (search) {
      const apply = F.debounce(() => {
        this._filterQuery = search.value;
        this.reload();
      }, 350);
      search.addEventListener('input', apply);
      search.addEventListener('search', apply);
    }
    clearBtn?.addEventListener('click', () => {
      if (search) search.value = '';
      this._filterQuery = '';
      this.reload();
      search?.focus();
    });
    activoSel?.addEventListener('change', () => {
      this._filterActivo = activoSel.value;
      this.reload();
    });
  },

  async load(container) {
    this._container = container;
    this._filterQuery = '';
    this._filterActivo = '';
    container.classList.remove('align-items-center', 'justify-content-center');
    container.classList.add('align-items-stretch', 'justify-content-start', 'p-3');

    if (!F.getEmpNit()) {
      container.innerHTML = `
        <div class="alert alert-warning m-3 w-100">
          <i class="fa-solid fa-triangle-exclamation me-2"></i>
          No hay empresa activa. Cierre sesión e ingrese de nuevo.
        </div>`;
      return;
    }

    container.innerHTML = `<div class="text-center text-muted py-4 w-100"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando…</div>`;

    try {
      await Promise.all([this.fetchServicios(), this.fetchRows()]);
      container.innerHTML = this.renderPanel();
      this.bindEvents();
      this.bindRowActions();
    } catch (err) {
      container.innerHTML = `
        <div class="alert alert-danger m-3 w-100">
          <i class="fa-solid fa-circle-exclamation me-2"></i>${this.escapeHtml(err.message)}
        </div>`;
    }
  },
};
